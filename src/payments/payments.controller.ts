import { All, Body, Controller, Headers, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('zibal/request')
  @UseGuards(JwtAuthGuard)
  request(@CurrentUser() user: { userId: string }, @Body('orderId') orderId: string) {
    return this.payments.requestZibal(orderId, user.userId);
  }

  @Post('zibal/verify')
  @Throttle(10, 60)
  verify(@Body() body: { trackId: string; orderId?: string }, @Headers() headers: Record<string, string>) {
    return this.payments.verifyZibal(body.trackId, body, headers);
  }

  @All('zibal/callback')
  @Throttle(15, 60)
  callback(@Body() body: any, @Query() query: any, @Headers() headers: Record<string, string>) {
    const payload = { ...(query ?? {}), ...(body ?? {}) };
    return this.payments.handleZibalCallback(payload, headers);
  }
}
