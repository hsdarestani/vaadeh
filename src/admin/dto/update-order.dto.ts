import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { CourierStatus, DeliveryProvider, DeliverySettlementType, OrderStatus } from '@prisma/client';

export class UpdateOrderDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  deliveryFee?: number;

  @IsOptional()
  @IsString()
  adminNote?: string;

  @IsOptional()
  @IsString()
  statusNote?: string;

  @IsOptional()
  @IsString()
  courierReference?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  deliveryFeeFinal?: number;

  @IsOptional()
  @IsEnum(CourierStatus)
  courierStatus?: CourierStatus;

  @IsOptional()
  @IsEnum(DeliveryProvider)
  deliveryProvider?: DeliveryProvider;

  @IsOptional()
  @IsEnum(DeliverySettlementType)
  deliverySettlementType?: DeliverySettlementType;

  @IsOptional()
  isCOD?: boolean;

  @IsOptional()
  deliveryPricing?: Record<string, unknown>;
}
