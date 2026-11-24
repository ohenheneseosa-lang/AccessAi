import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  workers: 1,
  reporter: [['list']],
  use: { trace: 'off' },
  webServer: [
    { command: 'node scripts/serve-demo-sites.mjs', url: 'http://localhost:5173/', reuseExistingServer: true },
    {
      command: 'npm run start -w @accessai/api',
      url: 'http://127.0.0.1:8787/health',
      reuseExistingServer: true,
      env: { ACCESSAI_BRAIN: 'demo', PORT: '8787' },
    },
  ],
});
