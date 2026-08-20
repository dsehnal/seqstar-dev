import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/m50-fixtures/**/*.test.ts"],
    environment: "node",
  },
});
