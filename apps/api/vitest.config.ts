import path from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC emits decorator metadata, which Nest's dependency injection needs.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: { alias: { '@school-ms/core': path.resolve(__dirname, '../../packages/core/src/index.ts') } },
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://schoolms:schoolms@localhost:5432/schoolms_test',
      JWT_SECRET: 'test-secret',
      NOTIFICATIONS_POLL_MS: '0',
      EMAIL_PROVIDER: 'log',
      MESSAGING_PROVIDER: 'log',
      PAYSTACK_SECRET_KEY: 'sk_test_fake',
      ANTHROPIC_API_KEY: '',
    },
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
