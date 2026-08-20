import { defineConfig } from "@playwright/test";

/**
 * Deliberately standalone M01 behavior-audit runner.  It is not included by
 * the root browser suite: its assertions describe the pre-modernization
 * baseline that M10, M11, and M20 intentionally replace.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:4175", trace: "retain-on-failure" },
  webServer: {
    command:
      "pnpm --filter @seq-star/prototype-web build && pnpm --filter @seq-star/prototype-web preview --host 127.0.0.1 --port 4175",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
