import { Injectable } from '@nestjs/common';
import { EventActorType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductEventService {
  constructor(private readonly prisma: PrismaService) {}

  track(eventName: string, payload: { actorType: EventActorType; actorId?: string; orderId?: string; metadata?: Record<string, unknown> }) {
    return this.prisma.productEvent.create({
      data: {
        eventName,
        actorType: payload.actorType,
        actorId: payload.actorId,
        orderId: payload.orderId,
        metadata: (payload.metadata ?? {}) as Prisma.JsonObject
      }
    });
  }
}
