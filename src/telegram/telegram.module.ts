import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { CustomerBotService } from './customer-bot.service';
import { VendorBotService } from './vendor-bot.service';
import { AddressesModule } from '../addresses/addresses.module';

@Module({
  imports: [OrdersModule, AddressesModule],
  providers: [CustomerBotService, VendorBotService]
})
export class TelegramModule {}
