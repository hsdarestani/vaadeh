import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DeliveryType, OrderStatus, Prisma } from '@prisma/client';
import { AddressesService } from '../addresses/addresses.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationOrchestrator } from '../notifications/notification.orchestrator';
import { EventLogService } from '../event-log/event-log.service';
import { CreateOrderDto } from './dto/create-order.dto';

interface CartItem {
  menuVariantId: string;
  qty: number;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly addresses: AddressesService,
    private readonly notifications: NotificationOrchestrator,
    private readonly eventLog: EventLogService
  ) {}

  private getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  async create(userId: string, dto: CreateOrderDto) {
    const defaultAddress = await this.addresses.ensureDefaultAddress(userId);

    if (!dto.items?.length) {
      throw new BadRequestException('Cart items required');
    }

    const variantIds = dto.items.map((item) => item.menuVariantId);
    const variants = await this.prisma.menuVariant.findMany({
      where: { id: { in: variantIds }, menuItem: { vendor: { isActive: true } } },
      include: { menuItem: { include: { vendor: true } } }
    });

    if (variants.length !== variantIds.length) {
      throw new BadRequestException('One or more menu variants are invalid');
    }

    const vendor = variants[0].menuItem.vendor;
    const distance = this.getDistanceKm(defaultAddress.lat, defaultAddress.lng, vendor.lat, vendor.lng);
    const deliveryType = distance <= vendor.serviceRadiusKm ? DeliveryType.IN_RANGE : DeliveryType.OUT_OF_RANGE_SNAPP;

    const subtotal = variants.reduce((sum, variant) => {
      const qty = dto.items.find((i) => i.menuVariantId === variant.id)?.qty ?? 0;
      return sum + Number(variant.price) * qty;
    }, 0);

    const deliveryFee = deliveryType === DeliveryType.IN_RANGE ? 0 : Number(process.env.SNAPP_DELIVERY_FEE ?? 0);
    const totalPrice = subtotal + deliveryFee;

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          userId,
          vendorId: vendor.id,
          addressSnapshot: {
            title: defaultAddress.title,
            lat: defaultAddress.lat,
            lng: defaultAddress.lng,
            fullAddress: defaultAddress.fullAddress
          },
          deliveryType,
          deliveryFee: new Prisma.Decimal(deliveryFee),
          totalPrice: new Prisma.Decimal(totalPrice),
          status: OrderStatus.WAITING_FOR_PAYMENT,
          items: {
            create: dto.items.map((item) => {
              const variant = variants.find((v) => v.id === item.menuVariantId) as (typeof variants)[0];
              return {
                qty: item.qty,
                unitPrice: variant.price,
                menuVariantId: variant.id
              };
            })
          },
          history: {
            create: { status: OrderStatus.WAITING_FOR_PAYMENT }
          }
        },
        include: { items: true, history: true }
      });
      return created;
    });

    await this.notifications.onOrderCreated(order.id);
    await this.eventLog.logEvent('order_created', {
      orderId: order.id,
      userId,
      vendorId: vendor.id,
      metadata: { deliveryType }
    });

    return order;
  }

  async transition(orderId: string, next: OrderStatus) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.DRAFT]: [OrderStatus.WAITING_FOR_PAYMENT, OrderStatus.CANCELLED],
      [OrderStatus.WAITING_FOR_PAYMENT]: [OrderStatus.PAID, OrderStatus.CANCELLED],
      [OrderStatus.PAID]: [OrderStatus.SENT_TO_VENDOR, OrderStatus.CANCELLED],
      [OrderStatus.SENT_TO_VENDOR]: [OrderStatus.ACCEPTED, OrderStatus.REJECTED],
      [OrderStatus.ACCEPTED]: [OrderStatus.PREPARING, OrderStatus.REJECTED],
      [OrderStatus.PREPARING]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
      [OrderStatus.DELIVERED]: [],
      [OrderStatus.REJECTED]: [],
      [OrderStatus.CANCELLED]: []
    };

    const validNext = allowedTransitions[order.status];
    if (!validNext.includes(next)) {
      throw new BadRequestException('Invalid transition');
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: next,
        history: {
          create: { status: next }
        }
      }
    });

    await this.eventLog.logEvent('order_status_change', {
      orderId,
      userId: order.userId,
      vendorId: order.vendorId,
      metadata: { from: order.status, to: next }
    });

    if (next === OrderStatus.ACCEPTED) {
      await this.notifications.onVendorAccepted(orderId);
      await this.eventLog.logEvent('vendor_accepted', {
        orderId,
        vendorId: order.vendorId,
        userId: order.userId
      });
    }
    if ([OrderStatus.PREPARING, OrderStatus.DELIVERED].includes(next)) {
      await this.notifications.onDelivery(orderId, next);
      if (next === OrderStatus.DELIVERED) {
        await this.eventLog.logEvent('delivery_completed', {
          orderId,
          vendorId: order.vendorId,
          userId: order.userId
        });
      }
    }

    return updated;
  }

  async listForTelegramUser(telegramUserId: number) {
    const user = await this.prisma.user.findUnique({ where: { telegramUserId: telegramUserId.toString() } });
    if (!user) return [];

    return this.prisma.order.findMany({
      where: { userId: user.id },
      include: { vendor: true },
      orderBy: { createdAt: 'desc' },
      take: 5
    });
  }
}
