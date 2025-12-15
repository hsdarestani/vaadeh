import { BadRequestException, Injectable } from '@nestjs/common';
import { CourierStatus, DeliveryProvider, DeliveryType, OrderStatus, Vendor } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface MatchInput {
  vendor: Vendor;
  location: { lat: number; lng: number };
}

interface VendorMatchResult {
  vendor: Vendor;
  deliveryType: DeliveryType;
  deliveryProvider: DeliveryProvider;
  deliveryFee: number;
  distanceKm: number;
  courierStatus: CourierStatus;
  outOfZone: boolean;
  pricingBreakdown?: {
    baseFee: number;
    perKmRate: number;
    peakMultiplier: number;
    estimatedFee: number;
    distanceKm: number;
  };
}

@Injectable()
export class VendorMatchingService {
  constructor(private readonly prisma: PrismaService) {}

  private getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private async assertCapacity(vendorId: string, maxDailyOrders?: number) {
    if (!maxDailyOrders) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const todayOrders = await this.prisma.order.count({
      where: {
        vendorId,
        createdAt: { gte: start, lte: end },
        status: { notIn: [OrderStatus.CANCELLED, OrderStatus.VENDOR_REJECTED] }
      }
    });

    if (todayOrders >= maxDailyOrders) {
      throw new BadRequestException('ظرفیت وندور تکمیل است');
    }
  }

  async matchVendor(input: MatchInput): Promise<VendorMatchResult> {
    if (!input.vendor.isActive) {
      throw new BadRequestException('وندور غیرفعال است');
    }

    await this.assertCapacity(input.vendor.id, input.vendor.maxDailyOrders ?? undefined);

    const distanceKm = this.getDistanceKm(input.location.lat, input.location.lng, input.vendor.lat, input.vendor.lng);
    const snappMax = Number(process.env.SNAPP_COD_MAX_KM ?? 30);

    if (distanceKm > snappMax) {
      throw new BadRequestException('آدرس خارج از محدوده سرویس است');
    }

    const inRange = distanceKm <= input.vendor.serviceRadiusKm;
    const deliveryType = inRange ? DeliveryType.IN_ZONE_INTERNAL : DeliveryType.SNAPP_COURIER_OUT_OF_ZONE;
    const deliveryProvider = inRange ? DeliveryProvider.IN_HOUSE : DeliveryProvider.SNAPP;

    const baseFee = Number(process.env.SNAPP_BASE_FEE ?? 0);
    const perKmRate = Number(process.env.SNAPP_PER_KM_FEE ?? 0);
    const peakMultiplier = Number(process.env.SNAPP_PEAK_MULTIPLIER ?? 1);

    const deliveryFee = inRange ? Number(process.env.INTERNAL_DELIVERY_FEE ?? 0) : Math.max(0, baseFee + distanceKm * perKmRate * peakMultiplier);

    return {
      vendor: input.vendor,
      deliveryType,
      deliveryProvider,
      deliveryFee,
      distanceKm,
      courierStatus: inRange ? CourierStatus.PENDING : CourierStatus.REQUESTED,
      outOfZone: !inRange,
      pricingBreakdown: inRange
        ? undefined
        : { baseFee, perKmRate, peakMultiplier, estimatedFee: deliveryFee, distanceKm }
    };
  }
}
