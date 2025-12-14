import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    return this.prisma.address.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async create(userId: string, dto: CreateAddressDto) {
    if (dto.isDefault) {
      await this.prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }

    const existingDefault = await this.prisma.address.findFirst({ where: { userId, isDefault: true } });
    const forceDefault = !existingDefault;

    const address = await this.prisma.address.create({
      data: {
        userId,
        title: dto.title,
        lat: dto.lat,
        lng: dto.lng,
        fullAddress: dto.fullAddress,
        isDefault: dto.isDefault || forceDefault
      }
    });

    return address;
  }

  async ensureDefaultAddress(userId: string) {
    const address = await this.prisma.address.findFirst({ where: { userId, isDefault: true } });
    if (!address) {
      throw new BadRequestException('Default address is required to place orders');
    }
    return address;
  }

  async listByTelegramUser(telegramUserId: number) {
    const user = await this.prisma.user.findUnique({ where: { telegramUserId: telegramUserId.toString() } });
    if (!user || user.isBlocked || !user.isActive) return [];

    return this.list(user.id);
  }
}
