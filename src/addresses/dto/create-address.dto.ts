import { IsBoolean, IsLatitude, IsLongitude, IsOptional, IsString } from 'class-validator';

export class CreateAddressDto {
  @IsString()
  title!: string;

  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  @IsString()
  fullAddress!: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
