import { Module } from '@nestjs/common';
import { AddressesModule } from '../addresses/addresses.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DefaultAddressGuard } from './default-address.guard';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { EventLogModule } from '../event-log/event-log.module';

@Module({
  imports: [PrismaModule, AddressesModule, NotificationsModule, EventLogModule],
  controllers: [OrdersController],
  providers: [OrdersService, DefaultAddressGuard],
  exports: [OrdersService]
})
export class OrdersModule {}
