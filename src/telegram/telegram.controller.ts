import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { CustomerBotService } from './customer-bot.service';
import { VendorBotService } from './vendor-bot.service';
import TelegramBot from 'node-telegram-bot-api';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly customerBot: CustomerBotService, private readonly vendorBot: VendorBotService) {}

  @Post('webhook')
  handleWebhook(@Body() body: TelegramBot.Update, @Headers('x-telegram-secret-token') secret?: string) {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!expected) {
      throw new UnauthorizedException('webhook secret not configured');
    }
    if (secret !== expected) {
      throw new UnauthorizedException('invalid webhook secret');
    }
    this.customerBot.handleWebhook(body);
    this.vendorBot.handleWebhook(body);
    return { ok: true };
  }
}
