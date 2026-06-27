const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./test/ui",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    viewport: { width: 1440, height: 900 }
  },
  webServer: {
    command: "node server.js",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI
  }
});
