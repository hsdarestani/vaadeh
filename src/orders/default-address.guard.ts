import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AddressesService } from '../addresses/addresses.service';

@Injectable()
export class DefaultAddressGuard implements CanActivate {
  constructor(private readonly addresses: AddressesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as { userId: string } | undefined;
    if (!user?.userId) return false;
    await this.addresses.ensureDefaultAddress(user.userId);
    return true;
  }
}
