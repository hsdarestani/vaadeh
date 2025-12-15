import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config } from 'dotenv';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import { AppModule } from './app.module';
import { WinstonLogger } from './logger/winston-logger.service';
import { RequestLoggerMiddleware } from './logger/request-logger.middleware';
import { validateEnv } from './config/env.validation';

config();
validateEnv();

async function bootstrap(): Promise<void> {
  const logger = new WinstonLogger();
  const app = await NestFactory.create(AppModule, { logger });
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (process.env.NODE_ENV === 'production' && (!allowedOrigins || allowedOrigins.length === 0)) {
    throw new Error('ALLOWED_ORIGINS must be configured in production');
  }
  app.enableShutdownHooks();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: [
            "'self'",
            'http:',
            'https:',
            'wss:',
            ...(allowedOrigins?.length ? allowedOrigins : [])
          ],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"]
        }
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true
      }
    })
  );

  app.use(
    cors({
      origin: allowedOrigins?.length ? allowedOrigins : ['http://localhost:3000', 'http://localhost:3001'],
      credentials: true
    })
  );

  app.use(cookieParser());

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
