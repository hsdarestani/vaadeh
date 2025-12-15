import { Injectable, Logger } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { EventActorType, NotificationChannel, NotificationStatus } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';
import { Queue, Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ProductEventService } from '../event-log/product-event.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private customerTelegramBot?: TelegramBot;
  private vendorTelegramBot?: TelegramBot;
  private dispatcherQueue?: Queue;
  private deadLetterQueue?: Queue;
  private dispatcherWorker?: Worker;
  private httpClient: AxiosInstance;

  constructor(private readonly prisma: PrismaService, private readonly productEvents: ProductEventService) {
    const customerToken = process.env.TELEGRAM_CUSTOMER_BOT_TOKEN;
    if (customerToken) {
      this.customerTelegramBot = new TelegramBot(customerToken, { polling: false });
    }

    const vendorToken = process.env.TELEGRAM_VENDOR_BOT_TOKEN;
    if (vendorToken) {
      this.vendorTelegramBot = new TelegramBot(vendorToken, { polling: false });
    }

    this.httpClient = axios.create({ baseURL: 'https://rest.payamak-panel.com/api' });
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

  private async trackEvent(
    eventName: 'sms_sent' | 'sms_failed' | 'telegram_sent' | 'telegram_failed',
    payload: { userId?: string; vendorId?: string; orderId?: string }
  ) {
    await this.productEvents.track(eventName, {
      actorType: payload.vendorId ? EventActorType.VENDOR : EventActorType.USER,
      actorId: payload.vendorId ?? payload.userId,
      orderId: payload.orderId,
      metadata: {}
    });
  }

  async queueMetrics() {
    const dispatcherCounts = this.dispatcherQueue
      ? await this.dispatcherQueue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed')
      : null;
    const deadLetterCounts = this.deadLetterQueue
      ? await this.deadLetterQueue.getJobCounts('waiting', 'failed', 'completed')
      : null;
    return { dispatcherCounts, deadLetterCounts };
  }

  private async sendTelegramDirect(
    chatId: string | number,
    message: string,
    opts?: (TelegramBot.SendMessageOptions & { target?: 'customer' | 'vendor' }) | undefined
  ): Promise<{ providerMessageId?: string; providerStatus?: string }> {
    const botClient = opts?.target === 'vendor' ? this.vendorTelegramBot : this.customerTelegramBot;
    if (!botClient) {
      this.logger.warn('Telegram bot not configured for target');
      return {};
    }
    const { target: _target, ...sendOptions } = opts ?? {};
    const res = await botClient.sendMessage(chatId, message, { parse_mode: 'HTML', ...sendOptions });
    return { providerMessageId: res.message_id?.toString(), providerStatus: 'SENT' };
  }

  private async sendSmsDirect(
    phone: string,
    message: string
  ): Promise<{ providerMessageId?: string; providerStatus?: string; error?: string }> {
    const username = process.env.MELIPAYAMAK_USERNAME;
    const password = process.env.MELIPAYAMAK_PASSWORD;
    const from = process.env.MELIPAYAMAK_FROM ?? process.env.MELIPAYAMAK_NUMBER;

    if (!username || !password || !from) {
      this.logger.warn('Melipayamak credentials missing; SMS skipped');
      return { error: 'credentials missing' };
    }

    try {
      const payload = new URLSearchParams({
        username,
        password,
        to: phone,
        from,
        text: message,
        isflash: 'false'
      });
      const { data } = await this.httpClient.post('/SendSMS/SendSMS', payload.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      const providerStatus = data?.RetStatus !== undefined ? String(data.RetStatus) : undefined;
      const providerMessageId = data?.Value !== undefined ? String(data.Value) : undefined;
      const success = providerStatus === '1';
      return success
        ? { providerMessageId, providerStatus }
        : { providerMessageId, providerStatus, error: data?.StrRetStatus ?? 'provider rejected request' };
    } catch (err) {
      this.logger.error(`Failed to send SMS to ${phone}: ${err instanceof Error ? err.message : err}`);
      return { error: err instanceof Error ? err.message : 'unknown error' };
    }
  }

  private bootstrapDispatcher() {
    const connectionUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    try {
      this.dispatcherQueue = new Queue('notification-dispatcher', {
        connection: { url: connectionUrl },
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 3000 },
          removeOnComplete: 1000,
          removeOnFail: false
        }
      });
      this.deadLetterQueue = new Queue('notification-dead-letter', { connection: { url: connectionUrl } });
      this.dispatcherWorker = new Worker(
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
            const result =
              channel === NotificationChannel.TELEGRAM
                ? await this.sendTelegramDirect(recipient, message, options)
                : await this.sendSmsDirect(recipient.toString(), message);

            if ((result as any)?.error) {
              throw new Error((result as any).error);
            }

            await this.prisma.notificationLog.update({
              where: { id: logId },
              data: {
                status: NotificationStatus.SENT,
                attempts: { increment: 1 },
                lastError: null,
                providerMessageId: result?.providerMessageId,
                providerStatus: result?.providerStatus
              }
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

      this.dispatcherWorker.on('failed', async (job, err) => {
        this.logger.error(`Notification job ${job.id} failed: ${err instanceof Error ? err.message : err}`);
        if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
          await this.deadLetterQueue?.add('dead-letter', { ...job.data, failedReason: err?.toString?.() });
        }
      });
      this.dispatcherWorker.on('stalled', (jobId) => {
        this.logger.warn(`Notification job ${jobId} stalled`);
      });
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

    const sendDirect = async () => {
      const result = await this.sendTelegramDirect(chatId, message, { ...opts.options, target: opts.target });
      await this.prisma.notificationLog.update({
        where: { id: log.id },
        data: { status: NotificationStatus.SENT, attempts: 1, providerMessageId: result.providerMessageId, providerStatus: result.providerStatus }
      });
      await this.trackEvent('telegram_sent', { userId: opts.userId, vendorId: opts.vendorId, orderId: opts.orderId });
    };

    if (!this.dispatcherQueue) {
      await sendDirect();
      return;
    }

    try {
      await this.dispatcherQueue.add('send', {
        logId: log.id,
        channel: NotificationChannel.TELEGRAM,
        recipient: chatId,
        message,
        options: { ...opts.options, target: opts.target }
      });
    } catch (err) {
      this.logger.warn(`Falling back to direct telegram send for log ${log.id}: ${err instanceof Error ? err.message : err}`);
      await sendDirect();
    }
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

    const sendDirect = async () => {
      const result = await this.sendSmsDirect(phone, message);
      await this.prisma.notificationLog.update({
        where: { id: log.id },
        data: {
          status: result.error ? NotificationStatus.FAILED : NotificationStatus.SENT,
          attempts: 1,
          lastError: result.error,
          providerMessageId: result.providerMessageId,
          providerStatus: result.providerStatus
        }
      });
      await this.trackEvent(result.error ? 'sms_failed' : 'sms_sent', {
        userId: meta?.userId,
        vendorId: meta?.vendorId,
        orderId: meta?.orderId
      });
    };

    if (!this.dispatcherQueue) {
      await sendDirect();
      return;
    }

    try {
      await this.dispatcherQueue.add('send', { logId: log.id, channel: NotificationChannel.SMS, recipient: phone, message });
    } catch (err) {
      this.logger.warn(`Falling back to direct SMS send for log ${log.id}: ${err instanceof Error ? err.message : err}`);
      await sendDirect();
    }
  }
}
