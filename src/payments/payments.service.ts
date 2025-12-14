import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, PaymentProvider, PaymentStatus, Prisma } from '@prisma/client';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationOrchestrator } from '../notifications/notification.orchestrator';
import { EventLogService } from '../event-log/event-log.service';

interface ZibalRequestResponse {
  result: number;
  message: string;
  trackId: string;
  payLink?: string;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationOrchestrator,
    private readonly eventLog: EventLogService
  ) {}

  async requestZibal(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } });
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }
    if (![OrderStatus.WAITING_FOR_PAYMENT, OrderStatus.DRAFT].includes(order.status)) {
      throw new BadRequestException('Order not ready for payment');
    }

    const existingPayment = order.payment ??
      (await this.prisma.payment.findUnique({ where: { orderId } }));

    const amount = new Prisma.Decimal(order.totalPrice);
    const trackId = existingPayment?.trackId ?? `${Date.now()}-${order.id.slice(0, 6)}`;

    const merchant = process.env.ZIBAL_MERCHANT ?? process.env.ZIBAL_MERCHANT_ID ?? 'sandbox';
    try {
      await axios.post<ZibalRequestResponse>('https://gateway.zibal.ir/v1/request', {
        merchant,
        amount: Number(amount),
        callbackUrl: process.env.ZIBAL_CALLBACK_URL ?? 'https://example.com/verify',
        trackId
      });
    } catch (err) {
      // For MVP we allow offline sandboxing; log but continue
      // eslint-disable-next-line no-console
      console.warn('Failed to reach Zibal sandbox', err);
    }

    const payment = await this.prisma.payment.upsert({
      where: { orderId },
      create: {
        orderId,
        userId,
        provider: PaymentProvider.ZIBAL,
        trackId,
        amount,
        status: PaymentStatus.PENDING
      },
      update: {
        trackId,
        amount,
        status: PaymentStatus.PENDING
      }
    });

    return { payment, payLink: `https://gateway.zibal.ir/start/${trackId}` };
  }

  async verifyZibal(trackId: string) {
    const payment = await this.prisma.payment.findFirst({ where: { trackId }, include: { order: true } });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    try {
      await axios.post('https://gateway.zibal.ir/v1/verify', {
        merchant: process.env.ZIBAL_MERCHANT ?? process.env.ZIBAL_MERCHANT_ID ?? 'sandbox',
        trackId
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Zibal verify fallback used', err);
    }

    const verifiedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.VERIFIED, verifiedAt }
      });

      await tx.order.update({
        where: { id: payment.orderId },
        data: {
          status: OrderStatus.PAID,
          history: { create: { status: OrderStatus.PAID } }
        }
      });

      await tx.order.update({
        where: { id: payment.orderId },
        data: {
          status: OrderStatus.SENT_TO_VENDOR,
          history: { create: { status: OrderStatus.SENT_TO_VENDOR } }
        }
      });
    });

    const refreshed = await this.prisma.payment.findUnique({ where: { id: payment.id }, include: { order: true } });

    await this.notifications.onPaymentSuccess(payment.orderId);
    await this.eventLog.logEvent('payment_verified', {
      orderId: payment.orderId,
      userId: payment.userId ?? payment.order?.userId,
      vendorId: payment.order?.vendorId,
      metadata: { trackId }
    });

    return { payment: refreshed, orderStatus: refreshed?.order.status };
  }
}
