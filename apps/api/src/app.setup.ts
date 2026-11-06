import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { config } from './common/config';

/** Settings shared by the server, the seed script and the tests. */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  // Knowledge base uploads send the file itself as the body, not JSON (no base64 overhead on slow connections).
  (app as NestExpressApplication).useBodyParser('raw', { type: 'application/octet-stream', limit: config.kbMaxUploadBytes() + 1024 });
}
