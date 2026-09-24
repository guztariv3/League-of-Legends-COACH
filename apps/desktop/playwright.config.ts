import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:1420", viewport: { width: 380, height: 560 } },
  projects: [{ name: "live-window", use: { ...devices["Desktop Chrome"], viewport: { width: 380, height: 560 } } }],
  webServer: { command: "pnpm exec vite --port 1420 --strictPort", url: "http://localhost:1420", reuseExistingServer: false, timeout: 60_000 },
});
