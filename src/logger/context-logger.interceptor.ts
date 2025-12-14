import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { WinstonLogger } from './winston-logger.service';

@Injectable()
export class ContextLoggerInterceptor implements NestInterceptor {
  constructor(private readonly logger: WinstonLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { correlationId?: string; user?: any }>();
    const response = http.getResponse<Response>();

    const correlationId = request.correlationId ?? request.headers['x-correlation-id'];
    const userId = request.user?.userId;
    const orderId = request.params?.id ?? request.body?.orderId;

    const start = Date.now();
    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log('Request completed', 'HTTP', {
            correlationId,
            userId,
            orderId,
            method: request.method,
            path: request.url,
            statusCode: response.statusCode,
            durationMs: Date.now() - start
          });
        },
        error: (err) => {
          this.logger.error('Request failed', err?.stack, 'HTTP', {
            correlationId,
            userId,
            orderId,
            method: request.method,
            path: request.url,
            statusCode: response.statusCode,
            durationMs: Date.now() - start
          });
        }
      })
    );
  }
}
