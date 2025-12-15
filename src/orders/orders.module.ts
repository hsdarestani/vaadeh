import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AddressesModule } from '../addresses/addresses.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DefaultAddressGuard } from './default-address.guard';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { EventLogModule } from '../event-log/event-log.module';
import { VendorMatchingService } from './vendor-matching.service';
import { SnappService } from './snapp.service';
import { SnappWebhookController } from './snapp.webhook.controller';

@Module({
  imports: [PrismaModule, AddressesModule, NotificationsModule, EventLogModule, HttpModule],
  controllers: [OrdersController, SnappWebhookController],
  providers: [OrdersService, DefaultAddressGuard, VendorMatchingService, SnappService],
  exports: [OrdersService, VendorMatchingService, SnappService]
})
export class OrdersModule {}
