import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type EventPayload = {
  orderId?: string;
  userId?: string;
  vendorId?: string;
  actorType?: Prisma.EventActorType;
  actorId?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class EventLogService {
  private readonly logger = new Logger(EventLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logEvent(eventName: string, payload: EventPayload) {
    const derivedActorType =
      payload.actorType ??
      (payload.userId
        ? Prisma.EventActorType.USER
        : payload.vendorId
          ? Prisma.EventActorType.VENDOR
          : undefined);

    await this.prisma.eventLog.create({
      data: {
        eventName,
        actorType: derivedActorType,
        actorId: payload.actorId,
        correlationId: payload.correlationId,
        metadata: (payload.metadata ?? {}) as Prisma.JsonObject,
        orderId: payload.orderId,
        userId: payload.userId,
        vendorId: payload.vendorId
      }
    });

    this.logger.log(`${eventName} recorded${payload.orderId ? ` for order ${payload.orderId}` : ''}`);
  }
}
