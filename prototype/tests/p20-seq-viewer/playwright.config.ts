import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "p20-seq-viewer.spec.ts",
  use: { baseURL: "http://127.0.0.1:4175" },
  webServer: {
    command: "pnpm exec vite tests/p20-seq-viewer --host 127.0.0.1 --port 4175",
    cwd: "../..",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: true,
  },
});
