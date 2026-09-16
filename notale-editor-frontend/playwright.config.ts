import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests', timeout: 60000, expect: { timeout: 10000 }, fullyParallel: true, workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:4312', viewport: { width: 1600, height: 1000 }, actionTimeout: 10000,
    launchOptions: { executablePath: process.env.CHROMIUM_PATH },
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
  },
  reporter: [['list'], ['json', { outputFile: '.local/browser-results.json' }]],
});
