import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from '../orders/orders.service';

const vendorActions = {
  ACCEPT: 'accept',
  REJECT: 'reject',
  READY: 'ready',
  DELIVERED: 'delivered'
};

@Injectable()
export class VendorBotService implements OnModuleInit {
  private bot?: TelegramBot;
  private readonly logger = new Logger(VendorBotService.name);

  constructor(private readonly orders: OrdersService) {}

  onModuleInit(): void {
    const token = process.env.TELEGRAM_VENDOR_BOT_TOKEN;
    if (!token) {
      this.logger.warn('TELEGRAM_VENDOR_BOT_TOKEN not set; vendor bot disabled');
      return;
    }

    this.bot = new TelegramBot(token, { polling: true });
    this.registerHandlers();
    this.logger.log('Vendor bot initialized');
  }

  private registerHandlers() {
    if (!this.bot) return;

    const actionKeyboard = (orderId: string) => ({
      inline_keyboard: [
        [
          { text: '✅ قبول', callback_data: `order:${orderId}:${vendorActions.ACCEPT}` },
          { text: '❌ رد', callback_data: `order:${orderId}:${vendorActions.REJECT}` }
        ],
        [
          { text: '🍳 آماده شد', callback_data: `order:${orderId}:${vendorActions.READY}` },
          { text: '🛵 تحویل شد', callback_data: `order:${orderId}:${vendorActions.DELIVERED}` }
        ]
      ]
    });

    this.bot.on('callback_query', async (query) => {
      if (!query.data || !query.message) return;
      const [, orderId, action] = query.data.split(':');

      try {
        switch (action) {
          case vendorActions.ACCEPT:
            await this.orders.transition(orderId, OrderStatus.ACCEPTED);
            break;
          case vendorActions.REJECT:
            await this.orders.transition(orderId, OrderStatus.REJECTED);
            break;
          case vendorActions.READY:
            await this.orders.transition(orderId, OrderStatus.PREPARING);
            break;
          case vendorActions.DELIVERED:
            await this.orders.transition(orderId, OrderStatus.DELIVERED);
            break;
          default:
            await this.bot?.sendMessage(query.message.chat.id, 'عملیات ناشناخته است.');
            return;
        }

        await this.bot?.answerCallbackQuery({ callback_query_id: query.id, text: 'به‌روزرسانی شد' });
        await this.bot?.sendMessage(query.message.chat.id, `وضعیت سفارش ${orderId.slice(-6)} بروزرسانی شد.`);
      } catch (err) {
        this.logger.error(err);
        await this.bot?.answerCallbackQuery({ callback_query_id: query.id, text: 'خطا در تغییر وضعیت' });
      }
    });

    this.bot.on('message', async (msg) => {
      if (!msg.text || msg.text.startsWith('/')) return;
      if (msg.text.startsWith('سفارش جدید')) {
        const parts = msg.text.split('#');
        const orderId = parts[1];
        if (orderId) {
          await this.bot?.sendMessage(msg.chat.id, 'وضعیت سفارش را انتخاب کنید:', { reply_markup: actionKeyboard(orderId) });
        }
      }
    });
  }
}
