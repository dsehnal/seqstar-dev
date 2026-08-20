import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "p40-molstar.spec.ts",
  use: { baseURL: "http://127.0.0.1:4176" },
  webServer: {
    command: "pnpm exec vite tests/p40-molstar --host 127.0.0.1 --port 4176",
    cwd: "../..",
    url: "http://127.0.0.1:4176",
    reuseExistingServer: true,
  },
});
