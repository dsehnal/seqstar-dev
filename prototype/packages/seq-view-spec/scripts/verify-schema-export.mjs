import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { exportSeqViewSpecJsonSchema } from "../dist/index.js";

const canonical = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(",")}}`;
};
const hash = (value) => createHash("sha256").update(canonical(value)).digest("hex");
const artifact = JSON.parse(
  await readFile(new URL("../schema/seq-view-spec-0.1.schema.json", import.meta.url), "utf8"),
);
const exported = exportSeqViewSpecJsonSchema();
const exportedHash = hash(exported);
const artifactHash = hash(artifact);
if (canonical(exported) !== canonical(artifact) || exportedHash !== artifactHash)
  throw new Error(`Exported schema differs from artifact: ${exportedHash} != ${artifactHash}.`);
