import { Injectable, NotFoundException } from '@nestjs/common';
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
import { PrismaService } from '../prisma/prisma.service';
import { NotificationOrchestrator } from '../notifications/notification.orchestrator';
import { NotificationService } from '../notifications/notification.service';
import { EventLogService } from '../event-log/event-log.service';
import { ProductEventService } from '../event-log/product-event.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { CreateMenuVariantDto } from './dto/create-menu-variant.dto';
import { UpdateMenuVariantDto } from './dto/update-menu-variant.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { EventQueryDto } from './dto/event-query.dto';
import { Response } from 'express';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationOrchestrator,
    private readonly eventLog: EventLogService,
    private readonly productEvents: ProductEventService,
    private readonly notificationService: NotificationService
  ) {}

  listVendors() {
    return this.prisma.vendor.findMany({
      include: { menuItems: { include: { variants: true } } },
      orderBy: { createdAt: 'desc' }
    });
  }

  createVendor(dto: CreateVendorDto) {
    return this.prisma.vendor.create({
      data: {
        name: dto.name,
        lat: dto.lat,
        lng: dto.lng,
        serviceRadiusKm: dto.serviceRadiusKm,
        telegramChatId: dto.telegramChatId,
        isActive: dto.isActive ?? true
      }
    });
  }

  async updateVendor(id: string, dto: UpdateVendorDto) {
    const vendor = await this.prisma.vendor.update({ where: { id }, data: dto });
    return vendor;
  }

  async createMenuItem(vendorId: string, dto: CreateMenuItemDto) {
    await this.ensureVendorExists(vendorId);
    return this.prisma.menuItem.create({
      data: {
        vendorId,
        name: dto.name,
        isActive: dto.isActive ?? true
      }
    });
  }

  updateMenuItem(id: string, dto: UpdateMenuItemDto) {
    return this.prisma.menuItem.update({ where: { id }, data: dto });
  }

  async createMenuVariant(menuItemId: string, dto: CreateMenuVariantDto) {
    return this.prisma.menuVariant.create({
      data: {
        menuItemId,
        code: dto.code,
        price: new Prisma.Decimal(dto.price)
      }
    });
  }

  updateMenuVariant(id: string, dto: UpdateMenuVariantDto) {
    return this.prisma.menuVariant.update({
      where: { id },
      data: {
        code: dto.code,
        price: dto.price !== undefined ? new Prisma.Decimal(dto.price) : undefined,
        menuItemId: dto.menuItemId
      }
    });
  }

  listOrders() {
    return this.prisma.order.findMany({
      include: { user: true, vendor: true },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
  }

  async updateOrder(orderId: string, dto: UpdateOrderDto) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { vendor: true, user: true } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const data: Prisma.OrderUpdateInput = {};
    if (dto.totalPrice !== undefined) data.totalPrice = new Prisma.Decimal(dto.totalPrice);
    if (dto.deliveryFee !== undefined) data.deliveryFee = new Prisma.Decimal(dto.deliveryFee);
    if (dto.deliveryFeeFinal !== undefined) data.deliveryFeeFinal = new Prisma.Decimal(dto.deliveryFeeFinal);
    if (dto.adminNote !== undefined) data.adminNote = dto.adminNote;
    if (dto.courierReference !== undefined) data.courierReference = dto.courierReference;
    if (dto.courierStatus !== undefined) data.courierStatus = dto.courierStatus;
    if (dto.deliveryProvider !== undefined) data.deliveryProvider = dto.deliveryProvider;
    if (dto.deliverySettlementType !== undefined) data.deliverySettlementType = dto.deliverySettlementType;
    if (dto.isCOD !== undefined) data.isCOD = dto.isCOD;
    if (dto.deliveryPricing !== undefined) data.deliveryPricing = dto.deliveryPricing as Prisma.InputJsonValue;
    if (dto.status) data.status = dto.status;
    if (dto.status) {
      data.history = { create: { status: dto.status, note: dto.statusNote } };
    }

    const updated = await this.prisma.order.update({ where: { id: orderId }, data });

    if (dto.status) {
      if (dto.status === OrderStatus.VENDOR_ACCEPTED) {
        await this.notifications.onVendorAccepted(orderId);
      }
      if (
        [OrderStatus.READY, OrderStatus.COURIER_ASSIGNED, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED].includes(
          dto.status
        )
      ) {
        await this.notifications.onDelivery(orderId, dto.status);
      }
    }

    if (
      dto.status ||
      dto.totalPrice !== undefined ||
      dto.deliveryFee !== undefined ||
      dto.adminNote !== undefined ||
      dto.deliveryFeeFinal !== undefined ||
      dto.courierReference !== undefined ||
      dto.courierStatus !== undefined ||
      dto.deliveryProvider !== undefined ||
      dto.isCOD !== undefined
    ) {
      await this.eventLog.logEvent('order_admin_override', {
        orderId,
        userId: order.userId,
        vendorId: order.vendorId,
        actorType: EventActorType.ADMIN,
        metadata: {
          previousStatus: order.status,
          nextStatus: dto.status ?? order.status,
          totalPrice: dto.totalPrice ?? order.totalPrice,
          deliveryFee: dto.deliveryFee ?? order.deliveryFee,
          deliveryFeeFinal: dto.deliveryFeeFinal ?? order.deliveryFeeFinal,
          adminNote: dto.adminNote ?? order.adminNote,
          courierReference: dto.courierReference ?? order.courierReference,
          courierStatus: dto.courierStatus ?? order.courierStatus,
          deliveryProvider: dto.deliveryProvider ?? order.deliveryProvider,
          deliverySettlementType: dto.deliverySettlementType ?? order.deliverySettlementType,
          isCOD: dto.isCOD ?? order.isCOD
        }
      });
      await this.productEvents.track('admin_override', {
        actorType: EventActorType.ADMIN,
        orderId,
        metadata: {
          nextStatus: dto.status,
          totalPrice: dto.totalPrice,
          deliveryFee: dto.deliveryFee,
          courierStatus: dto.courierStatus,
          isCOD: dto.isCOD
        }
      });
    }

    return updated;
  }

  async listUsers() {
    return this.prisma.user.findMany({
      include: { orders: { orderBy: { createdAt: 'desc' }, take: 5 } },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
  }

  getUserOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: { vendor: true },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
  }

  async updateUser(userId: string, dto: { isBlocked?: boolean; isActive?: boolean }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.user.update({ where: { id: userId }, data: dto });
    await this.eventLog.logEvent('admin_user_update', {
      userId,
      actorType: EventActorType.ADMIN,
      metadata: { isBlocked: dto.isBlocked ?? user.isBlocked, isActive: dto.isActive ?? user.isActive }
    });
    return updated;
  }

  async kpis() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const since = new Date();
    since.setDate(since.getDate() - 6);

    const [vendorNames, paymentsAggregate, ordersWithHistory, paymentStatusCounts, totalOrders, cancelledOrders] = await Promise.all([
      this.prisma.vendor.findMany({ select: { id: true, name: true } }),
      this.prisma.payment.aggregate({ _sum: { amount: true }, where: { status: PaymentStatus.PAID } }),
      this.prisma.order.findMany({
        where: { createdAt: { gte: since } },
        select: {
          id: true,
          vendorId: true,
          createdAt: true,
          status: true,
          totalPrice: true,
          deliveryFeeFinal: true,
          deliveryFee: true,
          deliveryType: true,
          isCOD: true,
          history: { select: { status: true, changedAt: true } }
        }
      }),
      Promise.all([
        this.prisma.payment.count({ where: { status: PaymentStatus.PENDING } }),
        this.prisma.payment.count({ where: { status: PaymentStatus.PAID } }),
        this.prisma.payment.count({ where: { status: PaymentStatus.FAILED } })
      ]),
      this.prisma.order.count(),
      this.prisma.order.count({ where: { status: { in: [OrderStatus.CANCELLED, OrderStatus.VENDOR_REJECTED] } } })
    ]);

    const vendorLookup = new Map(vendorNames.map((v) => [v.id, v.name]));

    const ordersPerDay: Record<string, number> = {};
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      ordersPerDay[d.toISOString().slice(0, 10)] = 0;
    }
    const dailyBuckets: Record<
      string,
      {
        orders: number;
        gmv: number;
        cancelled: number;
        stageTotals: Record<string, { sum: number; count: number }>;
      }
    > = {};

    const stageTotals: Record<string, { sum: number; count: number }> = {
      placedToAccepted: { sum: 0, count: 0 },
      acceptedToReady: { sum: 0, count: 0 },
      readyToDelivered: { sum: 0, count: 0 },
      placedToDelivered: { sum: 0, count: 0 }
    };

    const vendorPerformance = new Map<
      string,
      {
        vendorId: string;
        vendorName?: string;
        orders: number;
        sales: number;
        rejected: number;
        accepted: number;
        ready: number;
        delivered: number;
        stageTotals: Record<string, { sum: number; count: number }>;
      }
    >();

    const calcDurations = (history: { status: OrderStatus; changedAt: Date }[]) => {
      const timeline = history.reduce((acc, h) => {
        acc[h.status] = h.changedAt;
        return acc;
      }, {} as Record<OrderStatus, Date>);

      const placedAt = timeline[OrderStatus.PLACED];
      const acceptedAt = timeline[OrderStatus.VENDOR_ACCEPTED];
      const readyAt = timeline[OrderStatus.READY];
      const deliveredAt = timeline[OrderStatus.DELIVERED];

      const diffSeconds = (a?: Date, b?: Date) => (a && b ? (b.getTime() - a.getTime()) / 1000 : null);

      return {
        placedToAccepted: diffSeconds(placedAt, acceptedAt),
        acceptedToReady: diffSeconds(acceptedAt, readyAt),
        readyToDelivered: diffSeconds(readyAt, deliveredAt),
        placedToDelivered: diffSeconds(placedAt, deliveredAt)
      };
    };

    const track = (target: { sum: number; count: number }, value: number | null) => {
      if (value !== null && Number.isFinite(value)) {
        target.sum += value;
        target.count += 1;
      }
    };

    ordersWithHistory.forEach((order) => {
      const bucketKey = order.createdAt.toISOString().slice(0, 10);
      const bucket =
        dailyBuckets[bucketKey] ??
        (dailyBuckets[bucketKey] = {
          orders: 0,
          gmv: 0,
          cancelled: 0,
          stageTotals: {
            placedToAccepted: { sum: 0, count: 0 },
            acceptedToReady: { sum: 0, count: 0 },
            readyToDelivered: { sum: 0, count: 0 },
            placedToDelivered: { sum: 0, count: 0 }
          }
        });

      ordersPerDay[bucketKey] = (ordersPerDay[bucketKey] ?? 0) + 1;
      bucket.orders += 1;

      const orderGmv = Number(order.totalPrice ?? 0) + Number(order.deliveryFeeFinal ?? order.deliveryFee ?? 0);
      bucket.gmv += orderGmv;

      if ([OrderStatus.CANCELLED, OrderStatus.VENDOR_REJECTED].includes(order.status)) {
        bucket.cancelled += 1;
      }

      const vendorRow =
        vendorPerformance.get(order.vendorId) ??
        vendorPerformance.set(order.vendorId, {
          vendorId: order.vendorId,
          vendorName: vendorLookup.get(order.vendorId),
          orders: 0,
          sales: 0,
          rejected: 0,
          accepted: 0,
          ready: 0,
          delivered: 0,
          stageTotals: {
            placedToAccepted: { sum: 0, count: 0 },
            acceptedToReady: { sum: 0, count: 0 },
            readyToDelivered: { sum: 0, count: 0 },
            placedToDelivered: { sum: 0, count: 0 }
          }
        }).get(order.vendorId)!;

      vendorRow.orders += 1;
      vendorRow.sales += orderGmv;
      if (order.status === OrderStatus.VENDOR_REJECTED || order.status === OrderStatus.CANCELLED) {
        vendorRow.rejected += 1;
      }
      if (order.status === OrderStatus.VENDOR_ACCEPTED) vendorRow.accepted += 1;
      if (order.status === OrderStatus.READY) vendorRow.ready += 1;
      if (order.status === OrderStatus.DELIVERED) vendorRow.delivered += 1;

      const durations = calcDurations(order.history ?? []);
      Object.entries(durations).forEach(([key, value]) => {
        track(stageTotals[key], value);
        track(bucket.stageTotals[key], value);
        track(vendorRow.stageTotals[key], value);
      });
    });

    const codOrders = ordersWithHistory.filter((o) => o.isCOD).length;
    const prepaidOrders = ordersWithHistory.length - codOrders;
    const ordersThisWeek = ordersWithHistory.length;

    const deliveryMixCounts = ordersWithHistory.reduce(
      (acc, order) => {
        if (order.deliveryType === DeliveryType.SNAPP_COURIER_OUT_OF_ZONE) acc.outOfRange += 1;
        if (order.deliveryType === DeliveryType.IN_ZONE_INTERNAL) acc.inRange += 1;
        return acc;
      },
      { inRange: 0, outOfRange: 0 }
    );

    const paymentRequested = paymentStatusCounts[0];
    const paymentPaid = paymentStatusCounts[1];
    const paymentFailed = paymentStatusCounts[2];

    const stageAverage = (target: { sum: number; count: number }) => (target.count ? target.sum / target.count : 0);

    const dailyKpis = Object.entries(dailyBuckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, bucket]) => ({
        date,
        orders: bucket.orders,
        gmv: bucket.gmv,
        cancelRate: bucket.orders ? bucket.cancelled / bucket.orders : 0,
        averageSeconds: {
          placedToAccepted: stageAverage(bucket.stageTotals.placedToAccepted),
          acceptedToReady: stageAverage(bucket.stageTotals.acceptedToReady),
          readyToDelivered: stageAverage(bucket.stageTotals.readyToDelivered),
          placedToDelivered: stageAverage(bucket.stageTotals.placedToDelivered)
        }
      }));

    const accepted = ordersWithHistory.filter((order) => order.status === OrderStatus.VENDOR_ACCEPTED).length;
    const placed = ordersWithHistory.filter(
      (order) => order.status !== OrderStatus.CANCELLED && order.status !== OrderStatus.VENDOR_REJECTED
    ).length;

    return {
      dailyOrders: ordersPerDay[today.toISOString().slice(0, 10)] ?? 0,
      ordersThisWeek,
      totalSales: Number(paymentsAggregate._sum.amount ?? 0),
      cancelRate: totalOrders ? cancelledOrders / totalOrders : 0,
      acceptanceRate: placed ? accepted / placed : 0,
      vendorPerformance: Array.from(vendorPerformance.values()).map((vendor) => ({
        ...vendor,
        rejectionRate: vendor.orders ? vendor.rejected / vendor.orders : 0,
        averageSeconds: {
          placedToAccepted: stageAverage(vendor.stageTotals.placedToAccepted),
          acceptedToReady: stageAverage(vendor.stageTotals.acceptedToReady),
          readyToDelivered: stageAverage(vendor.stageTotals.readyToDelivered),
          placedToDelivered: stageAverage(vendor.stageTotals.placedToDelivered)
        }
      })),
      deliveryMix: {
        inRange: deliveryMixCounts.inRange,
        outOfRange: deliveryMixCounts.outOfRange,
        outOfZonePercent:
          deliveryMixCounts.inRange + deliveryMixCounts.outOfRange
            ? deliveryMixCounts.outOfRange / (deliveryMixCounts.inRange + deliveryMixCounts.outOfRange)
            : 0
      },
      paymentConversion: paymentRequested ? paymentPaid / paymentRequested : 0,
      paymentSuccessRate: paymentPaid + paymentFailed > 0 ? paymentPaid / (paymentPaid + paymentFailed) : 0,
      averageSecondsToAccept: stageAverage(stageTotals.placedToAccepted),
      averageSecondsToComplete: stageAverage(stageTotals.placedToDelivered),
      averageFulfillmentSeconds: stageAverage(stageTotals.placedToDelivered),
      stageDurations: {
        placedToAccepted: stageAverage(stageTotals.placedToAccepted),
        acceptedToReady: stageAverage(stageTotals.acceptedToReady),
        readyToDelivered: stageAverage(stageTotals.readyToDelivered),
        placedToDelivered: stageAverage(stageTotals.placedToDelivered)
      },
      codRatio: codOrders + prepaidOrders > 0 ? codOrders / (codOrders + prepaidOrders) : 0,
      ordersPerDay,
      dailyKpis
    };
  }

  listPayments() {
    return this.prisma.payment.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  notificationLog() {
    return this.prisma.notificationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async notificationHealth() {
    const [counts, queue] = await Promise.all([
      this.prisma.notificationLog.groupBy({
        by: ['channel', 'status'],
        _count: { _all: true }
      }),
      this.notificationService.queueMetrics()
    ]);
    return { counts, queue };
  }

  async funnel() {
    const events = await this.prisma.productEvent.groupBy({
      by: ['eventName'],
      _count: { _all: true },
      where: {
        eventName: { in: ['menu_view', 'checkout_completed', 'payment_paid', 'delivered'] }
      }
    });
    const lookup = Object.fromEntries(events.map((e) => [e.eventName, e._count._all]));
    return {
      menuViews: lookup.menu_view ?? 0,
      checkout: lookup.checkout_completed ?? 0,
      payment: lookup.payment_paid ?? 0,
      delivered: lookup.delivered ?? 0
    };
  }

  async eventLog(query: EventQueryDto, res?: Response) {
    const where: Prisma.EventLogWhereInput = {
      eventName: query.eventName ? { contains: query.eventName, mode: 'insensitive' } : undefined,
      actorType: query.actorType,
      orderId: query.orderId,
      userId: query.userId,
      vendorId: query.vendorId,
      createdAt:
        query.from || query.to
          ? {
              gte: query.from,
              lte: query.to
            }
          : undefined
    };

    const events = await this.prisma.eventLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 100
    });

    if (query.format === 'csv' && res) {
      const header = 'createdAt,eventName,actorType,actorId,orderId,userId,vendorId,metadata\n';
      const rows = events
        .map((e) =>
          [
            e.createdAt.toISOString(),
            e.eventName,
            e.actorType ?? '',
            e.actorId ?? '',
            e.orderId ?? '',
            e.userId ?? '',
            e.vendorId ?? '',
            JSON.stringify(e.metadata ?? {})
          ]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(',')
        )
        .join('\n');
      const csv = `${header}${rows}`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="events.csv"');
      res.send(csv);
      return;
    }

    return events;
  }

  private async ensureVendorExists(vendorId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }
}
