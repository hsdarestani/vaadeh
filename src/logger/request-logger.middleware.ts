import { NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { WinstonLogger } from './winston-logger.service';

export class RequestLoggerMiddleware implements NestMiddleware {
  constructor(private readonly logger: WinstonLogger) {}

  use(req: Request & { correlationId?: string }, res: Response, next: () => void) {
    const requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
    req.correlationId = requestId;
    res.setHeader('x-request-id', requestId);

    const startedAt = Date.now();
    this.logger.log('Incoming request', 'HTTP', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      this.logger.log('Completed request', 'HTTP', {
        requestId,
        statusCode: res.statusCode,
        durationMs,
        contentLength: res.getHeader('content-length')
      });
    });

    next();
  }
}
