import { LoggerService, LogLevel } from '@nestjs/common';
import { createLogger, format, Logger, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

export class WinstonLogger implements LoggerService {
  private readonly logger: Logger;

  constructor(level: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? 'debug') {
    const logFormat = format.combine(format.timestamp(), format.errors({ stack: true }), format.json());

    this.logger = createLogger({
      level,
      format: logFormat,
      transports: [
        new transports.Console(),
        new DailyRotateFile({
          dirname: 'logs',
          filename: 'app-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: process.env.LOG_RETENTION_DAYS ?? '60d',
          format: logFormat
        })
      ]
    });
  }

  log(message: unknown, context?: string, meta?: Record<string, unknown>): void {
    this.logger.info(message as string, { context, ...meta });
  }

  error(message: unknown, trace?: string, context?: string, meta?: Record<string, unknown>): void {
    this.logger.error(message as string, { trace, context, ...meta });
  }

  warn(message: unknown, context?: string, meta?: Record<string, unknown>): void {
    this.logger.warn(message as string, { context, ...meta });
  }

  debug(message: unknown, context?: string, meta?: Record<string, unknown>): void {
    this.logger.debug(message as string, { context, ...meta });
  }

  verbose(message: unknown, context?: string, meta?: Record<string, unknown>): void {
    this.logger.verbose(message as string, { context, ...meta });
  }

  setLogLevels(levels: LogLevel[]): void {
    if (levels.length > 0) {
      this.logger.level = levels[0];
    }
  }
}
