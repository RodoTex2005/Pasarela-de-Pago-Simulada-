const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8080/Pasarela_Pago_Simulacion/frontend/',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
});
