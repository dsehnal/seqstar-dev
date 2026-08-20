/**
 * Creates the checked P80 dependency evidence from the exact `packages:`
 * resolutions in pnpm-lock.yaml. This is deliberately a maintenance command,
 * not part of the offline audit: platform-conditional packages are not all
 * materialised in a host-specific pnpm installation, so their original npm
 * tarballs are fetched only when this artifact is deliberately regenerated.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const text = (path) => readFile(path, "utf8");
const parseIntegrity = (value) => {
  const match = /^(sha(?:256|384|512))-([A-Za-z0-9+/]+={0,2})$/u.exec(value);
  if (match === null) throw new Error(`Unsupported or malformed package integrity '${value}'.`);
  return { algorithm: match[1], digest: match[2] };
};
const archiveEvidence = (bytes, integrity) => {
  const parsed = parseIntegrity(integrity);
  const actual = createHash(parsed.algorithm).update(bytes).digest("base64");
  if (actual !== parsed.digest)
    throw new Error(`Downloaded archive fails lockfile integrity '${integrity}'.`);
  return { integrity, sha256: sha256(bytes), verified: true };
};
const resolutionId = (key) => {
  const unpeered = key.replace(/\(.+\)$/u, "");
  const separator = unpeered.lastIndexOf("@");
  return { name: unpeered.slice(0, separator), version: unpeered.slice(separator + 1) };
};
const packageEntries = (lockfile) => {
  const packages = lockfile.match(/^packages:\n([\s\S]*?)^snapshots:/mu)?.[1];
  if (packages === undefined) throw new Error("pnpm lockfile does not have a packages section");
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
      if (registry && integrity === undefined)
        throw new Error(`Registry package ${key} has no lockfile integrity.`);
      if (!registry)
        throw new Error(
          `Unsupported non-registry package resolution for ${key}; classify it explicitly.`,
        );
      return { key, raw, integrity, ...resolutionId(key) };
    },
  );
};
const licenseFiles = async (directory) => {
  const names = await readdir(directory, { withFileTypes: true });
  return Promise.all(
    names
      .filter(
        (entry) => entry.isFile() && /^(?:licen[cs]e|copying|notice)(?:\.|$)/iu.test(entry.name),
      )
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(async (entry) => {
        const value = await readFile(resolve(directory, entry.name), "utf8");
        return { path: entry.name, sha256: sha256(value), text: value };
      }),
  );
};
const localPackages = async () => {
  const store = resolve(root, "node_modules/.pnpm");
  const found = new Map();
  for (const entry of await readdir(store, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const modules = resolve(store, entry.name, "node_modules");
    let children;
    try {
      children = await readdir(modules, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const child of children) {
      const roots = child.name.startsWith("@")
        ? (await readdir(resolve(modules, child.name), { withFileTypes: true })).map((nested) =>
            resolve(modules, child.name, nested.name),
          )
        : [resolve(modules, child.name)];
      for (const directory of roots) {
        try {
          const packageJsonText = await text(resolve(directory, "package.json"));
          const packageJson = JSON.parse(packageJsonText);
          if (typeof packageJson.name !== "string" || typeof packageJson.version !== "string")
            continue;
          found.set(`${packageJson.name}@${packageJson.version}`, {
            packageJsonText,
            packageJson,
            licenses: await licenseFiles(directory),
            source: "installed-package",
          });
        } catch {
          // A symlink or package subpath is not a package root.
        }
      }
    }
  }
  return found;
};
const tarballPackage = async ({ name, version, integrity }) => {
  if (integrity === undefined) throw new Error(`${name}@${version} has no registry integrity.`);
  const metadataUrl = `https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`;
  const { stdout: metadataText } = await execFileAsync("curl", [
    "--fail",
    "--silent",
    "--show-error",
    "--max-time",
    "60",
    metadataUrl,
  ]);
  const metadata = JSON.parse(metadataText);
  if (metadata?.dist?.tarball === undefined)
    throw new Error(`${name}@${version} has no npm tarball`);
  if (integrity !== undefined && metadata.dist.integrity !== integrity)
    throw new Error(`${name}@${version} registry integrity differs from pnpm lockfile`);
  const directory = await mkdtemp(resolve(tmpdir(), "seqstar-p80-evidence-"));
  try {
    const archive = resolve(directory, "package.tgz");
    await execFileAsync("curl", [
      "--fail",
      "--silent",
      "--show-error",
      "--max-time",
      "60",
      "--output",
      archive,
      metadata.dist.tarball,
    ]);
    const archiveEvidenceRecord = archiveEvidence(await readFile(archive), integrity);
    await execFileAsync("tar", ["-xzf", archive, "-C", directory]);
    const packageRoot = resolve(directory, "package");
    const packageJsonText = await text(resolve(packageRoot, "package.json"));
    return {
      packageJsonText,
      packageJson: JSON.parse(packageJsonText),
      licenses: await licenseFiles(packageRoot),
      source: "npm-tarball",
      tarball: metadata.dist.tarball,
      archive: archiveEvidenceRecord,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

const lockfile = await text(resolve(root, "pnpm-lock.yaml"));
const entries = packageEntries(lockfile);
if (entries.length === 0) throw new Error("pnpm lockfile has no package resolutions");
const local = await localPackages();
const records = {};
const resolutions = {};
for (const entry of entries) {
  const packageId = `${entry.name}@${entry.version}`;
  const evidence = local.get(packageId) ?? (await tarballPackage(entry));
  if (evidence.packageJson.name !== entry.name || evidence.packageJson.version !== entry.version)
    throw new Error(`tarball identity mismatch for ${entry.key}`);
  if (typeof evidence.packageJson.license !== "string" || evidence.packageJson.license.length === 0)
    throw new Error(`${entry.key} lacks a package.json license`);
  const evidenceId = `sha256:${sha256(evidence.packageJsonText)}`;
  records[evidenceId] = {
    name: entry.name,
    version: entry.version,
    license: evidence.packageJson.license,
    licenseEvidence:
      evidence.licenses.length === 0 ? "package.json" : "package.json and retained text",
    packageJsonSha256: sha256(evidence.packageJsonText),
    ...(evidence.source === "npm-tarball" ? { packageJsonText: evidence.packageJsonText } : {}),
    licenseFiles: evidence.licenses,
    source: evidence.source,
    ...(evidence.tarball === undefined ? {} : { tarball: evidence.tarball }),
    ...(evidence.archive === undefined ? {} : { archive: evidence.archive }),
  };
  resolutions[entry.key] = {
    evidence: evidenceId,
    packageEntrySha256: sha256(entry.raw),
    ...(entry.integrity === undefined ? {} : { integrity: entry.integrity }),
  };
}
const artifact = {
  schemaVersion: 1,
  lockfileSha256: sha256(lockfile),
  resolutions: Object.fromEntries(
    Object.entries(resolutions).sort(([left], [right]) => left.localeCompare(right)),
  ),
  evidence: Object.fromEntries(
    Object.entries(records).sort(([left], [right]) => left.localeCompare(right)),
  ),
};
await writeFile(
  resolve(root, "DEPENDENCY_EVIDENCE.json"),
  `${JSON.stringify(artifact, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    resolutions: entries.length,
    evidence: Object.keys(records).length,
    output: relative(root, resolve(root, "DEPENDENCY_EVIDENCE.json")),
  }),
);
