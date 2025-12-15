import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config } from 'dotenv';
import { AppModule } from './app.module';
import { WinstonLogger } from './logger/winston-logger.service';
import { RequestLoggerMiddleware } from './logger/request-logger.middleware';
import { validateEnv } from './config/env.validation';

config();
validateEnv();

async function bootstrap(): Promise<void> {
  const logger = new WinstonLogger();
  const app = await NestFactory.create(AppModule, { logger });
  app.enableShutdownHooks();

  const requestLogger = new RequestLoggerMiddleware(logger);
  app.use(requestLogger.use.bind(requestLogger));

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: true
    })
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Vaadeh API listening on port ${port}`);
}

void bootstrap();
