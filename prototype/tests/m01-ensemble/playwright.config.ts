import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "m01-transform.spec.ts",
  use: { baseURL: "http://127.0.0.1:4181" },
  webServer: {
    command:
      "pnpm exec vite tests/m01-ensemble --config tests/m01-ensemble/vite.config.ts --host 127.0.0.1 --port 4181",
    cwd: "../..",
    url: "http://127.0.0.1:4181",
    reuseExistingServer: true,
  },
});
