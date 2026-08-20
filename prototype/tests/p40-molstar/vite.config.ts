import { defineConfig } from "vite";

export default defineConfig({
  build: {
    // `dist/` is already the workspace's standard ignored build output.
    outDir: "dist",
    emptyOutDir: true,
  },
});
