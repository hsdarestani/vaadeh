import { Type } from 'class-transformer';
import { IsInt, IsPositive, IsString, ValidateNested } from 'class-validator';

class CartItemDto {
  @IsString()
  menuVariantId!: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  qty!: number;
}

export class CreateOrderDto {
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items!: CartItemDto[];
}
