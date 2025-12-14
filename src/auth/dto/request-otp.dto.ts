import { IsMobilePhone } from 'class-validator';

export class RequestOtpDto {
  @IsMobilePhone('fa-IR')
  mobile!: string;
}
