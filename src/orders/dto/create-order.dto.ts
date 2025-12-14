import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsPositive, IsString, ValidateNested } from 'class-validator';
import { DeliveryType } from '@prisma/client';

class CreateOrderItemDto {
  @IsString()
  menuItemId!: string;

  @Type(() => Number)
  @IsPositive()
  quantity!: number;
}

export class CreateOrderDto {
  @IsString()
  userId!: string;

  @IsString()
  vendorId!: string;

  @IsEnum(DeliveryType)
  deliveryType!: DeliveryType;

  @IsNumber()
  @IsPositive()
  totalPrice!: number;

  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
