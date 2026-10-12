import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    // Enable CDP for Lighthouse integration
    chromiumSandbox: false,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        // Launch Chromium with remote debugging port for Lighthouse
        launchOptions: {
          args: ['--remote-debugging-port=9222'],
        },
      },
    },
  ],
});

