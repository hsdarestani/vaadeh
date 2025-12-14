import { Module } from '@nestjs/common';
import { EventLogModule } from './event-log/event-log.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';
import { TelegramModule } from './telegram/telegram.module';

@Module({
  imports: [PrismaModule, EventLogModule, OrdersModule, TelegramModule],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
