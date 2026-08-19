import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fixtureRoot = resolve(fileURLToPath(new URL("../fixtures/", import.meta.url)));
const manifest = JSON.parse(await readFile(resolve(fixtureRoot, "manifest.json"), "utf8"));
const expectedCases = new Set([
  "renderer-portability",
  "uniprot-structure",
  "complex",
  "alignment-structure",
]);

function assert(condition, message) {
  if (!condition) throw new Error(`P01 fixture audit: ${message}`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

assert(manifest.schemaVersion === 1, "unsupported manifest schema");
assert(manifest.structureParserValidation?.package === "molstar@5.11.0", "Mol* parser pin missing");
assert(
  manifest.structureParserValidation?.repositoryOwnedMmcifParser === false,
  "a repository-owned mmCIF parser is forbidden",
);
assert(manifest.cases.length === expectedCases.size, "expected exactly four fixture cases");

let totalBytes = 0;
for (const entry of manifest.cases) {
  assert(expectedCases.delete(entry.caseId), `unknown or duplicate case ${entry.caseId}`);
  assert(entry.status === "approved", `${entry.caseId} is not approved`);

  const metadataPath = resolve(fixtureRoot, entry.caseId, "metadata.json");
  const metadataBytes = await readFile(metadataPath);
  const metadata = JSON.parse(metadataBytes.toString("utf8"));
  assert(metadata.caseId === entry.caseId, `${entry.caseId} metadata case identity disagrees`);
  assert(metadata.status === "approved", `${entry.caseId} metadata is not approved`);
  assert(
    metadataBytes.byteLength === entry.metadataBytes,
    `${entry.caseId} metadata byte count differs`,
  );
  assert(sha256(metadataBytes) === entry.metadataSha256, `${entry.caseId} metadata hash differs`);
  assert(
    metadata.sizeBudget?.withinBudget === true,
    `${entry.caseId} exceeds its browser size budget`,
  );

  let caseBytes = 0;
  const metadataFiles = new Map(metadata.files.map((file) => [file.path, file]));
  assert(
    metadataFiles.size === entry.files.length,
    `${entry.caseId} manifest file inventory differs`,
  );
  for (const file of entry.files) {
    const prefix = `${entry.caseId}/`;
    assert(
      file.path.startsWith(prefix),
      `${entry.caseId} manifest path is outside its case directory`,
    );
    const relativePath = file.path.slice(prefix.length);
    const declared = metadataFiles.get(relativePath);
    assert(declared, `${entry.caseId} metadata omits ${relativePath}`);
    assert(
      declared.bytes === file.bytes && declared.sha256 === file.sha256,
      `${entry.caseId} metadata differs for ${relativePath}`,
    );
    const filePath = resolve(fixtureRoot, entry.caseId, relativePath);
    const bytes = await readFile(filePath);
    const info = await stat(filePath);
    assert(
      info.size === file.bytes && bytes.byteLength === file.bytes,
      `${filePath} byte count differs`,
    );
    assert(sha256(bytes) === file.sha256, `${filePath} SHA-256 differs`);
    caseBytes += file.bytes;
    if (relativePath.startsWith("mappings/")) {
      assert(bytes.byteLength > 0, `${filePath} mapping is empty`);
    }
  }
  assert(caseBytes === entry.contentBytes, `${entry.caseId} content-byte total differs`);
  assert(
    caseBytes === metadata.sizeBudget.checkedInBytes,
    `${entry.caseId} metadata total differs`,
  );
  totalBytes += caseBytes;

  const synthetic = metadata.syntheticData;
  if (synthetic?.present) {
    assert(
      typeof synthetic.requiredDisplayLabel === "string" &&
        synthetic.requiredDisplayLabel.length > 0,
      `${entry.caseId} synthetic values have no mandatory display label`,
    );
    for (const syntheticPath of synthetic.files) {
      assert(
        metadataFiles.get(syntheticPath)?.classification === "synthetic",
        `${syntheticPath} is not labeled synthetic`,
      );
    }
  } else {
    assert(synthetic === false, `${entry.caseId} synthetic-data declaration is ambiguous`);
  }
}

assert(expectedCases.size === 0, `missing case(s): ${[...expectedCases].join(", ")}`);
console.log(
  `P01 fixture audit passed: 4 cases, ${totalBytes} content bytes, all hashes and mappings verified.`,
);
