import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import {
  CourierStatus,
  DeliveryProvider,
  DeliverySettlementType,
  DeliveryType,
  EventActorType,
  OrderStatus,
  PaymentStatus,
  Prisma
} from '@prisma/client';
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

    const addressCount = await this.prisma.address.count({ where: { userId } });
    if (!addressCount && !dto.addressPayload) {
      throw new BadRequestException('آدرس برای ثبت سفارش الزامی است');
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

    const requiresCodConfirmation = matching.deliveryProvider === DeliveryProvider.SNAPP;
    if (requiresCodConfirmation && !dto.payAtDelivery) {
      throw new BadRequestException('برای ارسال با پیک اسنپ تایید پرداخت در مقصد الزامی است.');
    }

    const isCOD = Boolean(dto.payAtDelivery) || matching.deliveryProvider === DeliveryProvider.SNAPP;

    const totalPrice = subtotal + matching.deliveryFee;

    const initialStatus = OrderStatus.PLACED;
    const initialPaymentStatus = isCOD ? PaymentStatus.NONE : PaymentStatus.PENDING;
    const initialNote =
      matching.deliveryType === DeliveryType.SNAPP_COURIER_OUT_OF_ZONE
        ? 'برچسب اسنپ (پس‌کرایه) به دلیل خارج از محدوده - نیازمند تایید اپراتور'
        : 'در محدوده ارسال داخلی';
    const paymentNote = isCOD ? 'پرداخت پیک/سفارش در مقصد توسط مشتری (تعهد پس‌کرایه)' : 'پرداخت آنلاین مورد انتظار';

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
          deliveryProvider: matching.deliveryProvider,
          deliveryFee: new Prisma.Decimal(matching.deliveryFee),
          deliveryFeeEstimated:
            matching.deliveryType === DeliveryType.SNAPP_COURIER_OUT_OF_ZONE
              ? new Prisma.Decimal(matching.deliveryFee)
              : undefined,
          deliveryPricing: matching.pricingBreakdown,
          courierStatus: matching.courierStatus ?? CourierStatus.PENDING,
          totalPrice: new Prisma.Decimal(totalPrice),
          customerNote: dto.customerNote,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
          locationLat,
          locationLng,
          status: initialStatus,
          paymentStatus: initialPaymentStatus,
          isCOD,
          deliverySettlementType: isCOD ? DeliverySettlementType.POSTPAID : undefined,
          snappStatus:
            matching.deliveryType === DeliveryType.SNAPP_COURIER_OUT_OF_ZONE
              ? 'PENDING_ADMIN_REVIEW'
              : undefined,
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
              note: `${initialNote} | ${paymentNote}`
            }
          }
        },
        include: { items: true, history: true }
      });
      return created;
    });

    await this.notifications.onOrderCreated(order.id);
    await this.eventLog.logEvent('VENDOR_ASSIGNED', {
      orderId: order.id,
      userId,
      vendorId: vendor.id,
      actorType: EventActorType.SYSTEM,
      metadata: { deliveryProvider: matching.deliveryProvider, distanceKm: matching.distanceKm }
    });
    await this.eventLog.logEvent('ORDER_PLACED', {
      orderId: order.id,
      userId,
      vendorId: vendor.id,
      actorType: EventActorType.USER,
      metadata: {
        deliveryType: matching.deliveryType,
        deliveryProvider: matching.deliveryProvider,
        deliveryFee: matching.deliveryFee,
        isCOD,
        deliveryPricing: matching.pricingBreakdown
      }
    });
    await this.productEvents.track('order_created', {
      actorType: EventActorType.USER,
      actorId: userId,
      orderId: order.id,
      metadata: { deliveryType: matching.deliveryType, deliveryProvider: matching.deliveryProvider, isCOD }
    });
    await this.productEvents.track('vendor_assigned', {
      actorType: EventActorType.SYSTEM,
      actorId: vendor.id,
      orderId: order.id,
      metadata: { deliveryType: matching.deliveryType, deliveryProvider: matching.deliveryProvider }
    });
    if (matching.deliveryType === DeliveryType.SNAPP_COURIER_OUT_OF_ZONE) {
      await this.eventLog.logEvent('OUT_OF_ZONE_SELECTED', {
        orderId: order.id,
        userId,
        vendorId: vendor.id,
        actorType: EventActorType.USER,
        metadata: { deliveryType: matching.deliveryType }
      });
    }
    await this.productEvents.track('checkout_completed', {
      actorType: EventActorType.USER,
      actorId: userId,
      orderId: order.id,
      metadata: { deliveryType: matching.deliveryType }
    });

    return order;
  }

  private validateTransition(current: OrderStatus, next: OrderStatus) {
    const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.DRAFT]: [OrderStatus.PLACED, OrderStatus.CANCELLED],
      [OrderStatus.PLACED]: [OrderStatus.VENDOR_ACCEPTED, OrderStatus.VENDOR_REJECTED, OrderStatus.CANCELLED],
      [OrderStatus.VENDOR_ACCEPTED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
      [OrderStatus.VENDOR_REJECTED]: [],
      [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
      [OrderStatus.READY]: [OrderStatus.COURIER_ASSIGNED, OrderStatus.CANCELLED],
      [OrderStatus.COURIER_ASSIGNED]: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED],
      [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
      [OrderStatus.DELIVERED]: [],
      [OrderStatus.CANCELLED]: []
    };

    const validNext = allowedTransitions[current] ?? [];
    if (!validNext.includes(next)) {
      throw new BadRequestException('Invalid transition');
    }
  }

  async transition(orderId: string, next: OrderStatus, note?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    this.validateTransition(order.status, next);

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: next,
        history: {
          create: { status: next, note }
        }
      }
    });

      await this.eventLog.logEvent('ORDER_STATUS_CHANGE', {
        orderId,
        userId: order.userId,
        vendorId: order.vendorId,
        actorType: EventActorType.SYSTEM,
        metadata: { from: order.status, to: next }
      });

    if (next === OrderStatus.VENDOR_ACCEPTED) {
      await this.notifications.onVendorAccepted(orderId);
      await this.eventLog.logEvent('VENDOR_ACCEPTED', {
        orderId,
        vendorId: order.vendorId,
        userId: order.userId,
        actorType: EventActorType.VENDOR
      });
      await this.productEvents.track('vendor_accepted', {
        actorType: EventActorType.VENDOR,
        actorId: order.vendorId,
        orderId,
        metadata: { previousStatus: order.status }
      });
    }
    if (next === OrderStatus.VENDOR_REJECTED) {
      await this.notifications.onVendorRejected(orderId);
      await this.eventLog.logEvent('VENDOR_REJECTED', {
        orderId,
        vendorId: order.vendorId,
        userId: order.userId,
        actorType: EventActorType.VENDOR
      });
      await this.productEvents.track('canceled', {
        actorType: EventActorType.VENDOR,
        actorId: order.vendorId,
        orderId,
        metadata: { reason: 'vendor_rejected' }
      });
    }
    if (
      [OrderStatus.READY, OrderStatus.COURIER_ASSIGNED, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED].includes(
        next
      )
    ) {
      await this.notifications.onDelivery(orderId, next);
    }

    if (next === OrderStatus.OUT_FOR_DELIVERY) {
      await this.productEvents.track('out_for_delivery', {
        actorType: EventActorType.SYSTEM,
        actorId: order.vendorId,
        orderId
      });
    }

    if (next === OrderStatus.DELIVERED) {
      await this.eventLog.logEvent('DELIVERED', {
        orderId,
        vendorId: order.vendorId,
        userId: order.userId,
        actorType: EventActorType.SYSTEM
      });
      await this.productEvents.track('delivered', {
        actorType: EventActorType.SYSTEM,
        actorId: order.vendorId,
        orderId
      });
    }

    if (next === OrderStatus.CANCELLED) {
      await this.productEvents.track('canceled', {
        actorType: EventActorType.SYSTEM,
        actorId: order.userId,
        orderId,
        metadata: { from: order.status }
      });
    }

    return updated;
  }

  async listForUser(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        vendor: true,
        items: { include: { menuVariant: { include: { menuItem: true } } } },
        history: { orderBy: { changedAt: 'asc' } }
      }
    });
  }

  async getForUser(orderId: string, userId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        vendor: true,
        items: { include: { menuVariant: { include: { menuItem: true } } } },
        history: { orderBy: { changedAt: 'asc' } }
      }
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
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
      where: {
        vendorId,
        status: {
          in: [OrderStatus.PLACED, OrderStatus.VENDOR_ACCEPTED, OrderStatus.PREPARING, OrderStatus.READY]
        }
      },
      orderBy: { createdAt: 'desc' },
      include: { user: true, items: { include: { menuVariant: { include: { menuItem: true } } } } },
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
