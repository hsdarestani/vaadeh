import { Injectable, Logger } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { NotificationChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private customerTelegramBot?: TelegramBot;
  private vendorTelegramBot?: TelegramBot;

  constructor(private readonly prisma: PrismaService) {
    const customerToken = process.env.TELEGRAM_CUSTOMER_BOT_TOKEN;
    if (customerToken) {
      this.customerTelegramBot = new TelegramBot(customerToken, { polling: false });
    }

    const vendorToken = process.env.TELEGRAM_VENDOR_BOT_TOKEN;
    if (vendorToken) {
      this.vendorTelegramBot = new TelegramBot(vendorToken, { polling: false });
    }
  }

  private async logNotification(data: {
    channel: NotificationChannel;
    recipient: string | number;
    message: string;
    eventName?: string;
    orderId?: string;
    userId?: string;
    vendorId?: string;
  }) {
    await this.prisma.notificationLog.create({
      data: {
        channel: data.channel,
        recipient: data.recipient.toString(),
        message: data.message,
        eventName: data.eventName,
        orderId: data.orderId,
        userId: data.userId,
        vendorId: data.vendorId
      }
    });
  }

  async sendTelegram(
    chatId: string | number,
    message: string,
    opts: {
      target?: 'customer' | 'vendor';
      eventName?: string;
      orderId?: string;
      userId?: string;
      vendorId?: string;
      options?: TelegramBot.SendMessageOptions;
    } = {}
  ) {
    const bot = opts.target === 'vendor' ? this.vendorTelegramBot : this.customerTelegramBot;
    if (!bot) {
      this.logger.warn('Telegram bot not configured for target');
      return;
    }

    await bot.sendMessage(chatId, message, { parse_mode: 'HTML', ...(opts.options ?? {}) });
    await this.logNotification({
      channel: NotificationChannel.TELEGRAM,
      recipient: chatId,
      message,
      eventName: opts.eventName,
      orderId: opts.orderId,
      userId: opts.userId,
      vendorId: opts.vendorId
    });
  }

  async sendSms(phone: string, message: string) {
    this.logger.log(`SMS to ${phone}: ${message}`);
    await this.logNotification({
      channel: NotificationChannel.SMS,
      recipient: phone,
      message
    });
  }
}
