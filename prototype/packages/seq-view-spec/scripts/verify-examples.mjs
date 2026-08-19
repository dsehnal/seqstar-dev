import { readdir, readFile } from "node:fs/promises";
import { validateSeqViewSpec } from "../dist/index.js";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const examples = new URL("../examples/", import.meta.url);
for (const name of await readdir(examples)) {
  const result = validateSeqViewSpec(await readJson(new URL(name, examples)));
  if (!result.ok) throw new Error(`examples/${name} did not validate.`);
}

const invalid = new URL("../invalid/", import.meta.url);
const manifest = await readJson(new URL("manifest.json", invalid));
for (const [name, expected] of Object.entries(manifest)) {
  const result = validateSeqViewSpec(await readJson(new URL(name, invalid)));
  if (result.ok) throw new Error(`invalid/${name} unexpectedly validated.`);
  for (const diagnostic of expected) {
    if (
      !result.diagnostics.some(
        (actual) => actual.code === diagnostic.code && actual.path === diagnostic.path,
      )
    )
      throw new Error(`invalid/${name} is missing ${diagnostic.code} at ${diagnostic.path}.`);
  }
}
