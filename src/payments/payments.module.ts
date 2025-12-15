import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { EventLogModule } from '../event-log/event-log.module';
import { RateLimitService } from '../middleware/rate-limit.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [PrismaModule, OrdersModule, NotificationsModule, EventLogModule, RedisModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, RateLimitService],
  exports: [PaymentsService]
})
export class PaymentsModule {}
