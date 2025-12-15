import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { EventLogService } from './event-log.service';
import { EVENT_LOG_METADATA, EventLogMetadata } from './event-logger.decorator';

@Injectable()
export class EventLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly eventLog: EventLogService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.getAllAndOverride<EventLogMetadata | undefined>(
      EVENT_LOG_METADATA,
      [context.getHandler(), context.getClass()]
    );

    if (!metadata) return next.handle();

    const request = context.switchToHttp().getRequest();
    const userId = request?.user?.userId ?? request?.body?.userId;
    const orderId = request?.params?.id ?? request?.body?.orderId;
    const correlationId = request?.correlationId ?? request?.headers?.['x-request-id'];

    return next.handle().pipe(
      tap(async () => {
        await this.eventLog.logEvent(metadata.eventName, {
          orderId,
          userId,
          correlationId,
          metadata: { path: request?.url }
        });
      })
    );
  }
}
