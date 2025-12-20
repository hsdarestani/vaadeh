import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AddressesModule } from './addresses/addresses.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { EventLogModule } from './event-log/event-log.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { TelegramModule } from './telegram/telegram.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';
import { MenuModule } from './menu/menu.module';
import { ContextLoggerInterceptor } from './logger/context-logger.interceptor';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      ttl: 60,
      limit: 100
    }),
    PrismaModule,
    EventLogModule,
    AuthModule,
    AddressesModule,
    OrdersModule,
    PaymentsModule,
    TelegramModule,
    NotificationsModule,
    AdminModule,
    MenuModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ContextLoggerInterceptor
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard
    }
  ]
})
export class AppModule {}
