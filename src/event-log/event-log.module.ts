import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { EventLogInterceptor } from './event-log.interceptor';
import { EventLogService } from './event-log.service';
import { ProductEventService } from './product-event.service';

@Module({
  imports: [PrismaModule],
  providers: [EventLogService, ProductEventService, Reflector, { provide: APP_INTERCEPTOR, useClass: EventLogInterceptor }],
  exports: [EventLogService, ProductEventService]
})
export class EventLogModule {}
