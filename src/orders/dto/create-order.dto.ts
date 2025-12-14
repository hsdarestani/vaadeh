import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested
} from 'class-validator';
import { DeliveryType } from '@prisma/client';

class CartItemDto {
  @IsString()
  menuVariantId!: string;

  @Type(() => Number)
  @IsNumber()
  qty!: number;
}

class AddressPayloadDto {
  @IsString()
  title!: string;

  @Type(() => Number)
  @IsNumber()
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  lng!: number;

  @IsString()
  fullAddress!: string;
}

class LocationDto {
  @Type(() => Number)
  @IsNumber()
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  lng!: number;
}

export class CreateOrderDto {
  @IsOptional()
  @IsUUID()
  addressId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AddressPayloadDto)
  addressPayload?: AddressPayloadDto;

  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items!: CartItemDto[];

  @IsOptional()
  @IsEnum(DeliveryType)
  deliveryType?: DeliveryType;

  @IsOptional()
  @IsString()
  customerNote?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;
}
