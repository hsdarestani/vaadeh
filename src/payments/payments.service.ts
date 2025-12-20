import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import {
  DeliverySettlementType,
  EventActorType,
  OrderStatus,
  PaymentAttemptType,
  PaymentProvider,
  PaymentStatus,
  Prisma
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import axios from 'axios';
import crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationOrchestrator } from '../notifications/notification.orchestrator';
import { EventLogService } from '../event-log/event-log.service';
import { ProductEventService } from '../event-log/product-event.service';
import { RateLimitService } from '../middleware/rate-limit.service';
import { RedisService } from '../redis/redis.service';

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
    private readonly productEvents: ProductEventService,
    private readonly rateLimit: RateLimitService,
    private readonly redis: RedisService
  ) {
    this.merchantId = process.env.ZIBAL_MERCHANT ?? process.env.ZIBAL_MERCHANT_ID ?? '';
    if (!this.merchantId) {
      throw new Error('ZIBAL_MERCHANT is required');
    }
  }

  private requireMerchant() {
    return this.merchantId;
  }

  private validateSignature(payload: Record<string, any>, headers?: Record<string, string>) {
    const secret = process.env.ZIBAL_CALLBACK_SECRET;
    const signatureHeader = headers?.['x-zibal-signature'] ?? headers?.['X-Zibal-Signature'];
    const timestamp = headers?.['x-zibal-timestamp'] ?? headers?.['X-Zibal-Timestamp'];
    const body = JSON.stringify(payload ?? {});
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('callback signature required');
      }
      return true;
    }
    if (!signatureHeader) throw new UnauthorizedException('missing signature');
    if (timestamp) {
      const skew = Math.abs(Date.now() - Number(timestamp));
      if (Number.isFinite(skew) && skew > 5 * 60 * 1000) {
        throw new UnauthorizedException('stale callback');
      }
    }
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    if (expected !== signatureHeader) {
      throw new UnauthorizedException('invalid signature');
    }
    return true;
  }

  private async guardReplay(trackId: string, signature?: string) {
    const client = this.redis.getClient();
    const key = `zibal:cb:${trackId}:${signature ?? 'none'}`;
    const existing = await client.get(key);
    if (existing) {
      throw new BadRequestException('duplicate callback');
    }
    await client.set(key, '1', 'PX', 10 * 60 * 1000);
  }

  private async markPaymentFailed(
    tx: Prisma.TransactionClient,
    paymentId: string,
    orderId: string,
    message: string,
    amount: Decimal,
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
    this.rateLimit.assertWithinLimit(`payment-request:${userId}`, 3, 10 * 60 * 1000);
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } });
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }
    if (order.paymentStatus === PaymentStatus.NONE || order.deliverySettlementType === DeliverySettlementType.COD) {
      throw new BadRequestException('پرداخت برای این سفارش نیاز نیست');
    }
    if (order.paymentStatus === PaymentStatus.PAID) {
      return { payment: order.payment, payLink: null };
    }
    if (order.status !== OrderStatus.PLACED) {
      throw new BadRequestException('Order not ready for payment');
    }

    const existingPayment = order.payment ?? (await this.prisma.payment.findUnique({ where: { orderId } }));

    const amount = new Decimal(order.totalPrice);
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
      if (data.result !== 100 || !data.payLink || !data.trackId) {
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

    const effectiveTrackId = responseData?.trackId ?? trackId;

    const payment = await this.prisma.$transaction(async (tx) => {
      const persisted = await tx.payment.upsert({
        where: { orderId },
        create: {
          orderId,
          userId,
          provider: PaymentProvider.ZIBAL,
          trackId: effectiveTrackId,
          amount,
          status: PaymentStatus.PENDING
        },
        update: {
          trackId: effectiveTrackId,
          amount,
          status: PaymentStatus.PENDING
        }
      });

      await tx.paymentAttempt.create({
        data: {
          paymentId: persisted.id,
          requestId: responseData?.trackId ?? trackId,
          trackId: effectiveTrackId,
          amount,
          status: responseData?.result === 100 ? PaymentStatus.PENDING : PaymentStatus.FAILED,
          rawResponse: responseData ?? {},
          type: PaymentAttemptType.REQUEST
        }
      });

      await tx.order.update({ where: { id: orderId }, data: { paymentStatus: PaymentStatus.PENDING } });

      return persisted;
      });

      await this.productEvents.track('payment_initiated', {
        actorType: EventActorType.USER,
        actorId: userId,
        orderId,
        metadata: { provider: 'ZIBAL', trackId: effectiveTrackId }
      });
      await this.productEvents.track('payment_requested', {
        actorType: EventActorType.USER,
        actorId: userId,
        orderId,
        metadata: { provider: 'ZIBAL', trackId: effectiveTrackId }
      });
      await this.eventLog.logEvent('PAYMENT_REQUESTED', {
        orderId,
        userId,
        actorType: EventActorType.USER,
        metadata: { provider: 'ZIBAL', trackId: effectiveTrackId, amount: Number(amount) }
      });

      return { payment, payLink: responseData?.payLink };
    }

  async verifyZibal(
    trackId: string,
    rawPayload?: any,
    headers?: Record<string, string>,
    skipReplayGuard = false
  ) {
    this.validateSignature(rawPayload ?? {}, headers);
    if (!skipReplayGuard) {
      await this.guardReplay(trackId, headers?.['x-zibal-signature']);
    }
    this.rateLimit.assertWithinLimit(`payment-verify:${trackId}`, 5, 10 * 60 * 1000);
    const payment = await this.prisma.payment.findFirst({ where: { trackId }, include: { order: true } });
    if (!payment) {
      throw new NotFoundException('Payment not found');
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
    const amountMatches = verifyData?.amount !== undefined && Number(verifyData.amount) === Number(payment.amount);
    const orderMatches = rawPayload?.orderId ? rawPayload.orderId === payment.orderId : true;
    const success = providerOk && amountMatches && orderMatches;
    const verifiedAt = success ? new Date() : undefined;

    const result = await this.prisma.$transaction(async (tx) => {
      const latest = await tx.payment.findUnique({ where: { id: payment.id }, include: { order: true } });
      if (!latest) {
        throw new NotFoundException('Payment not found');
      }

      if (latest.status === PaymentStatus.PAID) {
        return { payment: latest, alreadyFinal: true };
      }
      if (latest.status === PaymentStatus.FAILED && !success) {
        return { payment: latest, alreadyFinal: true };
      }

      const persisted = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: success ? PaymentStatus.PAID : PaymentStatus.FAILED,
          verifiedAt: verifiedAt ?? latest.verifiedAt,
          refNumber: verifyData?.refNumber ?? latest.refNumber,
          transactionId: verifyData?.refNumber ?? latest.transactionId
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

      if (success && latest.order) {
        await tx.order.update({
          where: { id: payment.orderId },
          data: {
            status: latest.order.status === OrderStatus.PLACED ? OrderStatus.PLACED : latest.order.status,
            history:
              latest.order.status === OrderStatus.PLACED
                ? { create: { status: OrderStatus.PLACED, note: 'پرداخت موفق تایید شد' } }
                : undefined
          }
        });
      }

      const refreshed = await tx.payment.findUnique({ where: { id: payment.id }, include: { order: true } });
      return { payment: refreshed!, alreadyFinal: false };
    });

    if (success && !result.alreadyFinal) {
      await this.notifications.onPaymentSuccess(payment.orderId);
      await this.eventLog.logEvent('PAYMENT_VERIFIED', {
        orderId: payment.orderId,
        userId: payment.userId ?? payment.order?.userId,
        vendorId: payment.order?.vendorId,
        actorType: EventActorType.USER,
        metadata: { trackId }
      });
      await this.productEvents.track('payment_verified', {
        actorType: EventActorType.USER,
        actorId: payment.userId ?? payment.order?.userId ?? undefined,
        orderId: payment.orderId,
        metadata: { provider: 'ZIBAL', trackId }
      });
      await this.productEvents.track('payment_paid', {
        actorType: EventActorType.USER,
        actorId: payment.userId ?? payment.order?.userId ?? undefined,
        orderId: payment.orderId,
        metadata: { provider: 'ZIBAL', trackId }
      });
    } else if (!success && !result.alreadyFinal) {
      await this.notifications.onPaymentFailed(payment.orderId);
      await this.eventLog.logEvent('PAYMENT_FAILED', {
        orderId: payment.orderId,
        userId: payment.userId ?? payment.order?.userId,
        vendorId: payment.order?.vendorId,
        actorType: EventActorType.USER,
        entityType: 'payment',
        metadata: { trackId, providerResult: verifyData?.result, orderMatches, amountMatches }
      });
      await this.productEvents.track('payment_failed', {
        actorType: EventActorType.USER,
        actorId: payment.userId ?? payment.order?.userId ?? undefined,
        orderId: payment.orderId,
        metadata: { provider: 'ZIBAL', trackId }
      });
    }

    return { payment: result.payment, orderStatus: result.payment.order?.status, success };
  }

  async handleZibalCallback(payload: Record<string, any>, headers?: Record<string, string>) {
    const trackId = payload.trackId ?? payload.trackid ?? payload.trackID;
    if (!trackId) {
      throw new BadRequestException('trackId is required');
    }

    this.validateSignature(payload, headers);
    await this.guardReplay(trackId, headers?.['x-zibal-signature']);
    this.rateLimit.assertWithinLimit(`payment-callback:${trackId}`, 5, 30 * 60 * 1000);

    const payment = await this.prisma.payment.findFirst({ where: { trackId }, include: { order: true } });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const amountMatches = payload?.amount !== undefined ? Number(payload.amount) === Number(payment.amount) : false;
    const orderMatches = payload?.orderId ? payload.orderId === payment.orderId : false;

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

    if (!orderMatches || !amountMatches) {
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED } });
        if (payment.orderId) {
          await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: PaymentStatus.FAILED } });
        }
      });
      await this.notifications.onPaymentFailed(payment.orderId);
      return { paymentStatus: PaymentStatus.FAILED, message: 'payload mismatch' };
    }

    const successFlag = (payload?.success === '1' || payload?.success === 1 || payload?.result === 100) && amountMatches;
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

    return this.verifyZibal(trackId, payload, headers, true);
  }
}
