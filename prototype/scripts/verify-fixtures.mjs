import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const fixtureRoot = resolve(fileURLToPath(new URL("../fixtures/", import.meta.url)));
const manifest = JSON.parse(await readFile(resolve(fixtureRoot, "manifest.json"), "utf8"));
const execFile = promisify(execFileCallback);
const expectedCases = new Set([
  "renderer-portability",
  "uniprot-structure",
  "complex",
  "alignment-structure",
]);

const expectedEnsembleMembers = [
  {
    accession: "P02197",
    accessionVersion: "P02197.4",
    modelId: "AF-P02197-F1-model_v6",
    modelEntityId: "AF-P02197-F1",
    mmcifPath: "input/AF-P02197-F1-model_v6.cif",
    mmcifSha256: "add1eaa81d25e5243ae572beebb46bff297832bf4349a8b61eb1df8cd6c3e77f",
    afdbPath: "input/P02197.afdb.json.raw",
    afdbSha256: "8e761628996a9c5b93305435e324f4351b51875f4b2848e9ac88bfd519bc92a9",
    uniprotPath: "input/P02197.uniprot.json.raw",
    uniprotSha256: "77cc3f7f18f20361b32a047152450ae8882a104d4f27a0c3a7a3b9de0c2efa39",
    color: "#F97316",
    pairCount: 108,
  },
  {
    accession: "A0A5E4C8D4",
    accessionVersion: "A0A5E4C8D4.1",
    modelId: "AF-A0A5E4C8D4-F1-model_v6",
    modelEntityId: "AF-A0A5E4C8D4-F1",
    mmcifPath: "input/AF-A0A5E4C8D4-F1-model_v6.cif",
    mmcifSha256: "d9ae2fa3eec9af90c982f50bc77b2db1c4125f865d6e5b888c8aa1beb44a0206",
    afdbPath: "input/A0A5E4C8D4.afdb.json.raw",
    afdbSha256: "7256e503622dd66caae33a9d501908aeb7dfbc069c686d3f4aa6320e4c0ed148",
    uniprotPath: "input/A0A5E4C8D4.uniprot.json.raw",
    uniprotSha256: "c6a2ee250a377f50253f962ea7d724583725217489cbfcfdf4d8dd13af8e3a31",
    color: "#10B981",
    pairCount: 111,
  },
  {
    accession: "A0A2Y9DEZ0",
    accessionVersion: "A0A2Y9DEZ0.1",
    modelId: "AF-A0A2Y9DEZ0-F1-model_v6",
    modelEntityId: "AF-A0A2Y9DEZ0-F1",
    mmcifPath: "input/AF-A0A2Y9DEZ0-F1-model_v6.cif",
    mmcifSha256: "f254c99c3ce4fafdcc847e21c69e66ce443ce85e5a0c6d8ecb93b559714bb175",
    afdbPath: "input/A0A2Y9DEZ0.afdb.json.raw",
    afdbSha256: "91b9dd8a96aad0c8c2ef6082b43dc46fa4320ac5ee5b5826bf0e79d755bf16fd",
    uniprotPath: "input/A0A2Y9DEZ0.uniprot.json.raw",
    uniprotSha256: "a35c8f305757aa46dbf8fec4726301700db312b678e6da0c9744552f59bf24b8",
    color: "#A855F7",
    pairCount: 110,
  },
];

function assert(condition, message) {
  if (!condition) throw new Error(`P01/M50 fixture audit: ${message}`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeCasePath(caseId, declaredPath) {
  assert(
    typeof declaredPath === "string" && declaredPath.length > 0,
    `${caseId} has an empty file path`,
  );
  assert(!isAbsolute(declaredPath), `${caseId} has an absolute file path ${declaredPath}`);
  const caseRoot = resolve(fixtureRoot, caseId);
  const absolute = resolve(caseRoot, declaredPath);
  const canonical = relative(caseRoot, absolute).replaceAll("\\", "/");
  assert(
    canonical !== "" &&
      !canonical.startsWith("../") &&
      canonical !== ".." &&
      canonical === declaredPath,
    `${caseId} has an unsafe or non-canonical file path ${declaredPath}`,
  );
  return absolute;
}

async function filesOnDisk(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) files.push(...(await filesOnDisk(path)));
    else if (entry.isFile()) files.push(path);
    else assert(false, `fixture inventory contains a non-file entry ${path}`);
  }
  return files;
}

function tabular(text, expectedRows, label) {
  const lines = text.trim().split(/\r?\n/u);
  const headings = lines.shift()?.split("\t") ?? [];
  assert(headings.length > 0, `${label} has no header`);
  assert(
    lines.length === expectedRows,
    `${label} has ${lines.length} rows, expected ${expectedRows}`,
  );
  return { headings, rows: lines.map((line) => line.split("\t")) };
}

function descendants(node, kind, found = []) {
  if (node?.kind === kind) found.push(node);
  for (const child of node?.children ?? []) descendants(child, kind, found);
  return found;
}

function soleDescendant(node, kind, label) {
  const found = descendants(node, kind);
  assert(found.length === 1, `${label} must contain exactly one ${kind} node`);
  return found[0];
}

async function auditM50Ensemble(metadata, metadataFiles) {
  assert(
    metadata.independentReview?.required === true,
    "M50 independent review requirement is missing",
  );
  assert(
    metadata.independentReview?.state === "approved-for-m50-use" &&
      metadata.independentReview?.reviewedDate === "2026-08-20" &&
      metadata.independentReview?.downstreamM50UseAllowed === true,
    "M50 fixture packet is not marked approved for downstream use after independent review",
  );
  assert(
    metadata.ensemble?.biologicalEnsembleClaim === false,
    "M50 must not claim a biological ensemble",
  );
  assert(
    metadata.predictedMembers?.length === expectedEnsembleMembers.length,
    "M50 member count changed",
  );
  assert(metadata.ensemble?.structureRoots === 4, "M50 MVS must have exactly four structure roots");
  assert(
    metadata.ensemble?.transformConvention?.startsWith("column-major 4x4 homogeneous matrix"),
    "M50 transform matrix convention is not frozen",
  );

  for (const expected of expectedEnsembleMembers) {
    const member = metadata.predictedMembers.find((item) => item.accession === expected.accession);
    assert(member !== undefined, `M50 member ${expected.accession} is missing from metadata`);
    assert(
      member.accessionVersion === expected.accessionVersion,
      `${expected.accession} version changed`,
    );
    assert(
      member.modelId === expected.modelId && member.modelEntityId === expected.modelEntityId,
      `${expected.accession} model identity changed`,
    );
    assert(
      member.modelVersion === 6 && member.predicted === true,
      `${expected.accession} is not a v6 prediction`,
    );
    assert(member.mmcifPath === expected.mmcifPath, `${expected.accession} mmCIF path changed`);
    assert(
      member.afdbApiUrl === `https://alphafold.ebi.ac.uk/api/prediction/${expected.accession}` &&
        member.uniprotUrl === `https://rest.uniprot.org/uniprotkb/${expected.accession}.json` &&
        member.modelLicense === "CC BY 4.0" &&
        member.modelLicenseUrl === "https://creativecommons.org/licenses/by/4.0/" &&
        /AlphaFold Protein Structure Database/iu.test(member.modelAttribution ?? ""),
      `${expected.accession} official source URL, license, or attribution changed`,
    );
    assert(
      typeof member.requiredDisplayLabel === "string" &&
        /predicted.*not experimental/iu.test(member.requiredDisplayLabel),
      `${expected.accession} does not carry an honest predicted-model label`,
    );
    assert(
      metadataFiles.get(expected.mmcifPath)?.sha256 === expected.mmcifSha256 &&
        metadataFiles.get(expected.afdbPath)?.sha256 === expected.afdbSha256 &&
        metadataFiles.get(expected.uniprotPath)?.sha256 === expected.uniprotSha256,
      `${expected.accession} retains an unexpected source asset hash`,
    );

    const [afdb, uniprot] = await Promise.all([
      JSON.parse(await readFile(safeCasePath("alignment-structure", expected.afdbPath), "utf8")),
      JSON.parse(await readFile(safeCasePath("alignment-structure", expected.uniprotPath), "utf8")),
    ]);
    assert(
      Array.isArray(afdb) && afdb.length === 1,
      `${expected.accession} AFDB response is not singular`,
    );
    const api = afdb[0];
    assert(
      api?.latestVersion === 6 &&
        api?.uniprotAccession === expected.accession &&
        api?.modelEntityId === expected.modelEntityId &&
        api?.cifUrl === member.cifUrl,
      `${expected.accession} AFDB provenance disagrees with metadata`,
    );
    assert(
      uniprot.primaryAccession === expected.accession &&
        typeof uniprot.sequence?.value === "string" &&
        uniprot.sequence.value === api.sequence &&
        uniprot.sequence.value === api.uniprotSequence &&
        uniprot.sequence.value.length === api.sequenceEnd,
      `${expected.accession} exact UniProt/AFDB sequence provenance disagrees`,
    );

    const mapping = tabular(
      await readFile(safeCasePath("alignment-structure", member.mappingPath), "utf8"),
      118,
      `${expected.accession} frozen alignment mapping`,
    );
    const status = mapping.headings.indexOf("status");
    const sequenceStatus = mapping.headings.indexOf("sequence_status");
    const labelSeqId = mapping.headings.indexOf("label_seq_id");
    assert(
      status >= 0 && sequenceStatus >= 0 && labelSeqId >= 0,
      `${expected.accession} mapping columns changed`,
    );
    const exactRows = mapping.rows.filter((row) => row[status] === "exact_observed");
    const gapRows = mapping.rows.filter((row) => row[status] === "alignment_gap");
    assert(
      exactRows.length + gapRows.length === 118 &&
        exactRows.length > 0 &&
        exactRows.every(
          (row) => row[sequenceStatus] === "exact" && /^\d+$/u.test(row[labelSeqId] ?? ""),
        ),
      `${expected.accession} mapping has incomplete, nonexact, or fabricated observed rows`,
    );

    const transform = JSON.parse(
      await readFile(safeCasePath("alignment-structure", member.transformPath), "utf8"),
    );
    assert(
      transform.mobile?.accession === expected.accession &&
        transform.mobile?.modelEntityId === expected.modelEntityId &&
        transform.mobile?.sourceKind === "predicted" &&
        transform.mobile?.sourceLabel?.includes("not an experimental structure") &&
        transform.algorithm?.package === "molstar@5.11.0" &&
        transform.algorithm?.api === "MinimizeRmsd.compute" &&
        transform.algorithm?.mobileToReference === true &&
        transform.matrix?.convention?.startsWith("column-major 4x4 homogeneous matrix") &&
        Array.isArray(transform.matrix?.values) &&
        transform.matrix.values.length === 16,
      `${expected.accession} transform provenance is incomplete`,
    );
    assert(
      transform.coordinatePairs?.pairCount === expected.pairCount &&
        typeof transform.coordinatePairs?.pairTablePath === "string" &&
        transform.coordinatePairs.rule?.includes("no sequence or structure alignment"),
      `${expected.accession} transform does not freeze its exact pair input`,
    );
    const pairs = tabular(
      await readFile(
        safeCasePath("alignment-structure", transform.coordinatePairs.pairTablePath),
        "utf8",
      ),
      expected.pairCount,
      `${expected.accession} transform pair table`,
    );
    assert(
      pairs.headings.includes("alignment_column_1based") &&
        pairs.headings.includes("reference_ca_x") &&
        pairs.headings.includes("mobile_ca_x"),
      `${expected.accession} transform pair inputs are not serialised`,
    );
  }

  const mvsPath = safeCasePath("alignment-structure", metadata.ensemble.mvsPath);
  const ensembleAudit = JSON.parse(
    await readFile(
      safeCasePath("alignment-structure", "expected/molstar-ensemble-audit.json"),
      "utf8",
    ),
  );
  assert(
    ensembleAudit.independentReview?.state === "approved-for-m50-use" &&
      ensembleAudit.independentReview?.reviewedDate === "2026-08-20" &&
      ensembleAudit.independentReview?.downstreamM50UseAllowed === true &&
      ensembleAudit.ensemble?.biologicalEnsembleClaim === false,
    "M50 derived audit does not retain the reviewed approval without changing its interpretation",
  );
  const metadataReview = metadata.independentReview;
  const auditReview = ensembleAudit.independentReview;
  const manifestReview = manifest.alignmentEnsembleValidation;
  assert(
    metadataReview?.required === manifestReview?.independentReviewRequired &&
      manifestReview?.independentReviewRequired === auditReview?.required &&
      metadataReview?.state === manifestReview?.independentReviewState &&
      manifestReview?.independentReviewState === auditReview?.state &&
      metadataReview?.reviewedDate === manifestReview?.reviewedDate &&
      manifestReview?.reviewedDate === auditReview?.reviewedDate &&
      metadataReview?.downstreamM50UseAllowed === manifestReview?.downstreamM50UseAllowed &&
      manifestReview?.downstreamM50UseAllowed === auditReview?.downstreamM50UseAllowed,
    "M50 manifest, metadata, and derived audit independent-review fields disagree",
  );
  const mvs = JSON.parse(await readFile(mvsPath, "utf8"));
  assert(
    mvs.metadata?.version === "1" &&
      /three AlphaFold DB v6 predictions/iu.test(mvs.metadata?.title ?? "") &&
      /predicted-model cartoons/iu.test(mvs.metadata?.description ?? ""),
    "M50 MVS does not label its theoretical predictions clearly",
  );
  const downloads = (mvs.root?.children ?? []).filter((node) => node.kind === "download");
  assert(downloads.length === 4, "M50 MVS does not have four local roots");
  const expectedUrls = [
    "/input/1A3N.cif",
    ...expectedEnsembleMembers.map((member) => `/${member.mmcifPath}`),
  ];
  assert(
    downloads.map((node) => node.params?.url).join("|") === expectedUrls.join("|"),
    "M50 MVS contains a wrong, reordered, or nonlocal structure asset",
  );
  const expectedColors = ["#2563EB", ...expectedEnsembleMembers.map((member) => member.color)];
  for (const [index, root] of downloads.entries()) {
    const parse = soleDescendant(root, "parse", `M50 root ${index + 1}`);
    const transform = soleDescendant(root, "transform", `M50 root ${index + 1}`);
    const representation = soleDescendant(root, "representation", `M50 root ${index + 1}`);
    const color = soleDescendant(root, "color", `M50 root ${index + 1}`);
    assert(parse.params?.format === "mmcif", `M50 root ${index + 1} is not a mmCIF`);
    assert(
      Array.isArray(transform.params?.matrix) && transform.params.matrix.length === 16,
      `M50 root ${index + 1} has no frozen transform`,
    );
    assert(
      representation.params?.type === "cartoon" && color.params?.color === expectedColors[index],
      `M50 root ${index + 1} has the wrong representation or color`,
    );
  }
  assert(
    descendants(downloads[0], "focus").length === 1,
    "M50 MVS does not focus experimental 1A3N",
  );
  assert(
    downloads.slice(1).every((root) => descendants(root, "focus").length === 0),
    "M50 MVS focuses a predicted member instead of experimental 1A3N",
  );
}

assert(manifest.schemaVersion === 1, "unsupported manifest schema");
assert(manifest.structureParserValidation?.package === "molstar@5.11.0", "Mol* parser pin missing");
assert(
  manifest.structureParserValidation?.repositoryOwnedMmcifParser === false,
  "a repository-owned mmCIF parser is forbidden",
);
assert(
  manifest.alignmentEnsembleValidation?.package === "molstar@5.11.0" &&
    manifest.alignmentEnsembleValidation?.fixtureAudit ===
      "tests/m50-fixtures/derive-ensemble.mjs" &&
    manifest.alignmentEnsembleValidation?.independentReviewRequired === true &&
    manifest.alignmentEnsembleValidation?.independentReviewState === "approved-for-m50-use" &&
    manifest.alignmentEnsembleValidation?.reviewedDate === "2026-08-20" &&
    manifest.alignmentEnsembleValidation?.downstreamM50UseAllowed === true,
  "M50 Mol*-only ensemble audit declaration is missing",
);
assert(manifest.cases.length === expectedCases.size, "expected exactly four fixture cases");

let totalBytes = 0;
for (const entry of manifest.cases) {
  assert(expectedCases.delete(entry.caseId), `unknown or duplicate case ${entry.caseId}`);
  assert(entry.status === "approved", `${entry.caseId} is not approved`);
  assert(Array.isArray(entry.files), `${entry.caseId} manifest has no file inventory`);

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

  const metadataFiles = new Map();
  for (const file of metadata.files ?? []) {
    assert(
      safeCasePath(entry.caseId, file.path),
      `${entry.caseId} metadata has an unsafe file path`,
    );
    assert(!metadataFiles.has(file.path), `${entry.caseId} metadata has duplicate ${file.path}`);
    metadataFiles.set(file.path, file);
  }
  const manifestFiles = new Map();
  for (const file of entry.files) {
    const prefix = `${entry.caseId}/`;
    assert(
      file.path.startsWith(prefix),
      `${entry.caseId} manifest path is outside its case directory`,
    );
    const relativePath = file.path.slice(prefix.length);
    assert(
      safeCasePath(entry.caseId, relativePath),
      `${entry.caseId} manifest has an unsafe file path`,
    );
    assert(
      !manifestFiles.has(relativePath),
      `${entry.caseId} manifest has duplicate ${relativePath}`,
    );
    manifestFiles.set(relativePath, file);
  }
  assert(
    metadataFiles.size === manifestFiles.size,
    `${entry.caseId} manifest file inventory differs`,
  );

  const caseRoot = resolve(fixtureRoot, entry.caseId);
  const actualFiles = new Set(
    (await filesOnDisk(caseRoot))
      .filter((path) => path !== metadataPath)
      .map((path) => relative(caseRoot, path).replaceAll("\\", "/")),
  );
  assert(actualFiles.size === metadataFiles.size, `${entry.caseId} has unlisted or missing assets`);
  for (const path of actualFiles)
    assert(metadataFiles.has(path), `${entry.caseId} contains unlisted asset ${path}`);

  let caseBytes = 0;
  for (const [relativePath, file] of manifestFiles) {
    const declared = metadataFiles.get(relativePath);
    assert(declared, `${entry.caseId} metadata omits ${relativePath}`);
    assert(
      declared.bytes === file.bytes &&
        declared.sha256 === file.sha256 &&
        declared.classification === file.classification,
      `${entry.caseId} metadata differs for ${relativePath}`,
    );
    const filePath = safeCasePath(entry.caseId, relativePath);
    const bytes = await readFile(filePath);
    const info = await stat(filePath);
    assert(
      info.isFile() && info.size === file.bytes && bytes.byteLength === file.bytes,
      `${filePath} byte count differs`,
    );
    assert(sha256(bytes) === file.sha256, `${filePath} SHA-256 differs`);
    caseBytes += file.bytes;
    if (relativePath.startsWith("mappings/") || relativePath.startsWith("transforms/"))
      assert(bytes.byteLength > 0, `${filePath} derived mapping/transform is empty`);
  }
  assert(caseBytes === entry.contentBytes, `${entry.caseId} content-byte total differs`);
  assert(
    caseBytes === metadata.sizeBudget.checkedInBytes,
    `${entry.caseId} metadata total differs`,
  );
  totalBytes += caseBytes;

  if (Array.isArray(metadata.sizeBudget.browserFixtureInputFiles)) {
    const inputBytes = metadata.sizeBudget.browserFixtureInputFiles.reduce((total, path) => {
      const file = metadataFiles.get(path);
      assert(file !== undefined, `${entry.caseId} browser input ${path} is unlisted`);
      return total + file.bytes;
    }, 0);
    assert(
      inputBytes === metadata.sizeBudget.browserFixtureInputBytes &&
        typeof metadata.sizeBudget.browserInputBudgetBytes === "number" &&
        metadata.sizeBudget.withinBudget ===
          inputBytes <= metadata.sizeBudget.browserInputBudgetBytes,
      `${entry.caseId} browser fixture-size budget is dishonest`,
    );
  }

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

  if (entry.caseId === "alignment-structure") await auditM50Ensemble(metadata, metadataFiles);
}

assert(expectedCases.size === 0, `missing case(s): ${[...expectedCases].join(", ")}`);
const ensembleAudit = await execFile(process.execPath, ["tests/m50-fixtures/derive-ensemble.mjs"], {
  cwd: resolve(fixtureRoot, ".."),
});
assert(
  ensembleAudit.stdout.includes("M50 ensemble fixture audit passed"),
  "M50 Mol*-only reproducibility audit did not complete",
);
console.log(
  `P01/M50 fixture audit passed: 4 cases, ${totalBytes} content bytes, all hashes, inventories, provenance, and M50 transforms verified.`,
);
