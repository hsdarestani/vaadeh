import { IsMobilePhone, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsMobilePhone('fa-IR')
  mobile!: string;

  @IsString()
  @Length(4, 6)
  code!: string;
}
