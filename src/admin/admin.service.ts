import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DeliveryType,
  OrderStatus,
  PaymentStatus,
  Prisma
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationOrchestrator } from '../notifications/notification.orchestrator';
import { EventLogService } from '../event-log/event-log.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { CreateMenuVariantDto } from './dto/create-menu-variant.dto';
import { UpdateMenuVariantDto } from './dto/update-menu-variant.dto';
import { UpdateOrderDto } from './dto/update-order.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationOrchestrator,
    private readonly eventLog: EventLogService
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
    if (dto.adminNote !== undefined) data.adminNote = dto.adminNote;
    if (dto.status) data.status = dto.status;
    if (dto.status) {
      data.history = { create: { status: dto.status } };
    }

    const updated = await this.prisma.order.update({ where: { id: orderId }, data });

    if (dto.status) {
      if (dto.status === OrderStatus.ACCEPTED) {
        await this.notifications.onVendorAccepted(orderId);
      }
      if ([OrderStatus.PREPARING, OrderStatus.DELIVERED].includes(dto.status)) {
        await this.notifications.onDelivery(orderId, dto.status);
      }
    }

    if (dto.status || dto.totalPrice !== undefined || dto.deliveryFee !== undefined || dto.adminNote !== undefined) {
      await this.eventLog.logEvent('order_admin_override', {
        orderId,
        userId: order.userId,
        vendorId: order.vendorId,
        metadata: {
          previousStatus: order.status,
          nextStatus: dto.status ?? order.status,
          totalPrice: dto.totalPrice ?? order.totalPrice,
          deliveryFee: dto.deliveryFee ?? order.deliveryFee,
          adminNote: dto.adminNote
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

  async kpis() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [dailyOrders, totalOrders, cancelledOrders, verifiedPayments, vendorGroup, outOfRange, inRange] =
      await Promise.all([
        this.prisma.order.count({ where: { createdAt: { gte: today } } }),
        this.prisma.order.count(),
        this.prisma.order.count({ where: { status: { in: [OrderStatus.CANCELLED, OrderStatus.REJECTED] } } }),
        this.prisma.payment.aggregate({ _sum: { amount: true }, where: { status: PaymentStatus.VERIFIED } }),
        this.prisma.order.groupBy({ by: ['vendorId'], _count: { _all: true }, _sum: { totalPrice: true } }),
        this.prisma.order.count({ where: { deliveryType: DeliveryType.OUT_OF_RANGE_SNAPP } }),
        this.prisma.order.count({ where: { deliveryType: DeliveryType.IN_RANGE } })
      ]);

    const vendorNames = await this.prisma.vendor.findMany({ select: { id: true, name: true } });
    const vendorLookup = new Map(vendorNames.map((v) => [v.id, v.name]));

    return {
      dailyOrders,
      totalSales: Number(verifiedPayments._sum.amount ?? 0),
      cancelRate: totalOrders ? cancelledOrders / totalOrders : 0,
      vendorPerformance: vendorGroup.map((group) => ({
        vendorId: group.vendorId,
        vendorName: vendorLookup.get(group.vendorId),
        orders: group._count._all,
        sales: Number(group._sum.totalPrice ?? 0)
      })),
      deliveryMix: {
        inRange,
        outOfRange
      }
    };
  }

  private async ensureVendorExists(vendorId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }
}
