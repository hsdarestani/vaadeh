import { PrismaClient, DeliveryType, OrderStatus, UserRole } from '@prisma/client';
import { config } from 'dotenv';

config();
const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.upsert({
    where: { phone: '+10000000000' },
    update: { role: UserRole.admin },
    create: {
      phone: '+10000000000',
      telegramChatId: null,
      role: UserRole.admin
    }
  });

  const vendor = await prisma.vendor.upsert({
    where: { name: 'Demo Vendor' },
    update: {},
    create: {
      name: 'Demo Vendor',
      location: 'Demo City',
      serviceRadius: 8
    }
  });

  const menuItem = await prisma.menuItem.upsert({
    where: { id: 'demo-item' },
    update: {},
    create: {
      id: 'demo-item',
      name: 'Sample Sandwich',
      price: 9.99,
      vendorId: vendor.id
    }
  });

  await prisma.order.create({
    data: {
      userId: admin.id,
      vendorId: vendor.id,
      deliveryType: DeliveryType.INTERNAL,
      totalPrice: 9.99,
      status: OrderStatus.PENDING,
      items: {
        create: [{
          menuItemId: menuItem.id,
          quantity: 1,
          price: 9.99
        }]
      }
    }
  });

  console.log('Seed completed', { admin: admin.phone, vendor: vendor.name });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
