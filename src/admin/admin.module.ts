import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { EventLogModule } from '../event-log/event-log.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { RolesGuard } from '../auth/roles.guard';
import { Reflector } from '@nestjs/core';

@Module({
  imports: [PrismaModule, NotificationsModule, OrdersModule, EventLogModule],
  controllers: [AdminController],
  providers: [AdminService, RolesGuard, Reflector]
})
export class AdminModule {}
