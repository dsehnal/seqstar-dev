import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const lockfile = await readFile(resolve(root, "pnpm-lock.yaml"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(`P01 dependency audit: ${message}`);
}

const approvedExternal = new Map([
  ["molstar", "5.11.0"],
  ["d3", "7.9.0"],
  ["lit", "3.1.3"],
  ["lodash-es", "4.17.21"],
  ["@types/d3", "7.4.3"],
  ["@types/lodash-es", "4.17.12"],
]);
const vendorPackages = [
  "vendor/nightingale/nightingale-new-core/package.json",
  "vendor/nightingale/nightingale-sequence/package.json",
  "vendor/nightingale/nightingale-track/package.json",
  "vendor/nightingale/nightingale-linegraph-track/package.json",
];

for (const packagePath of vendorPackages) {
  const packageJson = await readJson(packagePath);
  for (const [name, version] of Object.entries({
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  })) {
    if (name.startsWith("@nightingale-elements/")) {
      assert(version === "workspace:*", `${packagePath} resolves ${name} outside this workspace`);
    } else {
      assert(
        approvedExternal.has(name),
        `${packagePath} declares unapproved external dependency ${name}`,
      );
      assert(version === approvedExternal.get(name), `${packagePath} does not pin ${name} exactly`);
    }
  }
}

const molstar = await readJson("packages/wrapper-molstar/package.json");
assert(molstar.dependencies?.molstar === "5.11.0", "Mol* is not pinned to 5.11.0");
const nightingale = await readJson("packages/wrapper-nightingale/package.json");
for (const [name, version] of Object.entries(nightingale.dependencies ?? {})) {
  if (name.startsWith("@nightingale-elements/")) {
    assert(version === "workspace:*", `${name} is not a workspace link`);
  }
}

assert(
  (lockfile.match(/^ {2}molstar@5\.11\.0:$/gm) ?? []).length === 1,
  "lockfile has not exactly one Mol* package resolution",
);
assert(
  !/^ {2}['"]?@nightingale-elements\/[^\n]+@/m.test(lockfile),
  "lockfile includes a registry Nightingale snapshot",
);
assert(
  !/\b(?:@molstar\/mvs|molstar-mvs|mvs-builder)@/i.test(lockfile),
  "lockfile includes a separate MVS package",
);

for (const packageName of [
  "nightingale-new-core",
  "nightingale-sequence",
  "nightingale-track",
  "nightingale-linegraph-track",
]) {
  assert(
    lockfile.includes(`vendor/nightingale/${packageName}:`),
    `lockfile omits local ${packageName}`,
  );
}

console.log(
  "P01 dependency audit passed: one molstar@5.11.0, local Nightingale links only, no separate MVS package.",
);
