import { Injectable, Logger } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { EventLogService } from '../event-log/event-log.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private telegramBot?: TelegramBot;

  constructor(private readonly eventLog: EventLogService) {
    const token = process.env.TELEGRAM_CUSTOMER_BOT_TOKEN;
    if (token) {
      this.telegramBot = new TelegramBot(token, { polling: false });
    }
  }

  async sendTelegram(chatId: string | number, message: string) {
    if (!this.telegramBot) {
      this.logger.warn('Telegram bot not configured');
      return;
    }

    await this.telegramBot.sendMessage(chatId, message);
    await this.eventLog.logEvent('NOTIFICATION_SENT', {
      metadata: { channel: 'telegram', chatId, message }
    });
  }

  async sendSms(phone: string, message: string) {
    this.logger.log(`SMS to ${phone}: ${message}`);
    await this.eventLog.logEvent('NOTIFICATION_SENT', {
      metadata: { channel: 'sms', phone, message }
    });
  }
}
