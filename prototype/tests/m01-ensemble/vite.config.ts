import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const wrapperRequire = createRequire(
  new URL("../../packages/wrapper-molstar/package.json", import.meta.url),
);
const molstarRoot = dirname(wrapperRequire.resolve("molstar/package.json"));

export default defineConfig({
  resolve: { alias: { molstar: molstarRoot } },
  publicDir: fileURLToPath(new URL("../../fixtures/alignment-structure/input", import.meta.url)),
  server: {
    fs: {
      allow: [fileURLToPath(new URL("../..", import.meta.url))],
    },
  },
});
