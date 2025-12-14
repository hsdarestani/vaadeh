import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { CustomerBotService } from './customer-bot.service';
import { VendorBotService } from './vendor-bot.service';

@Module({
  imports: [OrdersModule],
  providers: [CustomerBotService, VendorBotService]
})
export class TelegramModule {}
