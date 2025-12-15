import { BadRequestException, Body, Controller, ForbiddenException, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { SnappService } from './snapp.service';

@Controller('orders/snapp')
@UseGuards()
export class SnappWebhookController {
  constructor(private readonly orders: OrdersService, private readonly snapp: SnappService) {}

  @Post('webhook')
  async handleWebhook(@Req() req: any, @Body() body: any, @Headers('x-snapp-signature') signature?: string) {
    const rawPayload = req?.rawBody ? req.rawBody.toString() : JSON.stringify(body);
    if (process.env.NODE_ENV === 'production' && !this.snapp.verifyWebhookSignature(rawPayload, signature)) {
      throw new ForbiddenException('Invalid Snapp signature');
    }
    const parsed = this.snapp.parseWebhook(body);
    if (!parsed) {
      throw new BadRequestException('Invalid Snapp payload');
    }
    return this.orders.handleSnappWebhook(parsed);
  }
}
