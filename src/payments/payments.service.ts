import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  EventActorType,
  OrderStatus,
  PaymentAttemptType,
  PaymentProvider,
  PaymentStatus,
  Prisma
} from '@prisma/client';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationOrchestrator } from '../notifications/notification.orchestrator';
import { EventLogService } from '../event-log/event-log.service';
import { ProductEventService } from '../event-log/product-event.service';

interface ZibalRequestResponse {
  result: number;
  message: string;
  trackId: string;
  payLink?: string;
}

interface ZibalVerifyResponse {
  result: number;
  message?: string;
  paidAt?: string;
  amount?: number;
  refNumber?: string;
}

@Injectable()
export class PaymentsService {
  private readonly merchantId: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationOrchestrator,
    private readonly eventLog: EventLogService,
    private readonly productEvents: ProductEventService
  ) {
    this.merchantId = process.env.ZIBAL_MERCHANT ?? process.env.ZIBAL_MERCHANT_ID ?? '';
    if (!this.merchantId) {
      throw new Error('ZIBAL_MERCHANT is required');
    }
  }

  private requireMerchant() {
    return this.merchantId;
  }

  private async markPaymentFailed(
    tx: Prisma.TransactionClient,
    paymentId: string,
    orderId: string,
    message: string,
    amount: Prisma.Decimal,
    rawResponse?: Record<string, any>
  ) {
    await tx.payment.update({ where: { id: paymentId }, data: { status: PaymentStatus.FAILED } });
    await tx.order.update({ where: { id: orderId }, data: { paymentStatus: PaymentStatus.FAILED } });
    await tx.paymentAttempt.create({
      data: {
        paymentId,
        requestId: rawResponse?.refNumber ?? rawResponse?.message ?? 'request_failed',
        trackId: rawResponse?.trackId ?? 'unknown',
        amount,
        status: PaymentStatus.FAILED,
        rawResponse: rawResponse ?? { message },
        type: PaymentAttemptType.REQUEST
      }
    });
  }

  async requestZibal(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } });
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }
    if (order.paymentStatus === PaymentStatus.NONE) {
      throw new BadRequestException('پرداخت برای این سفارش نیاز نیست');
    }
    if (order.paymentStatus === PaymentStatus.PAID) {
      return { payment: order.payment, payLink: null };
    }
    if (order.status !== OrderStatus.PLACED) {
      throw new BadRequestException('Order not ready for payment');
    }

    const existingPayment = order.payment ?? (await this.prisma.payment.findUnique({ where: { orderId } }));

    const amount = new Prisma.Decimal(order.totalPrice);
    const trackId = existingPayment?.trackId ?? `${Date.now()}-${order.id.slice(0, 6)}`;

    const merchant = this.requireMerchant();
    let responseData: ZibalRequestResponse | null = null;
    try {
      const { data } = await axios.post<ZibalRequestResponse>('https://gateway.zibal.ir/v1/request', {
        merchant,
        amount: Number(amount),
        callbackUrl: process.env.ZIBAL_CALLBACK_URL ?? 'https://example.com/verify',
        trackId
      });
      responseData = data;
      if (data.result !== 100) {
        throw new BadRequestException(data.message || 'Payment gateway rejected request');
      }
    } catch (err) {
      const message = err instanceof BadRequestException ? err.message : 'در حال حاضر امکان اتصال به درگاه نیست';
      const persisted = await this.prisma.$transaction(async (tx) => {
        const paymentRecord = await tx.payment.upsert({
          where: { orderId },
          create: {
            orderId,
            userId,
            provider: PaymentProvider.ZIBAL,
            trackId,
            amount,
            status: PaymentStatus.FAILED
          },
          update: { status: PaymentStatus.FAILED, amount, trackId }
        });
        await this.markPaymentFailed(tx, paymentRecord.id, orderId, message, amount, {
          message: err instanceof Error ? err.message : message,
          trackId
        });
        return paymentRecord;
      });

      await this.notifications.onPaymentFailed(orderId);
      throw new BadRequestException(message);
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      const persisted = await tx.payment.upsert({
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

      await tx.paymentAttempt.create({
        data: {
          paymentId: persisted.id,
          requestId: responseData?.trackId ?? trackId,
          trackId,
          amount,
          status: responseData?.result === 100 ? PaymentStatus.PENDING : PaymentStatus.FAILED,
          rawResponse: responseData ?? {},
          type: PaymentAttemptType.REQUEST
        }
      });

      await tx.order.update({ where: { id: orderId }, data: { paymentStatus: PaymentStatus.PENDING } });

      return persisted;
    });

    await this.productEvents.track('payment_requested', {
      actorType: EventActorType.USER,
      actorId: userId,
      orderId,
      metadata: { provider: 'ZIBAL', trackId }
    });

    return { payment, payLink: responseData?.payLink ?? `https://gateway.zibal.ir/start/${trackId}` };
  }

  async verifyZibal(trackId: string, rawPayload?: any) {
    const payment = await this.prisma.payment.findFirst({ where: { trackId }, include: { order: true } });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status === PaymentStatus.PAID) {
      return { payment, orderStatus: payment.order?.status, message: 'already verified' };
    }

    if (payment.status === PaymentStatus.FAILED) {
      return { payment, orderStatus: payment.order?.status, message: 'payment failed' };
    }

    let verifyData: ZibalVerifyResponse | null = null;
    try {
      const { data } = await axios.post<ZibalVerifyResponse>('https://gateway.zibal.ir/v1/verify', {
        merchant: this.requireMerchant(),
        trackId
      });
      verifyData = data;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Zibal verify failed', err);
    }

    const providerOk = verifyData?.result === 100;
    const amountMatches = verifyData?.amount === undefined || Number(verifyData.amount) === Number(payment.amount);
    const orderMatches = rawPayload?.orderId ? rawPayload.orderId === payment.orderId : true;
    const success = providerOk && amountMatches && orderMatches;
    const verifiedAt = success ? new Date() : undefined;

    await this.prisma.$transaction(async (tx) => {
      const persisted = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: success ? PaymentStatus.PAID : PaymentStatus.FAILED,
          verifiedAt: verifiedAt ?? payment.verifiedAt
        }
      });

      await tx.paymentAttempt.create({
        data: {
          paymentId: payment.id,
          requestId: verifyData?.refNumber ?? verifyData?.message ?? trackId,
          trackId,
          amount: payment.amount,
          status: success ? PaymentStatus.PAID : PaymentStatus.FAILED,
          rawResponse: verifyData ?? rawPayload ?? {},
          type: PaymentAttemptType.VERIFY
        }
      });

      await tx.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: success ? PaymentStatus.PAID : PaymentStatus.FAILED }
      });

      if (success && payment.order) {
        await tx.order.update({
          where: { id: payment.orderId },
          data: {
            status: payment.order.status === OrderStatus.PLACED ? OrderStatus.PLACED : payment.order.status,
            history:
              payment.order.status === OrderStatus.PLACED
                ? { create: { status: OrderStatus.PLACED, note: 'پرداخت موفق تایید شد' } }
                : undefined
          }
        });
      }

      return persisted;
    });

    const refreshed = await this.prisma.payment.findUnique({ where: { id: payment.id }, include: { order: true } });

    if (success) {
      await this.notifications.onPaymentSuccess(payment.orderId);
      await this.eventLog.logEvent('payment_verified', {
        orderId: payment.orderId,
        userId: payment.userId ?? payment.order?.userId,
        vendorId: payment.order?.vendorId,
        actorType: EventActorType.USER,
        metadata: { trackId }
      });
      await this.productEvents.track('payment_paid', {
        actorType: EventActorType.USER,
        actorId: payment.userId ?? payment.order?.userId ?? undefined,
        orderId: payment.orderId,
        metadata: { provider: 'ZIBAL', trackId }
      });
    } else {
      await this.notifications.onPaymentFailed(payment.orderId);
      await this.productEvents.track('payment_failed', {
        actorType: EventActorType.USER,
        actorId: payment.userId ?? payment.order?.userId ?? undefined,
        orderId: payment.orderId,
        metadata: { provider: 'ZIBAL', trackId }
      });
    }

    return { payment: refreshed, orderStatus: refreshed?.order.status, success };
  }

  async handleZibalCallback(payload: Record<string, any>) {
    const trackId = payload.trackId ?? payload.trackid ?? payload.trackID;
    if (!trackId) {
      throw new BadRequestException('trackId is required');
    }

    const payment = await this.prisma.payment.findFirst({ where: { trackId }, include: { order: true } });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const amountMatches = payload?.amount ? Number(payload.amount) === Number(payment.amount) : true;
    const orderMatches = payload?.orderId ? payload.orderId === payment.orderId : true;

    await this.prisma.paymentAttempt.create({
      data: {
        paymentId: payment.id,
        requestId: payload?.orderId ?? payload?.result ?? payload?.success,
        trackId,
        amount: payment.amount,
        status: orderMatches && amountMatches ? PaymentStatus.PENDING : PaymentStatus.FAILED,
        rawResponse: payload,
        type: PaymentAttemptType.CALLBACK
      }
    });

    if (payment.status === PaymentStatus.PAID) {
      return { paymentStatus: payment.status, message: 'already verified' };
    }

    if (!orderMatches) {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED } });
      await this.prisma.order.update({ where: { id: payment.orderId }, data: { paymentStatus: PaymentStatus.FAILED } });
      await this.notifications.onPaymentFailed(payment.orderId);
      return { paymentStatus: PaymentStatus.FAILED, message: 'orderId mismatch' };
    }

    const successFlag =
      (payload?.success === '1' || payload?.success === 1 || payload?.result === 100) && amountMatches && orderMatches;
    if (!successFlag) {
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED } });
        if (payment.orderId) {
          await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: PaymentStatus.FAILED } });
        }
      });
      await this.notifications.onPaymentFailed(payment.orderId);
      return { paymentStatus: PaymentStatus.FAILED };
    }

    return this.verifyZibal(trackId, payload);
  }
}
