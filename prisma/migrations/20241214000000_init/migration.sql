-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'ACCEPTED', 'IN_DELIVERY', 'COMPLETED', 'REJECTED');
CREATE TYPE "DeliveryType" AS ENUM ('INTERNAL', 'SNAPP');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "telegramChatId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Address" (
    "id" SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "text" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT FALSE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" SERIAL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT TRUE,
    "serviceRadius" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" SERIAL PRIMARY KEY,
    "vendorId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10, 2) NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "vendorId" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryType" "DeliveryType" NOT NULL,
    "totalPrice" DECIMAL(10, 2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" SERIAL PRIMARY KEY,
    "orderId" INTEGER NOT NULL,
    "menuItemId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DECIMAL(10, 2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EventLog" (
    "id" SERIAL PRIMARY KEY,
    "eventName" TEXT NOT NULL,
    "userId" INTEGER,
    "orderId" INTEGER,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");
CREATE INDEX "Address_userId_idx" ON "Address"("userId");
CREATE INDEX "MenuItem_vendorId_idx" ON "MenuItem"("vendorId");
CREATE INDEX "Order_userId_idx" ON "Order"("userId");
CREATE INDEX "Order_vendorId_idx" ON "Order"("vendorId");
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_menuItemId_idx" ON "OrderItem"("menuItemId");
CREATE INDEX "EventLog_userId_idx" ON "EventLog"("userId");
CREATE INDEX "EventLog_orderId_idx" ON "EventLog"("orderId");

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "EventLog" ADD CONSTRAINT "EventLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventLog" ADD CONSTRAINT "EventLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
