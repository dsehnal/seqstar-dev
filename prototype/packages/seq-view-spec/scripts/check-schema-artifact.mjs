import { readFile } from "node:fs/promises";

const artifact = new URL("../schema/seq-view-spec-0.1.schema.json", import.meta.url);
const schema = JSON.parse(await readFile(artifact, "utf8"));
const expectedDraft = "https://json-schema.org/draft/2020-12/schema";
const ids = new Set();
const pointers = new Set(["#"]);
const references = [];

const pointerEscape = (key) => key.replaceAll("~", "~0").replaceAll("/", "~1");
const walk = (value, pointer) => {
  pointers.add(pointer);
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) walk(child, `${pointer}/${index}`);
    return;
  }
  if (typeof value.$id === "string") {
    if (ids.has(value.$id)) throw new Error(`Duplicate schema $id: ${value.$id}`);
    ids.add(value.$id);
  }
  if (typeof value.$ref === "string" && value.$ref.startsWith("#")) references.push(value.$ref);
  for (const [key, child] of Object.entries(value)) walk(child, `${pointer}/${pointerEscape(key)}`);
};

if (schema.$schema !== expectedDraft)
  throw new Error(`Expected draft URI ${expectedDraft}; received ${String(schema.$schema)}.`);
walk(schema, "#");
references.forEach((reference) => {
  if (!pointers.has(reference)) throw new Error(`Unresolved local $ref: ${reference}`);
});
if (ids.size !== 1) throw new Error(`Expected one schema $id; found ${ids.size}.`);
