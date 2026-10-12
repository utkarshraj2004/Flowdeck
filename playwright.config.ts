import fs from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Use a pre-installed Chromium when available (Claude Code Cloud ships one at
// /opt/pw-browsers/chromium); CI installs Playwright's own build instead.
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const PORT = Number(process.env.E2E_PORT || 4173);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: { executablePath },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }, testIgnore: /mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'], browserName: 'chromium' }, testMatch: /mobile/ },
  ],
  webServer: {
    command: 'npx tsx tests/e2e/server.ts',
    url: `http://localhost:${PORT}/readyz`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { E2E_PORT: String(PORT) },
  },
});
