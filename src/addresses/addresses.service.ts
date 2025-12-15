import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

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

  async update(userId: string, id: string, dto: UpdateAddressDto) {
    const address = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!address) {
      throw new BadRequestException('Address not found');
    }

    if (dto.isDefault) {
      await this.prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }

    return this.prisma.address.update({
      where: { id },
      data: {
        title: dto.title ?? address.title,
        lat: dto.lat ?? address.lat,
        lng: dto.lng ?? address.lng,
        fullAddress: dto.fullAddress ?? address.fullAddress,
        isDefault: dto.isDefault ?? address.isDefault
      }
    });
  }

  async remove(userId: string, id: string) {
    const address = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!address) {
      throw new BadRequestException('Address not found');
    }

    await this.prisma.address.delete({ where: { id } });

    if (address.isDefault) {
      const replacement = await this.prisma.address.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
      if (replacement) {
        await this.prisma.address.update({ where: { id: replacement.id }, data: { isDefault: true } });
      }
    }
  }

  async setDefault(userId: string, id: string) {
    const address = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!address) {
      throw new BadRequestException('Address not found');
    }

    await this.prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    await this.prisma.address.update({ where: { id }, data: { isDefault: true } });
    return this.ensureDefaultAddress(userId);
  }

  async listByTelegramUser(telegramUserId: number) {
    const user = await this.prisma.user.findUnique({ where: { telegramUserId: telegramUserId.toString() } });
    if (!user || user.isBlocked || !user.isActive) return [];

    return this.list(user.id);
  }
}
