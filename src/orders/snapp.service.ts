import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SnappService {
  private readonly logger = new Logger(SnappService.name);

  async estimateCost(_payload: { pickup: { lat: number; lng: number }; dropoff: { lat: number; lng: number } }) {
    this.logger.debug('Snapp estimate placeholder invoked');
    return null;
  }

  async requestCourier(_payload: Record<string, any>) {
    this.logger.warn('Snapp request placeholder called');
    return { requestId: null };
  }

  async refreshStatus(_requestId: string) {
    this.logger.debug('Snapp status placeholder called');
    return { status: 'PENDING' };
  }

  async cancel(_requestId: string) {
    this.logger.warn('Snapp cancel placeholder called');
    return { cancelled: true };
  }
}
