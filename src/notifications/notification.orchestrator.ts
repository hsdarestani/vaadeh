import { Injectable } from '@nestjs/common';
import { DeliveryType, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';

@Injectable()
export class NotificationOrchestrator {
  private readonly adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationService) {}

  private vendorActionKeyboard(orderId: string) {
    return {
      inline_keyboard: [
        [
          { text: '✅ قبول', callback_data: `order:${orderId}:accept` },
          { text: '❌ رد', callback_data: `order:${orderId}:reject` }
        ],
        [
          { text: '🍳 شروع آماده‌سازی', callback_data: `order:${orderId}:preparing` },
          { text: '📦 آماده تحویل', callback_data: `order:${orderId}:ready` }
        ],
        [
          { text: '🛵 تحویل شد', callback_data: `order:${orderId}:delivered` }
        ]
      ]
    };
  }

  private async getOrderContext(orderId: string) {
    return this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
        vendor: true,
        items: { include: { menuVariant: { include: { menuItem: true } } } },
        history: { orderBy: { changedAt: 'asc' } }
      }
    });
  }

  async onOrderCreated(orderId: string) {
    const order = await this.getOrderContext(orderId);
    if (!order) return;

    const deliveryCopy =
      order.deliveryType === DeliveryType.SNAPP_COURIER_OUT_OF_ZONE
        ? '🚕 سفارش شما خارج از محدوده است و با برچسب اسنپ (پس‌کرایه) ثبت شد.'
        : '🚚 سفارش شما در محدوده ارسال است.';

    const lineItems = order.items
      .map((item) => `${item.menuVariant.menuItem.name} (${item.menuVariant.code}) x${item.qty}`)
      .join('\n');
    const customerMessage = `سفارش شما ثبت شد.\nکد سفارش: ${order.id.slice(-6)}\n${deliveryCopy}\n${lineItems}`;

    if (order.user.telegramUserId) {
      await this.notifications.sendTelegram(order.user.telegramUserId, customerMessage, {
        eventName: 'onOrderCreated',
        orderId: order.id,
        userId: order.userId
      });
    }
    await this.notifications.sendSms(order.user.mobile, customerMessage);

    if (order.vendor.telegramChatId) {
      const settlementCopy =
        order.deliveryType === DeliveryType.SNAPP_COURIER_OUT_OF_ZONE
          ? '\nاین سفارش با پیک اسنپ و پس‌کرایه است؛ هزینه پیک از مشتری دریافت می‌شود.'
          : '';
      const vendorMessage = `سفارش جدید #${order.id.slice(-6)} از ${order.user.mobile}\nمبلغ کل: ${order.totalPrice.toString()}\nآدرس: ${order.addressSnapshot?.fullAddress}\nآیتم‌ها:\n${lineItems}${settlementCopy}`;
      await this.notifications.sendTelegram(order.vendor.telegramChatId, vendorMessage, {
        target: 'vendor',
        eventName: 'onOrderCreated',
        orderId: order.id,
        vendorId: order.vendorId,
        options: { reply_markup: this.vendorActionKeyboard(order.id) }
      });
    }
    if (order.vendor.contactPhone) {
      await this.notifications.sendSms(
        order.vendor.contactPhone,
        `سفارش جدید #${order.id.slice(-6)} - مشتری ${order.user.mobile} - مبلغ ${order.totalPrice.toString()}`
      );
    }

    if (this.adminChatId) {
      await this.notifications.sendTelegram(
        this.adminChatId,
        `سفارش جدید #${order.id.slice(-6)} برای ${order.vendor.name} ثبت شد.`,
        { eventName: 'onOrderCreated_admin', orderId: order.id }
      );
    }
  }

  async onPaymentSuccess(orderId: string) {
    const order = await this.getOrderContext(orderId);
    if (!order) return;

    const message = `پرداخت سفارش شما با موفقیت تایید شد.\nکد سفارش: ${order.id.slice(-6)}`;
    if (order.user.telegramUserId) {
      await this.notifications.sendTelegram(order.user.telegramUserId, message, {
        eventName: 'onPaymentSuccess',
        orderId: order.id,
        userId: order.userId
      });
    }
    await this.notifications.sendSms(order.user.mobile, message);

    if (order.vendor.telegramChatId) {
      const vendorMessage = `پرداخت سفارش #${order.id.slice(-6)} تایید شد و آماده پذیرش است.`;
      await this.notifications.sendTelegram(order.vendor.telegramChatId, vendorMessage, {
        target: 'vendor',
        eventName: 'onPaymentSuccess',
        orderId: order.id,
        vendorId: order.vendorId,
        options: { reply_markup: this.vendorActionKeyboard(order.id) }
      });
    }
    if (order.vendor.contactPhone) {
      await this.notifications.sendSms(
        order.vendor.contactPhone,
        `پرداخت سفارش #${order.id.slice(-6)} تایید شد و آماده پردازش است.`
      );
    }

    if (this.adminChatId) {
      await this.notifications.sendTelegram(this.adminChatId, `پرداخت سفارش #${order.id.slice(-6)} تایید شد.`, {
        eventName: 'onPaymentSuccess_admin',
        orderId: order.id,
        vendorId: order.vendorId
      });
    }
  }

  async onPaymentFailed(orderId: string) {
    const order = await this.getOrderContext(orderId);
    if (!order) return;

    const customerMessage = `پرداخت سفارش ${order.id.slice(-6)} ناموفق بود. لطفاً دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.`;
    if (order.user.telegramUserId) {
      await this.notifications.sendTelegram(order.user.telegramUserId, customerMessage, {
        eventName: 'onPaymentFailed',
        orderId: order.id,
        userId: order.userId
      });
    }
    await this.notifications.sendSms(order.user.mobile, customerMessage);

    if (this.adminChatId) {
      await this.notifications.sendTelegram(this.adminChatId, `پرداخت سفارش #${order.id.slice(-6)} ناموفق بود.`, {
        eventName: 'onPaymentFailed_admin',
        orderId: order.id
      });
    }
  }

  async onVendorAccepted(orderId: string) {
    const order = await this.getOrderContext(orderId);
    if (!order) return;

    const message = `سفارش شما توسط ${order.vendor.name} تایید شد و در حال آماده‌سازی است.`;
    if (order.user.telegramUserId) {
      await this.notifications.sendTelegram(order.user.telegramUserId, message, {
        eventName: 'onVendorAccepted',
        orderId: order.id,
        userId: order.userId
      });
    }
    await this.notifications.sendSms(order.user.mobile, message);
  }

  async onDelivery(orderId: string, status: OrderStatus) {
    const order = await this.getOrderContext(orderId);
    if (!order) return;

    const finalMessage =
      status === OrderStatus.DELIVERED ? 'سفارش تحویل داده شد. نوش جان!' : 'وضعیت سفارش به‌روزرسانی شد.';

    if (order.user.telegramUserId) {
      await this.notifications.sendTelegram(order.user.telegramUserId, finalMessage, {
        eventName: 'onDelivery',
        orderId: order.id,
        userId: order.userId
      });
    }
    await this.notifications.sendSms(order.user.mobile, finalMessage);
  }
}
