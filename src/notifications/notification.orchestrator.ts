import { Injectable } from '@nestjs/common';
import { DeliveryType, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';

@Injectable()
export class NotificationOrchestrator {
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationService) {}

  private vendorActionKeyboard(orderId: string) {
    return {
      inline_keyboard: [
        [
          { text: '✅ قبول', callback_data: `order:${orderId}:accept` },
          { text: '❌ رد', callback_data: `order:${orderId}:reject` }
        ],
        [
          { text: '🍳 آماده شد', callback_data: `order:${orderId}:ready` },
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
        vendor: true
      }
    });
  }

  async onOrderCreated(orderId: string) {
    const order = await this.getOrderContext(orderId);
    if (!order) return;

    const deliveryCopy =
      order.deliveryType === DeliveryType.OUT_OF_RANGE_SNAPP
        ? '🚕 سفارش شما خارج از محدوده است و با برچسب اسنپ ثبت شد.'
        : '🚚 سفارش شما در محدوده ارسال است.';

    const customerMessage = `سفارش شما ثبت شد.\nکد سفارش: ${order.id.slice(-6)}\n${deliveryCopy}`;

    if (order.user.telegramUserId) {
      await this.notifications.sendTelegram(order.user.telegramUserId, customerMessage, {
        eventName: 'onOrderCreated',
        orderId: order.id,
        userId: order.userId
      });
    }
    await this.notifications.sendSms(order.user.mobile, customerMessage);

    if (order.vendor.telegramChatId) {
      const vendorMessage = `سفارش جدید #${order.id.slice(-6)} از ${order.user.mobile}\nمبلغ کل: ${order.totalPrice.toString()}`;
      await this.notifications.sendTelegram(order.vendor.telegramChatId, vendorMessage, {
        target: 'vendor',
        eventName: 'onOrderCreated',
        orderId: order.id,
        vendorId: order.vendorId,
        options: { reply_markup: this.vendorActionKeyboard(order.id) }
      });
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
      status === OrderStatus.DELIVERED
        ? 'سفارش تحویل داده شد. نوش جان!'
        : 'وضعیت سفارش به‌روزرسانی شد.';

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
