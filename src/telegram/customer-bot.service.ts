import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { OrdersService } from '../orders/orders.service';
import { AddressesService } from '../addresses/addresses.service';

const MENU_BUTTONS = {
  NEW_ORDER: '🛒 سفارش جدید',
  MY_ORDERS: '📦 سفارش‌های من',
  ADDRESSES: '📍 آدرس‌ها',
  SUPPORT: '☎️ پشتیبانی'
};

@Injectable()
export class CustomerBotService implements OnModuleInit {
  private bot?: TelegramBot;
  private readonly logger = new Logger(CustomerBotService.name);

  constructor(private readonly orders: OrdersService, private readonly addresses: AddressesService) {}

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

    const sendHome = async (chatId: number) => {
      await this.bot?.sendMessage(chatId, 'به وعده خوش آمدید. یکی از گزینه‌ها را انتخاب کنید.', {
        reply_markup: {
          keyboard: [
            [{ text: MENU_BUTTONS.NEW_ORDER }],
            [{ text: MENU_BUTTONS.MY_ORDERS }],
            [{ text: MENU_BUTTONS.ADDRESSES }, { text: MENU_BUTTONS.SUPPORT }]
          ],
          resize_keyboard: true
        }
      });
    };

    this.bot.on('message', async (msg) => {
      if (!msg.text || msg.text.startsWith('/')) return;

      switch (msg.text) {
        case MENU_BUTTONS.NEW_ORDER:
          await this.bot?.sendMessage(
            msg.chat.id,
            'برای ثبت سفارش، به اپ یا وب مراجعه کنید و آیتم‌ها را انتخاب کنید. اگر خارج از محدوده باشید، سفارش با برچسب اسنپ ثبت می‌شود.'
          );
          break;
        case MENU_BUTTONS.MY_ORDERS: {
          const orders = await this.orders.listForTelegramUser(msg.chat.id);
          if (!orders.length) {
            await this.bot?.sendMessage(msg.chat.id, 'سفارشی یافت نشد.');
            break;
          }
          const summary = orders
            .map((o) => `#${o.id.slice(-6)} | ${o.vendor.name} | ${o.status} | ${new Date(o.createdAt).toLocaleString('fa-IR')}`)
            .join('\n');
          await this.bot?.sendMessage(msg.chat.id, summary);
          break;
        }
        case MENU_BUTTONS.ADDRESSES: {
          const addresses = await this.addresses.listByTelegramUser(msg.chat.id);
          if (!addresses.length) {
            await this.bot?.sendMessage(msg.chat.id, 'ابتدا در اپلیکیشن یک آدرس پیش‌فرض ثبت کنید.');
            break;
          }
          const rendered = addresses
            .map((a) => `${a.title}${a.isDefault ? ' (پیش‌فرض)' : ''}: ${a.fullAddress}`)
            .join('\n');
          await this.bot?.sendMessage(msg.chat.id, rendered);
          break;
        }
        case MENU_BUTTONS.SUPPORT:
          await this.bot?.sendMessage(msg.chat.id, 'برای پشتیبانی با 021-000000 تماس بگیرید یا در همین چت پیام دهید.');
          break;
        default:
          await sendHome(msg.chat.id);
      }
    });
  }
}
