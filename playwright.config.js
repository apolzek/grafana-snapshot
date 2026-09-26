import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  globalSetup: './test/e2e/global-setup.js',
  timeout: 180_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1, // one persistent browser with the extension per worker
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node test/e2e/server.mjs',
    url: 'http://127.0.0.1:4174/mock-dashboard.html',
    reuseExistingServer: !process.env.CI,
  },
});
