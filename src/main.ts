import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config } from 'dotenv';
import { AppModule } from './app.module';
import { WinstonLogger } from './logger/winston-logger.service';

config();

async function bootstrap(): Promise<void> {
  const logger = new WinstonLogger();
  const app = await NestFactory.create(AppModule, { logger });

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
