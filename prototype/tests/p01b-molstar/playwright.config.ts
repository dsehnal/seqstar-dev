import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "p01b-molstar.spec.ts",
  use: {
    baseURL: "http://127.0.0.1:4174",
  },
  webServer: {
    command: "pnpm exec vite tests/p01b-molstar --host 127.0.0.1 --port 4174",
    cwd: "../..",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: true,
  },
});
