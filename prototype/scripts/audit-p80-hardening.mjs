import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const text = async (path) => readFile(resolve(root, path), "utf8");
const json = async (path) => JSON.parse(await text(path));
const assert = (condition, message) => {
  if (!condition) throw new Error(`P80 hardening audit: ${message}`);
};
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const parseIntegrity = (value) => {
  const match = /^(sha(?:256|384|512))-([A-Za-z0-9+/]+={0,2})$/u.exec(value);
  assert(match !== null, `unsupported or malformed package integrity '${value}'`);
  return { algorithm: match[1], digest: match[2] };
};
const verifyArchiveIntegrity = (bytes, integrity) => {
  const parsed = parseIntegrity(integrity);
  const actual = createHash(parsed.algorithm).update(bytes).digest("base64");
  assert(actual === parsed.digest, `archive bytes do not match ${integrity}`);
  return { integrity, sha256: sha256(bytes), verified: true };
};
const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const esc = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

async function filesRecursively(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (["dist", "node_modules", "test-results", "playwright-report"].includes(entry.name))
      continue;
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) results.push(...(await filesRecursively(child)));
    else results.push(child);
  }
  return results;
}

async function workspacePackagePaths() {
  const roots = ["apps", "packages", "vendor/nightingale"];
  const paths = [];
  for (const directory of roots) {
    const parent = resolve(root, directory);
    for (const entry of await readdir(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = resolve(parent, entry.name, "package.json");
      try {
        await stat(candidate);
        paths.push(relative(root, candidate));
      } catch {
        // Non-package source directories are not workspace members.
      }
    }
  }
  return paths.sort();
}

const packageResolutionId = (key) => {
  const unpeered = key.replace(/\(.+\)$/u, "");
  const separator = unpeered.lastIndexOf("@");
  return { name: unpeered.slice(0, separator), version: unpeered.slice(separator + 1) };
};

const lockPackageEntries = (source) => {
  const packages = source.match(/^packages:\n([\s\S]*?)^snapshots:/mu)?.[1];
  assert(packages !== undefined, "pnpm lockfile has no packages section");
  return [...packages.matchAll(/^ {2}((?:'[^']*@\d[^']*')|(?:[^\s:]*@\d[^\s:]*)):$/gmu)].map(
    (match, index, all) => {
      const key = match[1].replace(/^'|'$/gu, "");
      const start = match.index ?? 0;
      const end =
        index + 1 < all.length ? (all[index + 1].index ?? packages.length) : packages.length;
      const raw = packages.slice(start, end);
      const inlineIntegrity = raw.match(/^ {4}resolution: \{integrity: ([^,}\s]+)\}$/mu)?.[1];
      const standaloneIntegrity = raw.match(/^ {6}integrity: (\S+)$/mu)?.[1];
      const integrity = inlineIntegrity ?? standaloneIntegrity;
      const registry =
        inlineIntegrity !== undefined ||
        /^ {4}resolution:\n(?: {6}.+\n)*? {6}integrity: /mu.test(raw);
      assert(registry, `unsupported non-registry package resolution for ${key}`);
      assert(integrity !== undefined, `registry package ${key} has no integrity`);
      parseIntegrity(integrity);
      return {
        key,
        raw,
        integrity,
        ...packageResolutionId(key),
      };
    },
  );
};

async function installedPackageEvidence() {
  const store = resolve(root, "node_modules/.pnpm");
  const entries = await readdir(store, { withFileTypes: true });
  const inventory = new Map();
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith("lock.yaml")) continue;
    const modules = resolve(store, entry.name, "node_modules");
    try {
      for (const child of await readdir(modules, { withFileTypes: true })) {
        const candidates = child.name.startsWith("@")
          ? (await readdir(resolve(modules, child.name), { withFileTypes: true })).map((nested) =>
              resolve(modules, child.name, nested.name, "package.json"),
            )
          : [resolve(modules, child.name, "package.json")];
        for (const candidate of candidates) {
          let value;
          try {
            value = JSON.parse(await readFile(candidate, "utf8"));
          } catch {
            // Some pnpm package entries are links or package subpaths, not package roots.
            continue;
          }
          if (typeof value.name !== "string" || !exactVersion.test(value.version ?? "")) continue;
          const directory = resolve(candidate, "..");
          const licenses = await Promise.all(
            (await readdir(directory, { withFileTypes: true }))
              .filter(
                (entry) =>
                  entry.isFile() && /^(?:licen[cs]e|copying|notice)(?:\.|$)/iu.test(entry.name),
              )
              .sort((left, right) => left.name.localeCompare(right.name))
              .map(async (entry) => {
                const value = await readFile(resolve(directory, entry.name), "utf8");
                return { path: entry.name, sha256: sha256(value), text: value };
              }),
          );
          inventory.set(`${value.name}@${value.version}`, {
            name: value.name,
            version: value.version,
            license: value.license,
            packageJsonSha256: sha256(await readFile(candidate, "utf8")),
            licenseFiles: licenses,
          });
        }
      }
    } catch {
      // Metadata-only pnpm entries have no node_modules directory.
    }
  }
  assert(inventory.size > 0, "installed dependency evidence is unexpectedly empty");
  return inventory;
}

const spdxIdentifiers = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "ISC",
  "MIT",
  "MPL-2.0",
  "Python-2.0",
  "Unlicense",
]);
const validLicenseExpression = (value) => {
  if (typeof value !== "string" || value.trim() === "" || value === "UNLICENSED") return false;
  const tokens = value.match(/[A-Za-z0-9.-]+/gu) ?? [];
  return (
    tokens.length > 0 &&
    tokens.every((token) => token === "AND" || token === "OR" || spdxIdentifiers.has(token))
  );
};

const lockfile = await text("pnpm-lock.yaml");
const workspaceYaml = await text("pnpm-workspace.yaml");
const dependencyEvidence = await json("DEPENDENCY_EVIDENCE.json");
const lockEntries = lockPackageEntries(lockfile);
assert(lockEntries.length > 0, "pnpm lockfile has no package resolutions");
assert(
  new Set(lockEntries.map((entry) => entry.key)).size === lockEntries.length,
  "pnpm lockfile has duplicate package resolution keys",
);
assert(dependencyEvidence.schemaVersion === 1, "dependency evidence schema version drifted");
assert(
  dependencyEvidence.lockfileSha256 === sha256(lockfile),
  "dependency evidence was not generated from this exact pnpm lockfile",
);
const evidenceResolutions = dependencyEvidence.resolutions;
const evidenceRecords = dependencyEvidence.evidence;
assert(
  evidenceResolutions !== null && typeof evidenceResolutions === "object",
  "dependency evidence has no resolution mapping",
);
assert(
  evidenceRecords !== null && typeof evidenceRecords === "object",
  "dependency evidence has no evidence records",
);
const evidenceCoversLockExactly = (resolutions) =>
  JSON.stringify(Object.keys(resolutions).sort()) ===
  JSON.stringify(lockEntries.map((entry) => entry.key).sort());
assert(
  evidenceCoversLockExactly(evidenceResolutions),
  "dependency evidence does not cover exactly every pnpm package resolution",
);
const referencedEvidence = new Set();
for (const entry of lockEntries) {
  const resolved = evidenceResolutions[entry.key];
  assert(resolved !== undefined, `dependency evidence is missing ${entry.key}`);
  assert(
    resolved.packageEntrySha256 === sha256(entry.raw),
    `dependency evidence lock entry digest drifted for ${entry.key}`,
  );
  assert(
    resolved.integrity === entry.integrity,
    `dependency evidence lock integrity drifted for ${entry.key}`,
  );
  assert(
    typeof resolved.evidence === "string",
    `dependency evidence link missing for ${entry.key}`,
  );
  const record = evidenceRecords[resolved.evidence];
  assert(record !== undefined, `dependency evidence record missing for ${entry.key}`);
  referencedEvidence.add(resolved.evidence);
  assert(
    record.name === entry.name && record.version === entry.version,
    `dependency evidence identity drifted for ${entry.key}`,
  );
  assert(validLicenseExpression(record.license), `${entry.key} has an invalid license expression`);
  assert(
    typeof record.packageJsonSha256 === "string" &&
      /^[a-f0-9]{64}$/u.test(record.packageJsonSha256),
    `${entry.key} has no package.json identity hash`,
  );
  assert(
    record.licenseEvidence === "package.json" ||
      record.licenseEvidence === "package.json and retained text",
    `${entry.key} has an invalid license evidence declaration`,
  );
  assert(Array.isArray(record.licenseFiles), `${entry.key} has malformed license-file evidence`);
  for (const licenseFile of record.licenseFiles)
    assert(
      typeof licenseFile.path === "string" &&
        typeof licenseFile.text === "string" &&
        licenseFile.sha256 === sha256(licenseFile.text),
      `${entry.key} has invalid retained license text evidence`,
    );
  if (record.source === "npm-tarball") {
    assert(typeof record.tarball === "string", `${entry.key} tarball source is missing`);
    assert(
      record.archive?.verified === true &&
        record.archive.integrity === entry.integrity &&
        typeof record.archive.sha256 === "string" &&
        /^[a-f0-9]{64}$/u.test(record.archive.sha256),
      `${entry.key} tarball evidence lacks a verified archive hash matching the lock integrity`,
    );
    assert(
      typeof record.packageJsonText === "string",
      `${entry.key} tarball metadata text is missing`,
    );
    assert(
      sha256(record.packageJsonText) === record.packageJsonSha256,
      `${entry.key} tarball package.json identity drifted`,
    );
    const packageJson = JSON.parse(record.packageJsonText);
    assert(
      packageJson.name === entry.name &&
        packageJson.version === entry.version &&
        packageJson.license === record.license,
      `${entry.key} tarball package metadata drifted`,
    );
  } else
    assert(record.source === "installed-package", `${entry.key} has an unknown evidence source`);
}
assert(
  referencedEvidence.size === Object.keys(evidenceRecords).length,
  "dependency evidence contains an unreferenced record",
);
const installedEvidence = await installedPackageEvidence();
for (const entry of lockEntries) {
  const actual = installedEvidence.get(`${entry.name}@${entry.version}`);
  if (actual === undefined) continue;
  const record = evidenceRecords[evidenceResolutions[entry.key].evidence];
  assert(
    actual.packageJsonSha256 === record.packageJsonSha256 && actual.license === record.license,
    `installed package metadata differs from checked evidence for ${entry.key}`,
  );
  assert(
    JSON.stringify(actual.licenseFiles) === JSON.stringify(record.licenseFiles),
    `installed license text differs from checked evidence for ${entry.key}`,
  );
}
const tarballEvidenceCount = Object.values(evidenceRecords).filter(
  (record) => record.source === "npm-tarball",
).length;
if (process.argv.includes("--self-test")) {
  const missingResolution = { ...evidenceResolutions };
  delete missingResolution[lockEntries[0].key];
  assert(
    !evidenceCoversLockExactly(missingResolution),
    "dependency-evidence self-test did not detect an omitted resolution",
  );
  assert(
    !validLicenseExpression("UNLICENSED"),
    "license-expression self-test did not reject an unlicensed package",
  );
  assert(
    sha256("tampered package metadata") !==
      evidenceRecords[evidenceResolutions[lockEntries[0].key].evidence].packageJsonSha256,
    "package-metadata self-test did not detect a digest mismatch",
  );
  const expected = verifyArchiveIntegrity(
    Buffer.from("p80 archive bytes"),
    "sha256-u/k++IHJfeBQHWAUHOTMGlbb4fiMwyeHVOvc8sfLV3U=",
  );
  assert(expected.verified, "archive-integrity self-test did not verify known bytes");
  let rejectedArchive = false;
  try {
    verifyArchiveIntegrity(Buffer.from("tampered p80 archive bytes"), expected.integrity);
  } catch {
    rejectedArchive = true;
  }
  assert(rejectedArchive, "archive-integrity self-test did not reject tampered bytes");
}
const catalogVersions = new Map(
  [
    ...workspaceYaml.matchAll(
      /^ {2}('[^']+'|[A-Za-z0-9@/_-]+): (\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/gmu,
    ),
  ].map((match) => [match[1].replaceAll("'", ""), match[2]]),
);
const packagePaths = await workspacePackagePaths();
const packages = await Promise.all(
  packagePaths.map(async (path) => ({ path, value: await json(path) })),
);
const packageByName = new Map();
for (const entry of packages) {
  assert(typeof entry.value.name === "string", `${entry.path} has no package name`);
  assert(!packageByName.has(entry.value.name), `duplicate workspace package ${entry.value.name}`);
  packageByName.set(entry.value.name, entry);
}

assert(packageByName.size === 15, `expected 15 workspace packages; found ${packageByName.size}`);
assert(lockfile.includes("lockfileVersion: '9.0'"), "pnpm lockfile v9 is required");
assert(
  (lockfile.match(/^ {2}molstar@5\.11\.0:$/gm) ?? []).length === 1,
  "must resolve exactly one molstar@5.11.0 package",
);
assert(
  !/\b(?:@molstar\/mvs|molstar-mvs|mvs-builder)@/iu.test(lockfile),
  "separate MVS dependency found",
);
assert(!lockfile.includes("vendor/molstar"), "vendored Mol* source is forbidden");
assert(
  !/^ {2}['"]?@nightingale-elements\//mu.test(lockfile),
  "registry Nightingale resolution found",
);

const graph = new Map([...packageByName.keys()].map((name) => [name, []]));
const directDependencies = [];
for (const [name, entry] of packageByName) {
  for (const [dependency, version] of Object.entries({
    ...(entry.value.dependencies ?? {}),
    ...(entry.value.devDependencies ?? {}),
  })) {
    if (!dependency.startsWith("@seq-star/") && !dependency.startsWith("@nightingale-elements/")) {
      assert(
        version === "catalog:" || /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version),
        `${entry.path} has a non-exact external dependency ${dependency}@${version}`,
      );
      directDependencies.push(`${name}:${dependency}@${version}`);
      if (version === "catalog:") {
        const expected = catalogVersions.get(dependency);
        assert(
          expected !== undefined,
          `${entry.path} uses undeclared catalog dependency ${dependency}`,
        );
        const importerPath = entry.path.replace(/\/package\.json$/u, "");
        const importer = lockfile.match(
          new RegExp(
            `^  ${esc(importerPath)}:\\n([\\s\\S]*?)(?=^  (?! ).+?:\\n|^packages:|^snapshots:)`,
            "mu",
          ),
        )?.[1];
        assert(
          importer?.includes(`specifier: 'catalog:'`) && importer.includes(`version: ${expected}`),
          `${entry.path} catalog resolution for ${dependency} is not exactly ${expected}`,
        );
      }
    }
    if (dependency.startsWith("@seq-star/") || dependency.startsWith("@nightingale-elements/")) {
      assert(version === "workspace:*", `${entry.path} must use workspace:* for ${dependency}`);
      assert(
        packageByName.has(dependency),
        `${entry.path} references unknown workspace package ${dependency}`,
      );
      graph.get(name).push(dependency);
    }
  }
}
const visiting = new Set();
const visited = new Set();
function visit(node, chain = []) {
  assert(!visiting.has(node), `workspace dependency cycle: ${[...chain, node].join(" -> ")}`);
  if (visited.has(node)) return;
  visiting.add(node);
  for (const next of graph.get(node)) visit(next, [...chain, node]);
  visiting.delete(node);
  visited.add(node);
}
for (const name of graph.keys()) visit(name);

for (const packageName of [
  "nightingale-new-core",
  "nightingale-sequence",
  "nightingale-track",
  "nightingale-linegraph-track",
]) {
  assert(
    lockfile.includes(`vendor/nightingale/${packageName}:`),
    `missing local ${packageName} lockfile importer`,
  );
}
const molstarConsumers = packages
  .filter(({ value }) => value.dependencies?.molstar === "5.11.0")
  .map(({ value }) => value.name)
  .sort();
assert(
  JSON.stringify(molstarConsumers) ===
    JSON.stringify([
      "@seq-star/integration-plugins",
      "@seq-star/prototype-web",
      "@seq-star/wrapper-molstar",
    ]),
  `unexpected Mol* consumers: ${molstarConsumers.join(", ")}`,
);

const imports = await filesRecursively(resolve(root, "packages"));
const appFiles = await filesRecursively(resolve(root, "apps/web/src"));
const moduleReferences = (source) =>
  [
    ...source.matchAll(
      /(?:\b(?:import|export)\s*(?:type\s*)?(?:[^"']*?\sfrom\s*)?|\bimport\s*\()\s*["']([^"']+)["']/gu,
    ),
  ].map((match) => match[1]);
for (const file of [...imports, ...appFiles]) {
  if (!/\.(?:[cm]?[jt]sx?|css)$/u.test(file)) continue;
  const source = await readFile(file, "utf8");
  const display = relative(root, file);
  const references = moduleReferences(source);
  assert(
    !references.some((reference) => reference.includes("legacy/")),
    `${display} imports legacy/`,
  );
  if (!display.startsWith("packages/wrapper-nightingale/")) {
    assert(
      !references.some((reference) => reference.startsWith("@nightingale-elements/")),
      `${display} bypasses the Nightingale wrapper`,
    );
  }
  if (display.startsWith("packages/wrapper-") && display.includes("/src/")) {
    const own = `@seq-star/${display.split(sep)[1]}`;
    const wrapperImports = references.filter((reference) =>
      /^@seq-star\/wrapper-(?:seq-viewer|nightingale|molstar)$/u.test(reference),
    );
    assert(
      wrapperImports.every((dependency) => dependency === own),
      `${display} imports another visualizer wrapper`,
    );
  }
  if (
    display.startsWith("packages/seq-core/") ||
    display.startsWith("packages/seq-coords/") ||
    display.startsWith("packages/seq-view-spec/")
  ) {
    assert(
      !references.some((reference) =>
        /^(?:react|rxjs|molstar|@seq-star\/harness|@seq-star\/wrapper|@seq-star\/seq-viewer)/u.test(
          reference,
        ),
      ),
      `${display} crosses a lower-layer boundary`,
    );
  }
  if (
    !display.startsWith("packages/wrapper-molstar/") &&
    !display.startsWith("packages/integration-plugins/") &&
    !display.startsWith("apps/web/src/routes/")
  )
    assert(!references.includes("molstar"), `${display} imports Mol* outside its allowed boundary`);
}
for (const file of appFiles.filter((path) => path.includes(`${sep}routes${sep}`))) {
  const source = await readFile(file, "utf8");
  const display = relative(root, file);
  assert(
    !/\b(?:create(?:Table|Identity|Alignment|Cds)Translator|translateLoci|MVSData|createMVS|build(?:.*Mvs|.*Mol)|register\s*\(.*Translator)/u.test(
      source,
    ),
    `${display} contains mapping or MVS generation glue`,
  );
}

const viteConfig = await text("apps/web/vite.config.ts");
assert(
  viteConfig.indexOf("tanstackRouter(") < viteConfig.indexOf("react()"),
  "TanStack Router plugin must precede React",
);
assert(
  (await text("apps/web/src/main.tsx")).includes("createHashHistory"),
  "web app must use hash routing",
);
for (const [path, requiredText] of [
  ["README.md", "mise exec -- pnpm install --offline --frozen-lockfile"],
  ["THIRD_PARTY_LICENSES.md", "Mol* (including MVS)"],
  ["TRACEABILITY.md", "P80 reviewed checkpoint: REVIEWED"],
]) {
  assert((await text(path)).includes(requiredText), `${path} is incomplete`);
}

const upstream = await text("vendor/nightingale/UPSTREAM.md");
const patches = await text("vendor/nightingale/PATCHES.md");
assert(
  upstream.includes("a4a65eccbf03fe5290adb1ec171cb5a43e8a3d83"),
  "Nightingale upstream commit missing",
);
assert(upstream.includes("v5.10.3"), "Nightingale upstream tag missing");
assert(
  (await text("vendor/nightingale/LICENSE")).includes("MIT License"),
  "Nightingale MIT notice missing",
);
for (const packageName of [
  "nightingale-new-core",
  "nightingale-sequence",
  "nightingale-track",
  "nightingale-linegraph-track",
]) {
  assert(upstream.includes(packageName), `UPSTREAM.md omits ${packageName}`);
}
const patchedPaths = [
  "nightingale-base-element.ts",
  "bindEvents.ts",
  "withResizable/index.ts",
  "withZoom/index.ts",
  "nightingale-sequence.ts",
  "nightingale-track.ts",
  "nightingale-linegraph-track.ts",
];
for (const path of patchedPaths) assert(patches.includes(path), `PATCHES.md omits ${path}`);
const accountedVendorChanges = new Map([
  [
    "nightingale-linegraph-track/src/nightingale-linegraph-track.ts",
    "nightingale-linegraph-track.ts",
  ],
  ["nightingale-linegraph-track/types/index.d.ts", "narrow public declarations"],
  ["nightingale-new-core/src/mixins/withResizable/index.ts", "withResizable/index.ts"],
  ["nightingale-new-core/src/mixins/withZoom/index.ts", "withZoom/index.ts"],
  ["nightingale-new-core/src/nightingale-base-element.ts", "nightingale-base-element.ts"],
  ["nightingale-new-core/src/utils/bindEvents.ts", "bindEvents.ts"],
  ["nightingale-sequence/src/nightingale-sequence.ts", "nightingale-sequence.ts"],
  ["nightingale-sequence/types/index.d.ts", "narrow public declarations"],
  ["nightingale-track/src/nightingale-track.ts", "nightingale-track.ts"],
  ["nightingale-track/types/index.d.ts", "narrow public declarations"],
]);
const assertVendorAccounting = (changedPaths) => {
  for (const changed of changedPaths) {
    if (changed.endsWith("/PATCHES.md") || changed.endsWith("/UPSTREAM.md")) continue;
    const key = changed.replace("prototype/vendor/nightingale/", "");
    const evidence = accountedVendorChanges.get(key);
    assert(
      evidence !== undefined && patches.includes(evidence),
      `PATCHES.md does not account for vendored diff ${key}`,
    );
  }
};
const repository = resolve(root, "..");
const { stdout: committedVendorDiff } = await execFileAsync(
  "git",
  ["diff", "--name-only", "0102cc4..HEAD", "--", "prototype/vendor/nightingale"],
  { cwd: repository },
);
const { stdout: workingVendorStatus } = await execFileAsync(
  "git",
  ["status", "--porcelain=v1", "--untracked-files=all", "--", "prototype/vendor/nightingale"],
  { cwd: repository },
);
const workingVendorPaths = workingVendorStatus
  .split("\n")
  .filter(Boolean)
  .map((line) => line.slice(3).replace(/^.* -> /u, ""));
assertVendorAccounting([...committedVendorDiff.split("\n"), ...workingVendorPaths].filter(Boolean));
if (process.argv.includes("--self-test")) {
  let rejected = false;
  try {
    assertVendorAccounting(["prototype/vendor/nightingale/unaccounted-local-drift.ts"]);
  } catch {
    rejected = true;
  }
  assert(rejected, "vendor-drift self-test did not reject an unaccounted untracked source file");
}

const manifest = await json("fixtures/manifest.json");
assert(
  manifest.schemaVersion === 1 && manifest.cases.length === 4,
  "fixture manifest is incomplete",
);
const requiredCases = new Set([
  "renderer-portability",
  "uniprot-structure",
  "complex",
  "alignment-structure",
]);
let fixtureBytes = 0;
for (const entry of manifest.cases) {
  assert(
    requiredCases.delete(entry.caseId),
    `unexpected or duplicate fixture case ${entry.caseId}`,
  );
  const metadataPath = `fixtures/${entry.caseId}/metadata.json`;
  const metadataBytes = await readFile(resolve(root, metadataPath));
  const metadata = JSON.parse(metadataBytes.toString("utf8"));
  assert(
    metadata.status === "approved" &&
      Array.isArray(metadata.sources) &&
      metadata.sources.length > 0,
    `${entry.caseId} provenance is incomplete`,
  );
  assert(
    metadata.transformations && metadata.sizeBudget?.withinBudget === true,
    `${entry.caseId} transformations or size budget missing`,
  );
  assert(
    sha256(metadataBytes) === entry.metadataSha256 && metadataBytes.length === entry.metadataBytes,
    `${entry.caseId} metadata drift`,
  );
  const listed = new Map(metadata.files.map((file) => [file.path, file]));
  const caseRoot = resolve(root, "fixtures", entry.caseId);
  const actualFiles = (await filesRecursively(caseRoot))
    .map((path) => relative(caseRoot, path))
    .filter((path) => path !== "metadata.json")
    .sort();
  assert(
    JSON.stringify(actualFiles) === JSON.stringify([...listed.keys()].sort()),
    `${entry.caseId} contains an unlisted or missing fixture file`,
  );
  let caseBytes = 0;
  for (const file of entry.files) {
    const localPath = resolve(root, "fixtures", file.path);
    const bytes = await readFile(localPath);
    const declared = listed.get(file.path.slice(`${entry.caseId}/`.length));
    assert(
      declared?.sha256 === file.sha256 && declared.bytes === file.bytes,
      `${file.path} metadata/manifest mismatch`,
    );
    assert(
      bytes.length === file.bytes && sha256(bytes) === file.sha256,
      `${file.path} hash or byte drift`,
    );
    caseBytes += file.bytes;
  }
  assert(
    caseBytes === entry.contentBytes && caseBytes === metadata.sizeBudget.checkedInBytes,
    `${entry.caseId} fixture byte total drift`,
  );
  if (metadata.syntheticData?.present) {
    assert(
      metadata.syntheticData.requiredDisplayLabel?.length > 0,
      `${entry.caseId} lacks a synthetic display label`,
    );
    for (const synthetic of metadata.syntheticData.files)
      assert(
        listed.get(synthetic)?.classification === "synthetic",
        `${entry.caseId} synthetic file not labeled`,
      );
  } else
    assert(metadata.syntheticData === false, `${entry.caseId} synthetic declaration is ambiguous`);
  fixtureBytes += caseBytes;
}
assert(requiredCases.size === 0, `missing fixture cases: ${[...requiredCases].join(", ")}`);
const uniprotFixture = await json("fixtures/uniprot-structure/metadata.json");
assert(
  JSON.stringify(uniprotFixture.mappingAudit?.missingCoordinateUniProtRangeInclusive) ===
    JSON.stringify([290, 312]) && uniprotFixture.mappingAudit?.siftsObservedResidues === 196,
  "1TUP missing/observed mapping facts drifted",
);
const complexFixture = await json("fixtures/complex/metadata.json");
assert(
  JSON.stringify(complexFixture.mappingAudit?.barnase?.missingCoordinateUniProtPositions) ===
    JSON.stringify([48, 49]) &&
    complexFixture.mappingAudit?.barstar?.verifiedConstructConflicts?.length === 2 &&
    complexFixture.mappingAudit?.contactRule?.molstarValidation?.contactPairs === 43,
  "1BRS missing/mutation/contact facts drifted",
);
const alignmentFixture = await json("fixtures/alignment-structure/metadata.json");
assert(
  alignmentFixture.alignmentAudit?.rows === 32 &&
    alignmentFixture.alignmentAudit?.queryGapColumns === 7 &&
    alignmentFixture.alignmentAudit?.initiatorMethionineUnmappedToStructure === 1,
  "alignment row/gap/missing facts drifted",
);
assert(
  complexFixture.syntheticData?.requiredDisplayLabel?.includes("not a biological prediction"),
  "synthetic confidence label drifted",
);

const mise = await text(".mise.toml");
const rootPackage = await json("package.json");
assert(
  mise.includes('node = "26.7.0"') && mise.includes('pnpm = "11.22.0"'),
  "mise tool pins drifted",
);
assert(rootPackage.packageManager === "pnpm@11.22.0", "package-manager pin drifted");
assert(rootPackage.devDependencies?.typescript === "6.0.3", "TypeScript pin drifted");
assert(rootPackage.devDependencies?.["@biomejs/biome"] === "2.5.9", "Biome pin drifted");
assert(
  process.version === "v26.7.0",
  `P80 audit must run under pinned Node v26.7.0, received ${process.version}`,
);
const { stdout: pnpmVersion } = await execFileAsync("pnpm", ["--version"], { cwd: root });
assert(
  pnpmVersion.trim() === "11.22.0",
  `P80 audit must run under pinned pnpm 11.22.0, received ${pnpmVersion.trim()}`,
);
await execFileAsync("pnpm", ["--filter", "@seq-star/seq-view-spec", "run", "check:schema"], {
  cwd: root,
});
const dependencyResolutionKeys = lockEntries.map((entry) => entry.key).sort();

console.log(
  JSON.stringify(
    {
      status: "passed",
      workspacePackages: packageByName.size,
      fixtureCases: manifest.cases.length,
      fixtureBytes,
      molstar: "5.11.0",
      molstarConsumers,
      nightingale: "local workspace only",
      directDependencies: directDependencies.sort(),
      dependencyResolutionCount: dependencyResolutionKeys.length,
      dependencyResolutionSha256: sha256(JSON.stringify(dependencyResolutionKeys)),
      tarballEvidenceCount,
      ...(process.argv.includes("--inventory")
        ? { dependencyResolutionKeys, dependencyEvidence }
        : {}),
    },
    null,
    2,
  ),
);
