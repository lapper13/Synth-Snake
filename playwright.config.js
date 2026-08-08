const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8080',
    serviceWorkers: 'allow',
  },
  webServer: {
    command: 'python3 -m http.server 8080 --bind 127.0.0.1',
    url: 'http://127.0.0.1:8080/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  projects: [
    {
      name: 'desktop',
      testMatch: /offline\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      testMatch: /touch\.spec\.js/,
      // Forced to chromium: CDP's Input.dispatchTouchEvent (used by the swipe/tap
      // helpers in tests/touch.spec.js) is a Chromium-only protocol. The device
      // preset defaults to webkit; override it while keeping its viewport/touch shape.
      use: { ...devices['iPhone 13 landscape'], defaultBrowserType: 'chromium' },
    },
  ],
});
