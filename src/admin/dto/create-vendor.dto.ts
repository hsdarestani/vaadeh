import { IsBoolean, IsLatitude, IsLongitude, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateVendorDto {
  @IsString()
  name!: string;

  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  @IsNumber()
  @IsPositive()
  serviceRadiusKm!: number;

  @IsOptional()
  @IsString()
  telegramChatId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
