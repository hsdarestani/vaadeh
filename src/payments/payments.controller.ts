import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService } from './payments.service';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('zibal/request')
  request(@CurrentUser() user: { userId: string }, @Body('orderId') orderId: string) {
    return this.payments.requestZibal(orderId, user.userId);
  }

  @Post('zibal/verify')
  verify(@Body('trackId') trackId: string) {
    return this.payments.verifyZibal(trackId);
  }
}
