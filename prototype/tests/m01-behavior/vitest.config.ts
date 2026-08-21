import { defineConfig } from "vitest/config";

const source = (path: string): string => new URL(path, import.meta.url).pathname;

export default defineConfig({
  resolve: {
    alias: {
      "@seq-star/harness-core": source("../../packages/harness-core/src/index.ts"),
      "@seq-star/seq-coords": source("../../packages/seq-coords/src/index.ts"),
      "@seq-star/seq-core": source("../../packages/seq-core/src/index.ts"),
    },
  },
  test: {
    include: ["tests/m01-behavior/**/*.test.ts"],
    environment: "node",
  },
});
