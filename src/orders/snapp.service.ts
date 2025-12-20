import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { createHmac } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { CourierStatus, SnappRequestStatus } from '@prisma/client';

interface LocationPayload {
  lat: number;
  lng: number;
  address: string;
}

interface SnappWebhookPayload {
  requestId: string;
  status: string;
  driverName?: string;
  driverPhone?: string;
  etaMinutes?: number;
}

interface SnappEstimateResponse {
  [key: string]: unknown;
}

interface SnappCourierResponse {
  requestId?: string;
  id?: string;
  status?: string;
  [key: string]: unknown;
}

interface SnappCancelResponse {
  [key: string]: unknown;
}

@Injectable()
export class SnappService {
  private readonly logger = new Logger(SnappService.name);
  private readonly baseUrl = process.env.SNAPP_API_BASE_URL;
  private readonly clientId = process.env.SNAPP_CLIENT_ID;
  private readonly clientSecret = process.env.SNAPP_CLIENT_SECRET;
  private readonly webhookSecret = process.env.SNAPP_WEBHOOK_SECRET;

  constructor(private readonly http: HttpService) {}

  private get isConfigured() {
    return Boolean(this.baseUrl && this.clientId && this.clientSecret);
  }

  private authHeaders() {
    const token = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    return { Authorization: `Basic ${token}` };
  }

  private mapSnappStatus(status?: string): { status: SnappRequestStatus; courierStatus?: CourierStatus } {
    switch ((status || '').toUpperCase()) {
      case 'CONFIRMED':
        return { status: SnappRequestStatus.CONFIRMED, courierStatus: CourierStatus.ASSIGNED };
      case 'COURIER_ASSIGNED':
        return { status: SnappRequestStatus.COURIER_ASSIGNED, courierStatus: CourierStatus.ASSIGNED };
      case 'OUT_FOR_DELIVERY':
        return { status: SnappRequestStatus.OUT_FOR_DELIVERY, courierStatus: CourierStatus.PICKED_UP };
      case 'DELIVERED':
        return { status: SnappRequestStatus.DELIVERED, courierStatus: CourierStatus.DELIVERED };
      case 'CANCELLED':
        return { status: SnappRequestStatus.CANCELLED, courierStatus: CourierStatus.CANCELLED };
      default:
        return { status: SnappRequestStatus.REQUESTED };
    }
  }

  async estimateCost(payload: { pickup: LocationPayload; dropoff: LocationPayload }) {
    if (!this.isConfigured) {
      this.logger.warn('Snapp estimate requested without configuration');
      return null;
    }
    try {
      const response = await firstValueFrom(
        this.http.post<SnappEstimateResponse>(
          `${this.baseUrl}/estimates`,
          {
            origin: payload.pickup,
            destination: payload.dropoff
          },
          { headers: this.authHeaders() }
        )
      );
      return response.data ?? null;
    } catch (error: any) {
      this.logger.error('Failed to estimate Snapp courier cost', error?.response?.data || error?.message);
      return null;
    }
  }

  async requestCourier(payload: { orderId: string; pickup: LocationPayload; dropoff: LocationPayload }) {
    if (!this.isConfigured) {
      this.logger.error('Snapp request attempted without configuration');
      return { requestId: null, status: SnappRequestStatus.FAILED };
    }
    try {
      const response = await firstValueFrom(
        this.http.post<SnappCourierResponse>(
          `${this.baseUrl}/couriers`,
          {
            reference: payload.orderId,
            origin: payload.pickup,
            destination: payload.dropoff,
            settlement: 'COD'
          },
          { headers: this.authHeaders() }
        )
      );
      const requestId = response.data?.requestId ?? response.data?.id;
      const mapped = this.mapSnappStatus(response.data?.status);
      return { requestId, status: mapped.status, courierStatus: mapped.courierStatus, raw: response.data };
    } catch (error: any) {
      this.logger.error('Snapp courier request failed', error?.response?.data || error?.message);
      return { requestId: null, status: SnappRequestStatus.FAILED };
    }
  }

  async refreshStatus(requestId: string) {
    if (!this.isConfigured) {
      this.logger.warn('Snapp status refresh requested without configuration');
      return { status: 'PENDING' };
    }
    try {
      const response = await firstValueFrom(
        this.http.get<SnappCourierResponse>(`${this.baseUrl}/couriers/${requestId}`, { headers: this.authHeaders() })
      );
      const mapped = this.mapSnappStatus(response.data?.status);
      return { status: mapped.status, courierStatus: mapped.courierStatus, raw: response.data };
    } catch (error: any) {
      this.logger.error('Snapp status refresh failed', error?.response?.data || error?.message);
      return { status: SnappRequestStatus.FAILED };
    }
  }

  async cancel(requestId: string) {
    if (!this.isConfigured) {
      this.logger.warn('Snapp cancel requested without configuration');
      return { cancelled: false };
    }
    try {
      await firstValueFrom(
        this.http.post<SnappCancelResponse>(`${this.baseUrl}/couriers/${requestId}/cancel`, {}, { headers: this.authHeaders() })
      );
      return { cancelled: true };
    } catch (error: any) {
      this.logger.error('Snapp cancel failed', error?.response?.data || error?.message);
      return { cancelled: false };
    }
  }

  verifyWebhookSignature(rawBody: string, signature?: string) {
    if (!this.webhookSecret) return false;
    if (!signature) return false;
    const computed = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    return computed === signature;
  }

  parseWebhook(body: any): SnappWebhookPayload | null {
    if (!body?.requestId || !body?.status) return null;
    return {
      requestId: body.requestId,
      status: body.status,
      driverName: body.driverName,
      driverPhone: body.driverPhone,
      etaMinutes: body.etaMinutes
    };
  }
}
