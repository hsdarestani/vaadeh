import { LoggerService, LogLevel } from '@nestjs/common';
import { createLogger, format, Logger, transports } from 'winston';

export class WinstonLogger implements LoggerService {
  private readonly logger: Logger;

  constructor(level: LogLevel = 'debug') {
    this.logger = createLogger({
      level,
      format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
      transports: [new transports.Console()]
    });
  }

  log(message: unknown, context?: string): void {
    this.logger.info(message as string, { context });
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.logger.error(message as string, { trace, context });
  }

  warn(message: unknown, context?: string): void {
    this.logger.warn(message as string, { context });
  }

  debug(message: unknown, context?: string): void {
    this.logger.debug(message as string, { context });
  }

  verbose(message: unknown, context?: string): void {
    this.logger.verbose(message as string, { context });
  }

  setLogLevels(levels: LogLevel[]): void {
    if (levels.length > 0) {
      this.logger.level = levels[0];
    }
  }
}
