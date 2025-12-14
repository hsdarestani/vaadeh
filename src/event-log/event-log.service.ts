import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type EventPayload = {
  orderId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class EventLogService {
  private readonly logger = new Logger(EventLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logEvent(eventName: string, payload: EventPayload) {
    await this.prisma.eventLog.create({
      data: {
        eventName,
        metadata: (payload.metadata ?? {}) as Prisma.JsonObject,
        orderId: payload.orderId,
        userId: payload.userId
      }
    });

    this.logger.log(`${eventName} recorded${payload.orderId ? ` for order ${payload.orderId}` : ''}`);
  }
}
