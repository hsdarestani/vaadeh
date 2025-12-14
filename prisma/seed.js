const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const vendor = await prisma.vendor.upsert({
    where: { name: 'Demo Vendor' },
    update: {},
    create: {
      name: 'Demo Vendor',
      location: 'Downtown',
      active: true,
      serviceRadius: 5,
      menuItems: {
        create: [
          {
            name: 'Signature Burger',
            price: '9.99',
            available: true,
          },
          {
            name: 'Veggie Wrap',
            price: '7.50',
            available: true,
          },
          {
            name: 'Fries',
            price: '3.25',
            available: true,
          },
        ],
      },
    },
    include: { menuItems: true },
  });

  const adminUser = await prisma.user.upsert({
    where: { phone: '+10000000000' },
    update: {},
    create: {
      phone: '+10000000000',
      telegramChatId: '10001',
      addresses: {
        create: {
          lat: 35.6895,
          lng: 51.3890,
          text: 'Demo HQ Address',
          isDefault: true,
        },
      },
    },
    include: { addresses: true },
  });

  console.log('Seeded vendor:', vendor.name);
  console.log('Seeded admin user:', adminUser.phone);
}

main()
  .catch((e) => {
    console.error('Seed error', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
