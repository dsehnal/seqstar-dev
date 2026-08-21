import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "p30-nightingale.spec.ts",
  use: { baseURL: "http://127.0.0.1:4175" },
  webServer: {
    command: "pnpm exec vite tests/p30-nightingale --host 127.0.0.1 --port 4175",
    cwd: "../..",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: true,
  },
});
