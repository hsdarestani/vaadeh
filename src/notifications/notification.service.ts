import { Injectable, Logger } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { NotificationChannel, NotificationStatus } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';
import { Queue, Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private customerTelegramBot?: TelegramBot;
  private vendorTelegramBot?: TelegramBot;
  private dispatcherQueue?: Queue;
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
    this.bootstrapDispatcher();
  }

  private async createLog(data: {
    channel: NotificationChannel;
    recipient: string | number;
    message: string;
    eventName?: string;
    orderId?: string;
    userId?: string;
    vendorId?: string;
  }) {
    return this.prisma.notificationLog.create({
      data: {
        channel: data.channel,
        recipient: data.recipient.toString(),
        message: data.message,
        eventName: data.eventName,
        orderId: data.orderId,
        userId: data.userId,
        vendorId: data.vendorId,
        status: NotificationStatus.PENDING
      }
    });
  }

  private async sendTelegramDirect(
    chatId: string | number,
    message: string,
    opts?: (TelegramBot.SendMessageOptions & { target?: 'customer' | 'vendor' }) | undefined
  ) {
    const botClient = opts?.target === 'vendor' ? this.vendorTelegramBot : this.customerTelegramBot;
    if (!botClient) {
      this.logger.warn('Telegram bot not configured for target');
      return;
    }
    const { target: _target, ...sendOptions } = opts ?? {};
    await botClient.sendMessage(chatId, message, { parse_mode: 'HTML', ...sendOptions });
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
    } catch (err) {
      this.logger.error(`Failed to send SMS to ${phone}: ${err instanceof Error ? err.message : err}`);
    }
  }

  private bootstrapDispatcher() {
    const connectionUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    try {
      this.dispatcherQueue = new Queue('notification-dispatcher', { connection: { url: connectionUrl } });
      new Worker(
        'notification-dispatcher',
        async (job) => {
          const { logId, channel, recipient, message, options } = job.data as {
            logId: string;
            channel: NotificationChannel;
            recipient: string | number;
            message: string;
            options?: TelegramBot.SendMessageOptions & { target?: 'customer' | 'vendor' };
          };

          try {
            if (channel === NotificationChannel.TELEGRAM) {
              await this.sendTelegramDirect(recipient, message, options);
            } else {
              await this.sendSmsDirect(recipient.toString(), message);
            }
            await this.prisma.notificationLog.update({
              where: { id: logId },
              data: { status: NotificationStatus.SENT, attempts: { increment: 1 }, lastError: null }
            });
          } catch (err) {
            await this.prisma.notificationLog.update({
              where: { id: logId },
              data: {
                status: NotificationStatus.FAILED,
                attempts: { increment: 1 },
                lastError: err instanceof Error ? err.message : 'unknown error'
              }
            });
            throw err;
          }
        },
        {
          connection: { url: connectionUrl },
          concurrency: 5
        }
      );
    } catch (err) {
      this.logger.warn(`Notification dispatcher disabled: ${err instanceof Error ? err.message : err}`);
    }
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
    const log = await this.createLog({
      channel: NotificationChannel.TELEGRAM,
      recipient: chatId,
      message,
      eventName: opts.eventName,
      orderId: opts.orderId,
      userId: opts.userId,
      vendorId: opts.vendorId
    });

    if (!this.dispatcherQueue) {
      await this.sendTelegramDirect(chatId, message, { ...opts.options, target: opts.target });
      await this.prisma.notificationLog.update({ where: { id: log.id }, data: { status: NotificationStatus.SENT, attempts: 1 } });
      return;
    }

    await this.dispatcherQueue.add(
      'send',
      {
        logId: log.id,
        channel: NotificationChannel.TELEGRAM,
        recipient: chatId,
        message,
        options: { ...opts.options, target: opts.target }
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
    );
  }

  async sendSms(phone: string, message: string, meta?: { eventName?: string; orderId?: string; userId?: string; vendorId?: string }) {
    const log = await this.createLog({
      channel: NotificationChannel.SMS,
      recipient: phone,
      message,
      eventName: meta?.eventName,
      orderId: meta?.orderId,
      userId: meta?.userId,
      vendorId: meta?.vendorId
    });

    if (!this.dispatcherQueue) {
      await this.sendSmsDirect(phone, message);
      await this.prisma.notificationLog.update({ where: { id: log.id }, data: { status: NotificationStatus.SENT, attempts: 1 } });
      return;
    }

    await this.dispatcherQueue.add(
      'send',
      { logId: log.id, channel: NotificationChannel.SMS, recipient: phone, message },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
    );
  }
}
