import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "m50-ensemble.spec.ts",
  use: { baseURL: "http://127.0.0.1:4185" },
  webServer: {
    command:
      "pnpm exec vite tests/m50-fixtures --config tests/m50-fixtures/vite.config.ts --host 127.0.0.1 --port 4185",
    cwd: "../..",
    url: "http://127.0.0.1:4185",
    reuseExistingServer: true,
  },
});
