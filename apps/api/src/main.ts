import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody lets the Paystack webhook check its signature against the exact bytes Paystack sent.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env.WEB_ORIGIN?.split(',') ?? true });
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}/api`);
}
bootstrap();
