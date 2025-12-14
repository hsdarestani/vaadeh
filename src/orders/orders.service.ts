import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DeliveryType, EventActorType, OrderStatus, Prisma } from '@prisma/client';
import { AddressesService } from '../addresses/addresses.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationOrchestrator } from '../notifications/notification.orchestrator';
import { EventLogService } from '../event-log/event-log.service';
import { ProductEventService } from '../event-log/product-event.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { VendorMatchingService } from './vendor-matching.service';

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
    private readonly eventLog: EventLogService,
    private readonly productEvents: ProductEventService,
    private readonly vendorMatching: VendorMatchingService
  ) {}

  async create(userId: string, dto: CreateOrderDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.isBlocked || !user.isActive) {
      throw new UnauthorizedException('اکانت شما فعال نیست');
    }

    if (!dto.items?.length) {
      throw new BadRequestException('Cart items required');
    }

    const variantIds = dto.items.map((item) => item.menuVariantId);
    const variants = await this.prisma.menuVariant.findMany({
      where: {
        id: { in: variantIds },
        isAvailable: true,
        menuItem: { vendor: { isActive: true }, isActive: true }
      },
      include: { menuItem: { include: { vendor: true } } }
    });

    if (variants.length !== variantIds.length) {
      throw new BadRequestException('One or more menu variants are invalid');
    }

    const vendor = variants[0].menuItem.vendor;
    const sameVendor = variants.every((v) => v.menuItem.vendorId === vendor.id);
    if (!sameVendor) {
      throw new BadRequestException('تمام آیتم‌های سبد باید از یک وندور باشند');
    }

    let chosenAddress = dto.addressId
      ? await this.prisma.address.findFirst({ where: { id: dto.addressId, userId } })
      : undefined;

    if (!chosenAddress && dto.addressPayload) {
      chosenAddress = await this.addresses.create(userId, { ...dto.addressPayload, isDefault: false });
    }

    if (!chosenAddress) {
      chosenAddress = await this.addresses.ensureDefaultAddress(userId);
    }

    const locationLat = dto.location?.lat ?? chosenAddress.lat;
    const locationLng = dto.location?.lng ?? chosenAddress.lng;

    const matching = await this.vendorMatching.matchVendor({ vendor, location: { lat: locationLat, lng: locationLng } });

    const subtotal = variants.reduce((sum, variant) => {
      const qty = dto.items.find((i) => i.menuVariantId === variant.id)?.qty ?? 0;
      return sum + Number(variant.price) * qty;
    }, 0);

    const totalPrice = subtotal + matching.deliveryFee;

    const initialStatus = matching.deliveryType === DeliveryType.SNAPP_COD ? OrderStatus.ACCEPTED : OrderStatus.PENDING;

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          userId,
          vendorId: matching.vendor.id,
          addressSnapshot: {
            title: chosenAddress.title,
            lat: chosenAddress.lat,
            lng: chosenAddress.lng,
            fullAddress: chosenAddress.fullAddress
          },
          deliveryType: matching.deliveryType,
          deliveryFee: new Prisma.Decimal(matching.deliveryFee),
          totalPrice: new Prisma.Decimal(totalPrice),
          customerNote: dto.customerNote,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
          locationLat,
          locationLng,
          status: initialStatus,
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
            create: {
              status: initialStatus,
              note:
                matching.deliveryType === DeliveryType.SNAPP_COD
                  ? 'برچسب اسنپ (پس‌کرایه) به دلیل خارج از محدوده'
                  : 'در محدوده ارسال داخلی'
            }
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
      metadata: { deliveryType: matching.deliveryType, deliveryFee: matching.deliveryFee }
    });
    await this.productEvents.track('checkout_completed', {
      actorType: EventActorType.USER,
      actorId: userId,
      orderId: order.id,
      metadata: { deliveryType: matching.deliveryType }
    });

    return order;
  }

  async transition(orderId: string, next: OrderStatus) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.ACCEPTED, OrderStatus.CANCELLED, OrderStatus.REJECTED],
      [OrderStatus.ACCEPTED]: [OrderStatus.DELIVERY_INTERNAL, OrderStatus.DELIVERY_SNAPP, OrderStatus.REJECTED],
      [OrderStatus.DELIVERY_INTERNAL]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
      [OrderStatus.DELIVERY_SNAPP]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
      [OrderStatus.COMPLETED]: [],
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
    if ([OrderStatus.DELIVERY_INTERNAL, OrderStatus.DELIVERY_SNAPP, OrderStatus.COMPLETED].includes(next)) {
      await this.notifications.onDelivery(orderId, next);
    }

    if (next === OrderStatus.COMPLETED) {
      await this.eventLog.logEvent('delivery_completed', {
        orderId,
        vendorId: order.vendorId,
        userId: order.userId
      });
    }

    return updated;
  }

  async getTelegramUser(telegramUserId: number) {
    const user = await this.prisma.user.findUnique({ where: { telegramUserId: telegramUserId.toString() } });
    if (!user || user.isBlocked || !user.isActive) return null;
    return user;
  }

  async listForTelegramUser(telegramUserId: number) {
    const user = await this.getTelegramUser(telegramUserId);
    if (!user) return [];

    return this.prisma.order.findMany({
      where: { userId: user.id },
      include: { vendor: true },
      orderBy: { createdAt: 'desc' },
      take: 5
    });
  }

  async getOrder(orderId: string) {
    return this.prisma.order.findUnique({ where: { id: orderId } });
  }

  async getVendorByChatId(chatId: number) {
    return this.prisma.vendor.findUnique({ where: { telegramChatId: chatId.toString() } });
  }

  async listVendorOpenOrders(vendorId: string) {
    return this.prisma.order.findMany({
      where: { vendorId, status: { in: [OrderStatus.PENDING, OrderStatus.ACCEPTED] } },
      orderBy: { createdAt: 'desc' },
      include: { user: true },
      take: 5
    });
  }

  async listVendorRecentOrders(vendorId: string) {
    return this.prisma.order.findMany({
      where: { vendorId },
      orderBy: { createdAt: 'desc' },
      include: { user: true },
      take: 5
    });
  }
}
