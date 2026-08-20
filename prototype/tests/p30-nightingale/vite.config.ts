import { defineConfig } from "vite";

const source = (path: string): string => new URL(path, import.meta.url).pathname;

export default defineConfig({
  resolve: {
    alias: {
      "@seq-star/harness-core": source("../../packages/harness-core/src/index.ts"),
      "@seq-star/seq-coords": source("../../packages/seq-coords/src/index.ts"),
      "@seq-star/seq-core": source("../../packages/seq-core/src/index.ts"),
      "@seq-star/seq-view-spec": source("../../packages/seq-view-spec/src/index.ts"),
      "@seq-star/wrapper-nightingale": source("../../packages/wrapper-nightingale/src/index.ts"),
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
