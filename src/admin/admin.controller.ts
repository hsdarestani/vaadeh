import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminService } from './admin.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { CreateMenuVariantDto } from './dto/create-menu-variant.dto';
import { UpdateMenuVariantDto } from './dto/update-menu-variant.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { EventQueryDto } from './dto/event-query.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATOR)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('vendors')
  listVendors() {
    return this.admin.listVendors();
  }

  @Post('vendors')
  @Roles(UserRole.ADMIN)
  createVendor(@Body() dto: CreateVendorDto) {
    return this.admin.createVendor(dto);
  }

  @Patch('vendors/:id')
  @Roles(UserRole.ADMIN)
  updateVendor(@Param('id') id: string, @Body() dto: UpdateVendorDto) {
    return this.admin.updateVendor(id, dto);
  }

  @Post('vendors/:vendorId/menu-items')
  @Roles(UserRole.ADMIN)
  createMenuItem(@Param('vendorId') vendorId: string, @Body() dto: CreateMenuItemDto) {
    return this.admin.createMenuItem(vendorId, dto);
  }

  @Patch('menu-items/:id')
  @Roles(UserRole.ADMIN)
  updateMenuItem(@Param('id') id: string, @Body() dto: UpdateMenuItemDto) {
    return this.admin.updateMenuItem(id, dto);
  }

  @Post('menu-items/:menuItemId/variants')
  @Roles(UserRole.ADMIN)
  createMenuVariant(@Param('menuItemId') menuItemId: string, @Body() dto: CreateMenuVariantDto) {
    return this.admin.createMenuVariant(menuItemId, dto);
  }

  @Patch('menu-variants/:id')
  @Roles(UserRole.ADMIN)
  updateMenuVariant(@Param('id') id: string, @Body() dto: UpdateMenuVariantDto) {
    return this.admin.updateMenuVariant(id, dto);
  }

  @Get('orders')
  listOrders() {
    return this.admin.listOrders();
  }

  @Patch('orders/:id')
  @Roles(UserRole.ADMIN)
  updateOrder(@Param('id') id: string, @Body() dto: UpdateOrderDto) {
    return this.admin.updateOrder(id, dto);
  }

  @Get('users')
  listUsers() {
    return this.admin.listUsers();
  }

  @Get('users/:id/orders')
  getUserOrders(@Param('id') id: string) {
    return this.admin.getUserOrders(id);
  }

  @Patch('users/:id')
  @Roles(UserRole.ADMIN)
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.admin.updateUser(id, dto);
  }

  @Get('kpis')
  kpis() {
    return this.admin.kpis();
  }

  @Get('payments')
  listPayments() {
    return this.admin.listPayments();
  }

  @Get('notifications')
  notificationLog() {
    return this.admin.notificationLog();
  }

  @Get('notifications/health')
  notificationHealth() {
    return this.admin.notificationHealth();
  }

  @Get('funnel')
  funnel() {
    return this.admin.funnel();
  }

  @Get('events')
  eventLog(@Query() query: EventQueryDto, @Res() res: Response) {
    return this.admin.eventLog(query, res);
  }
}
