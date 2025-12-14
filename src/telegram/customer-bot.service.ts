import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { OrdersService } from '../orders/orders.service';

interface SessionState {
  step: 'idle' | 'creating_order';
}

@Injectable()
export class CustomerBotService implements OnModuleInit {
  private bot?: TelegramBot;
  private readonly logger = new Logger(CustomerBotService.name);
  private readonly sessions = new Map<number, SessionState>();

  constructor(private readonly orders: OrdersService) {}

  onModuleInit(): void {
    const token = process.env.TELEGRAM_CUSTOMER_BOT_TOKEN;
    if (!token) {
      this.logger.warn('TELEGRAM_CUSTOMER_BOT_TOKEN not set; customer bot disabled');
      return;
    }
    this.bot = new TelegramBot(token, { polling: true });
    this.registerHandlers();
    this.logger.log('Customer bot initialized');
  }

  private registerHandlers() {
    if (!this.bot) return;

    this.bot.onText(/\/start/, (msg) => {
      this.sessions.set(msg.chat.id, { step: 'idle' });
      this.bot?.sendMessage(msg.chat.id, 'Welcome to Vaadeh!', {
        reply_markup: {
          keyboard: [
            [{ text: '🍽 New Order' }],
            [{ text: '📦 My Orders' }],
            [{ text: '📍 Addresses' }, { text: '💬 Support' }]
          ],
          resize_keyboard: true
        }
      });
    });

    this.bot.on('message', async (msg) => {
      if (!msg.text || msg.text.startsWith('/')) return;
      const state = this.sessions.get(msg.chat.id) ?? { step: 'idle' };
      if (msg.text === '🍽 New Order') {
        this.sessions.set(msg.chat.id, { step: 'creating_order' });
        await this.bot?.sendMessage(msg.chat.id, 'Send vendor ID to start order.');
        return;
      }

      if (state.step === 'creating_order') {
        await this.orders.create({
          userId: msg.chat.id.toString(),
          vendorId: msg.text,
          deliveryType: 'INTERNAL',
          totalPrice: 0,
          items: []
        });
        this.sessions.set(msg.chat.id, { step: 'idle' });
        await this.bot?.sendMessage(msg.chat.id, 'Order created!');
      }
    });
  }
}
