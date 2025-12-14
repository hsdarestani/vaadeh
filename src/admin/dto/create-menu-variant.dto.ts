import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateMenuVariantDto {
  @IsString()
  code!: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  price!: number;

  @IsOptional()
  @IsString()
  menuItemId?: string;
}
