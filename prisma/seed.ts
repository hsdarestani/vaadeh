import { PrismaClient, DeliveryType, OrderStatus, PaymentProvider, PaymentStatus, UserRole, Prisma } from '@prisma/client';
import { config } from 'dotenv';

config();
const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.upsert({
    where: { mobile: '+10000000000' },
    update: { role: UserRole.ADMIN, lastLoginAt: new Date() },
    create: { mobile: '+10000000000', role: UserRole.ADMIN, lastLoginAt: new Date() }
  });

  const customer = await prisma.user.upsert({
    where: { mobile: '+19999999999' },
    update: { lastLoginAt: new Date() },
    create: { mobile: '+19999999999', role: UserRole.CUSTOMER, lastLoginAt: new Date() }
  });

  const address = await prisma.address.upsert({
    where: { id: 'demo-address' },
    update: {},
    create: {
      id: 'demo-address',
      userId: customer.id,
      title: 'خانه',
      lat: 35.6892,
      lng: 51.389,
      fullAddress: 'تهران - خیابان انقلاب',
      isDefault: true
    }
  });

  const vendor = await prisma.vendor.upsert({
    where: { name: 'Demo Vendor' },
    update: {},
    create: {
      name: 'Demo Vendor',
      lat: 35.6895,
      lng: 51.389,
      serviceRadiusKm: 10,
      isActive: true
    }
  });

  const sandwich = await prisma.menuItem.create({
    data: { vendorId: vendor.id, name: 'ساندویچ ویژه' }
  });

  const regularVariant = await prisma.menuVariant.create({
    data: { menuItemId: sandwich.id, code: 'REG', price: new Prisma.Decimal(250000) }
  });
  const largeVariant = await prisma.menuVariant.create({
    data: { menuItemId: sandwich.id, code: 'LG', price: new Prisma.Decimal(320000) }
  });

  const order = await prisma.order.create({
    data: {
      userId: customer.id,
      vendorId: vendor.id,
      addressSnapshot: {
        title: address.title,
        lat: address.lat,
        lng: address.lng,
        fullAddress: address.fullAddress
      },
      deliveryType: DeliveryType.IN_RANGE,
      deliveryFee: new Prisma.Decimal(0),
      totalPrice: new Prisma.Decimal(570000),
      status: OrderStatus.PAID,
      items: {
        create: [
          { menuVariantId: regularVariant.id, qty: 1, unitPrice: regularVariant.price },
          { menuVariantId: largeVariant.id, qty: 1, unitPrice: largeVariant.price }
        ]
      },
      history: { create: [{ status: OrderStatus.PAID }, { status: OrderStatus.SENT_TO_VENDOR }] }
    }
  });

  await prisma.payment.create({
    data: {
      orderId: order.id,
      userId: customer.id,
      provider: PaymentProvider.ZIBAL,
      trackId: `seed-${Date.now()}`,
      amount: new Prisma.Decimal(570000),
      status: PaymentStatus.VERIFIED,
      verifiedAt: new Date()
    }
  });

  console.log('Seed completed', { admin: admin.mobile, vendor: vendor.name });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
