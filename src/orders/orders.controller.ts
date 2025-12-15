import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DefaultAddressGuard } from './default-address.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @UseGuards(DefaultAddressGuard)
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreateOrderDto) {
    return this.orders.create(user.userId, dto);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: OrderStatus, @Body('note') note?: string) {
    return this.orders.transition(id, status, note);
  }
}
