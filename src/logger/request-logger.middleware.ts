import { NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { WinstonLogger } from './winston-logger.service';

export class RequestLoggerMiddleware implements NestMiddleware {
  constructor(private readonly logger: WinstonLogger) {}

  use(req: Request & { correlationId?: string }, res: Response, next: () => void) {
    const correlationId = (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();
    req.correlationId = correlationId;
    res.setHeader('x-correlation-id', correlationId);

    const startedAt = Date.now();
    this.logger.log('Incoming request', 'HTTP', {
      correlationId,
      method: req.method,
      path: req.originalUrl
    });

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      this.logger.log('Completed request', 'HTTP', {
        correlationId,
        statusCode: res.statusCode,
        durationMs
      });
    });

    next();
  }
}
