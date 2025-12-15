import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { CustomerBotService } from './customer-bot.service';
import { VendorBotService } from './vendor-bot.service';
import { AddressesModule } from '../addresses/addresses.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [OrdersModule, AddressesModule, AuthModule, PaymentsModule, PrismaModule],
  providers: [CustomerBotService, VendorBotService]
})
export class TelegramModule {}
