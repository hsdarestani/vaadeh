import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from '../orders/orders.service';

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

    this.bot.onText(/\/start/, (msg) => {
      this.bot?.sendMessage(msg.chat.id, 'Vendor bot ready. Use buttons to manage orders.', {
        reply_markup: {
          keyboard: [
            [{ text: 'Accept Order' }, { text: 'Reject Order' }],
            [{ text: 'Mark Ready' }, { text: 'Mark Delivered' }]
          ],
          resize_keyboard: true
        }
      });
    });

    this.bot.on('message', async (msg) => {
      if (!msg.text || msg.text.startsWith('/')) return;
      const [action, orderId] = msg.text.split(' ').length > 1 ? msg.text.split(' ') : [msg.text];
      if (!orderId) {
        await this.bot?.sendMessage(msg.chat.id, 'Send action followed by orderId');
        return;
      }

      switch (action) {
        case 'Accept':
        case 'Accept Order':
          await this.orders.transition(orderId, OrderStatus.ACCEPTED);
          break;
        case 'Reject':
        case 'Reject Order':
          await this.orders.transition(orderId, OrderStatus.REJECTED);
          break;
        case 'Mark':
        case 'Mark Ready':
          await this.orders.transition(orderId, OrderStatus.DELIVERY);
          break;
        case 'Mark Delivered':
          await this.orders.transition(orderId, OrderStatus.COMPLETED);
          break;
        default:
          await this.bot?.sendMessage(msg.chat.id, 'Unknown action');
          return;
      }

      await this.bot?.sendMessage(msg.chat.id, `Order ${orderId} updated to ${action}`);
    });
  }
}
