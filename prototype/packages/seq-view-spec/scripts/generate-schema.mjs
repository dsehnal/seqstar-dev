import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { exportSeqViewSpecJsonSchema } from "../dist/index.js";

const schema = exportSeqViewSpecJsonSchema();
await mkdir(new URL("../schema/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../schema/seq-view-spec-0.1.schema.json", import.meta.url),
  `${JSON.stringify(schema, null, 2)}\n`,
);
await promisify(execFile)("pnpm", [
  "exec",
  "biome",
  "format",
  "--write",
  "schema/seq-view-spec-0.1.schema.json",
]);
