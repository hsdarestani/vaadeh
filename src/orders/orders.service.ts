import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { EventLogService } from '../event-log/event-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventLog: EventLogService
  ) {}

  async create(dto: CreateOrderDto) {
    const order = await this.prisma.$transaction(async (tx) => {
      const itemCount = dto.items.length || 1;

      const created = await tx.order.create({
        data: {
          userId: dto.userId,
          vendorId: dto.vendorId,
          deliveryType: dto.deliveryType,
          totalPrice: new Prisma.Decimal(dto.totalPrice),
          items: {
            create: dto.items.map((item) => ({
              quantity: item.quantity,
              price: new Prisma.Decimal(dto.totalPrice / itemCount),
              menuItemId: item.menuItemId
            }))
          }
        },
        include: { items: true }
      });
      await this.eventLog.logEvent('ORDER_CREATED', {
        orderId: created.id,
        userId: created.userId,
        metadata: { deliveryType: created.deliveryType }
      });
      return created;
    });

    return order;
  }

  async transition(orderId: string, next: OrderStatus) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.ACCEPTED, OrderStatus.REJECTED],
      [OrderStatus.ACCEPTED]: [OrderStatus.DELIVERY, OrderStatus.REJECTED],
      [OrderStatus.DELIVERY]: [OrderStatus.COMPLETED],
      [OrderStatus.COMPLETED]: [],
      [OrderStatus.REJECTED]: []
    };

    const validNext = allowedTransitions[order.status];
    if (!validNext.includes(next)) {
      throw new BadRequestException('Invalid transition');
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: next }
    });

    const eventName = this.mapStatusToEvent(next);
    if (eventName) {
      await this.eventLog.logEvent(eventName, {
        orderId,
        userId: order.userId,
        metadata: { deliveryType: order.deliveryType }
      });
    }

    return updated;
  }

  private mapStatusToEvent(status: OrderStatus): string | null {
    switch (status) {
      case OrderStatus.ACCEPTED:
        return 'ORDER_ACCEPTED';
      case OrderStatus.DELIVERY:
        return 'DELIVERY_STARTED';
      case OrderStatus.COMPLETED:
        return 'ORDER_COMPLETED';
      case OrderStatus.REJECTED:
        return 'ORDER_REJECTED';
      default:
        return null;
    }
  }
}
