import { IsBoolean, IsLatitude, IsLongitude, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class UpdateVendorDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsLongitude()
  lng?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  serviceRadiusKm?: number;

  @IsOptional()
  @IsString()
  telegramChatId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
