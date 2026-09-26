import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/browser',
  outputDir: process.env.BROWSER_OUTPUT_DIR ?? 'test-results',
  timeout: 60000,
  fullyParallel: true,
  workers: Number(process.env.BROWSER_WORKERS ?? 2),
  use: {
    baseURL: process.env.EDITOR_URL ?? 'http://127.0.0.1:4310',
    viewport: { width: 1600, height: 1050 },
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: [
    ['list'],
    ['json', { outputFile: process.env.BROWSER_RESULTS_PATH ?? '.local/browser-results.json' }],
  ],
});
