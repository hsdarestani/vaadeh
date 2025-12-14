import { All, Body, Controller, Post, Query, UseGuards } from '@nestjs/common';
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
  verify(@Body('trackId') trackId: string) {
    return this.payments.verifyZibal(trackId);
  }

  @All('zibal/callback')
  callback(@Body() body: any, @Query() query: any) {
    const payload = { ...(query ?? {}), ...(body ?? {}) };
    return this.payments.handleZibalCallback(payload);
  }
}
