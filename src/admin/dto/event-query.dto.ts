import { EventActorType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';

export class EventQueryDto {
  @IsOptional()
  @IsString()
  eventName?: string;

  @IsOptional()
  @IsEnum(EventActorType)
  actorType?: EventActorType;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  vendorId?: string;

  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  from?: Date;

  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  to?: Date;

  @IsOptional()
  @Transform(({ value }) => Number(value) || 100)
  limit?: number;

  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: 'json' | 'csv';
}
