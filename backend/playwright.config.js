import 'dotenv/config';
import { defineConfig } from '@playwright/test';
if (!process.env.TEST_DATABASE_URL || !/[?&]schema=quiz_test(?:&|$)/.test(process.env.TEST_DATABASE_URL)) throw new Error('Defina TEST_DATABASE_URL com schema=quiz_test antes de testar o navegador.');
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  outputDir: '../test-results',
  use: { baseURL: 'http://localhost:3001', browserName: 'chromium', ...(process.env.PLAYWRIGHT_CHROME === '1' ? { channel: 'chrome' } : {}), screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: 'node src/server.js',
    url: 'http://localhost:3001/health',
    reuseExistingServer: false,
    timeout: 60_000,
    env: { ...process.env, PORT: '3001', APP_URL: 'http://localhost:3001', DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: 'test', ADMIN_PASSWORD: 'browser-test-password', JWT_SECRET: 'browser-test-jwt-secret-at-least-32-characters', TRUST_PROXY: '0' }
  }
});
