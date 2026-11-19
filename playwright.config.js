import { defineConfig, devices } from '@playwright/test';
import { argsNavegador } from './tools/navegador-args.mjs';

// Adaptado de juanagogo/bazuko, commit 2df40da (Jonme-Mopri).
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5188',
    trace: 'on-first-retry', screenshot: 'only-on-failure', video: 'retain-on-failure',
    viewport: { width: 1280, height: 800 },
    // Usar la GPU local cuando el renderizado por software no completa la carga.
    launchOptions: { args: argsNavegador() }
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5188 --strictPort',
    url: 'http://127.0.0.1:5188',
    reuseExistingServer: false,
    timeout: 120_000
  }
});
