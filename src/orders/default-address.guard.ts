import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AddressesService } from '../addresses/addresses.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class DefaultAddressGuard implements CanActivate {
  constructor(private readonly addresses: AddressesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as { userId: string } | undefined;
    if (!user?.userId) return false;
    const body = request.body as CreateOrderDto;
    if (body?.addressPayload) return true;
    await this.addresses.ensureDefaultAddress(user.userId);
    return true;
  }
}
