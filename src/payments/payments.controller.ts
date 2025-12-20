import { All, Body, Controller, Headers, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService } from './payments.service';
import { Request } from 'express';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('zibal/request')
  @UseGuards(JwtAuthGuard)
  request(@CurrentUser() user: { userId: string }, @Body('orderId') orderId: string) {
    return this.payments.requestZibal(orderId, user.userId);
  }

  @Post('zibal/verify')
  @Throttle({ limit: 6, ttl: 60 })
  verify(@Body() body: { trackId: string; orderId?: string }, @Headers() headers: Record<string, string>) {
    return this.payments.verifyZibal(body.trackId, body, headers);
  }

  @All('zibal/callback')
  @Throttle({ limit: 3, ttl: 60 })
  callback(
    @Body() body: any,
    @Query() query: any,
    @Headers() headers: Record<string, string>,
    @Req() req: Request
  ) {
    const payload = { ...(query ?? {}), ...(body ?? {}) };
    this.assertAllowedIp(req.ip);
    return this.payments.handleZibalCallback(payload, headers);
  }

  private assertAllowedIp(remoteIp?: string) {
    const whitelist = (process.env.ZIBAL_CALLBACK_IP_WHITELIST ?? '')
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean);

    if (!whitelist.length || !remoteIp) return;

    const allowed = whitelist.some((ip) => remoteIp === ip || remoteIp?.startsWith(`${ip}`));
    if (!allowed) {
      throw new UnauthorizedException('callback source not allowed');
    }
  }
}
