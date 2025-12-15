import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { EventActorType, OrderStatus, UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { DefaultAddressGuard } from './default-address.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @UseGuards(DefaultAddressGuard)
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreateOrderDto) {
    return this.orders.create(user.userId, dto);
  }

  @Get()
  list(@CurrentUser() user: { userId: string }) {
    return this.orders.listForUser(user.userId);
  }

  @Get(':id')
  get(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.orders.getForUser(id, user.userId);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.VENDOR, UserRole.CUSTOMER)
  async updateStatus(
    @CurrentUser() user: { userId: string; role?: UserRole },
    @Param('id') id: string,
    @Body('status') status: OrderStatus,
    @Body('note') note?: string
  ) {
    const order = await this.orders.getOrder(id);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (user.role === UserRole.ADMIN) {
      return this.orders.transition(id, status, note, EventActorType.ADMIN, user.userId);
    }

    if (user.role === UserRole.VENDOR) {
      const vendor = await this.orders.getVendorForUser(user.userId);
      if (!vendor || vendor.id !== order.vendorId) {
        throw new ForbiddenException('Vendor not authorized for this order');
      }
      return this.orders.transition(id, status, note, EventActorType.VENDOR, vendor.id);
    }

    if (user.role === UserRole.CUSTOMER) {
      if (order.userId !== user.userId) {
        throw new ForbiddenException('Insufficient permissions');
      }
      const cancellableStatuses = [OrderStatus.DRAFT, OrderStatus.PLACED];
      if (status !== OrderStatus.CANCELLED || !cancellableStatuses.includes(order.status)) {
        throw new ForbiddenException('Only pending orders can be cancelled');
      }
      return this.orders.transition(id, status, note, EventActorType.USER, user.userId);
    }

    throw new ForbiddenException('Insufficient permissions');
  }
}
