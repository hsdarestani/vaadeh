import { Injectable } from '@nestjs/common';
import { EventActorType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProductEventService } from '../event-log/product-event.service';

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService, private readonly productEvents: ProductEventService) {}

  async listActiveMenu() {
    const vendors = await this.prisma.vendor.findMany({
      where: { isActive: true },
      include: {
        menuItems: {
          where: { isActive: true },
          include: {
            variants: {
              where: { isAvailable: true }
            }
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    const response = vendors
      .map((vendor) => ({
        ...vendor,
        menuItems: vendor.menuItems
          .map((item) => ({ ...item, variants: item.variants }))
          .filter((item) => item.variants.length > 0)
      }))
      .filter((vendor) => vendor.menuItems.length > 0);

    await this.productEvents.track('menu_view', {
      actorType: EventActorType.USER,
      metadata: { vendorCount: response.length }
    });

    return response;
  }
}
