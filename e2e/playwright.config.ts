import { defineConfig } from '@playwright/test'

// Real transactions on Arc testnet through MetaMask: one worker, generous timeouts, evidence kept on failure.
export default defineConfig({
  testDir: './tests',
  timeout: 180_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'report' }]],
  outputDir: 'results',
  use: {
    baseURL: 'http://localhost:4188',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm --prefix ../app run build && npm --prefix ../app run preview -- --port 4188 --strictPort',
    url: 'http://localhost:4188',
    reuseExistingServer: true,
    timeout: 180_000,
  },
})
