import { Injectable, Logger } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { NotificationChannel } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';
import { Queue, Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private customerTelegramBot?: TelegramBot;
  private vendorTelegramBot?: TelegramBot;
  private smsQueue?: Queue;
  private httpClient: AxiosInstance;

  constructor(private readonly prisma: PrismaService) {
    const customerToken = process.env.TELEGRAM_CUSTOMER_BOT_TOKEN;
    if (customerToken) {
      this.customerTelegramBot = new TelegramBot(customerToken, { polling: false });
    }

    const vendorToken = process.env.TELEGRAM_VENDOR_BOT_TOKEN;
    if (vendorToken) {
      this.vendorTelegramBot = new TelegramBot(vendorToken, { polling: false });
    }

    this.httpClient = axios.create({ baseURL: 'https://rest.melipayamak.com/api' });
    this.bootstrapSmsQueue();
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

  private bootstrapSmsQueue() {
    const connectionUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    try {
      this.smsQueue = new Queue('sms-sender', { connection: { url: connectionUrl } });
      new Worker(
        'sms-sender',
        async (job) => {
          const { phone, message } = job.data as { phone: string; message: string };
          await this.sendSmsDirect(phone, message);
        },
        { connection: { url: connectionUrl } }
      );
    } catch (err) {
      this.logger.warn(`SMS queue disabled: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async sendSmsDirect(phone: string, message: string) {
    const username = process.env.MELIPAYAMAK_USERNAME;
    const password = process.env.MELIPAYAMAK_PASSWORD;
    const from = process.env.MELIPAYAMAK_FROM ?? process.env.MELIPAYAMAK_NUMBER;

    if (!username || !password || !from) {
      this.logger.warn('Melipayamak credentials missing; SMS skipped');
      return;
    }

    try {
      await this.httpClient.post('/send/simple', {
        username,
        password,
        to: phone,
        from,
        text: message
      });
      await this.logNotification({
        channel: NotificationChannel.SMS,
        recipient: phone,
        message
      });
    } catch (err) {
      this.logger.error(`Failed to send SMS to ${phone}: ${err instanceof Error ? err.message : err}`);
    }
  }

  async sendSms(phone: string, message: string) {
    if (this.smsQueue) {
      await this.smsQueue.add('send', { phone, message });
      return;
    }
    await this.sendSmsDirect(phone, message);
  }
}
