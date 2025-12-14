import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { DeliveryType, OrderStatus } from '@prisma/client';
import { OrdersService } from '../orders/orders.service';

const vendorActions = {
  ACCEPT: 'accept',
  REJECT: 'reject',
  READY: 'ready',
  DELIVERED: 'delivered'
};

const VENDOR_MENU_BUTTONS = {
  NEW_ORDERS: '📬 سفارش‌های جدید',
  RECENT: '📦 سفارش‌های من'
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

    const sendHome = async (chatId: number) => {
      await this.bot?.sendMessage(chatId, 'منوی وندور:', {
        reply_markup: {
          keyboard: [
            [{ text: VENDOR_MENU_BUTTONS.NEW_ORDERS }],
            [{ text: VENDOR_MENU_BUTTONS.RECENT }]
          ],
          resize_keyboard: true
        }
      });
    };

    this.bot.on('callback_query', async (query) => {
      if (!query.data || !query.message) return;
      const [, orderId, action] = query.data.split(':');

      const vendor = await this.orders.getVendorByChatId(query.message.chat.id);
      const order = await this.orders.getOrder(orderId);
      if (!vendor || !order || order.vendorId !== vendor.id) {
        await this.bot?.answerCallbackQuery({ callback_query_id: query.id, text: 'دسترسی مجاز نیست' });
        return;
      }

      try {
        switch (action) {
          case vendorActions.ACCEPT:
            await this.orders.transition(orderId, OrderStatus.ACCEPTED);
            break;
          case vendorActions.REJECT:
            await this.orders.transition(orderId, OrderStatus.REJECTED);
            break;
          case vendorActions.READY:
            {
              const deliveryStatus =
                order.deliveryType === DeliveryType.SNAPP_COD
                  ? OrderStatus.DELIVERY_SNAPP
                  : OrderStatus.DELIVERY_INTERNAL;
              await this.orders.transition(orderId, deliveryStatus);
            }
            break;
          case vendorActions.DELIVERED:
            await this.orders.transition(orderId, OrderStatus.COMPLETED);
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
      const vendor = await this.orders.getVendorByChatId(msg.chat.id);
      if (!vendor) {
        await this.bot?.sendMessage(msg.chat.id, 'اکانت شما فعال نیست. لطفاً با پشتیبانی تماس بگیرید.');
        return;
      }

      switch (msg.text) {
        case VENDOR_MENU_BUTTONS.NEW_ORDERS: {
          const orders = await this.orders.listVendorOpenOrders(vendor.id);
          if (!orders.length) {
            await this.bot?.sendMessage(msg.chat.id, 'سفارش جدیدی وجود ندارد.');
            break;
          }
          for (const order of orders) {
            await this.bot?.sendMessage(
              msg.chat.id,
              `سفارش #${order.id.slice(-6)} از ${order.user.mobile}\nمبلغ: ${order.totalPrice.toString()}`,
              { reply_markup: actionKeyboard(order.id) }
            );
          }
          break;
        }
        case VENDOR_MENU_BUTTONS.RECENT: {
          const recent = await this.orders.listVendorRecentOrders(vendor.id);
          if (!recent.length) {
            await this.bot?.sendMessage(msg.chat.id, 'سفارشی یافت نشد.');
            break;
          }
          const summary = recent
            .map((o) => `#${o.id.slice(-6)} | ${o.user.mobile} | ${o.status} | ${new Date(o.createdAt).toLocaleString('fa-IR')}`)
            .join('\n');
          await this.bot?.sendMessage(msg.chat.id, summary);
          break;
        }
        default:
          await sendHome(msg.chat.id);
      }
    });
  }
}
