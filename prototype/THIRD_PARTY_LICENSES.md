# Third-party dependency and license inventory

This inventory is checked against the workspace manifests and `pnpm-lock.yaml`
by `mise run check:p80`. [DEPENDENCY_EVIDENCE.json](DEPENDENCY_EVIDENCE.json)
is the checked, deterministic record for every exact `packages:` resolution in
the lockfile. It maps each resolution key to one unique package metadata and
license-evidence record, records the lock-entry/integrity digests, and retains
the exact `package.json` plus license/notice text for platform packages absent
from the current host install. `scripts/generate-dependency-evidence.mjs` is a
deliberate networked maintenance command; `check:p80` is entirely offline and
fails closed on missing resolution coverage, lock/artifact drift, invalid SPDX
expressions, or altered metadata/license text. This Markdown table is the
readable direct tool/runtime/vendor summary, not a substitute for the complete
checked evidence artifact.

| Component | Version / source | License or notice | Evidence |
| --- | --- | --- | --- |
| Node.js | `26.7.0` | MIT | `.mise.toml`; audit verifies `process.version` |
| pnpm | `11.22.0` | MIT | `.mise.toml`, `package.json` |
| TypeScript | `6.0.3` | Apache-2.0 | root `package.json` |
| Biome | `2.5.9` | MIT OR Apache-2.0 | root `package.json` |
| Vite / Vitest | `8.2.1` / `4.1.11` | MIT | root `package.json` |
| Playwright | `1.62.1` | Apache-2.0 | root `package.json` |
| React / React DOM | `19.2.8` | MIT | `pnpm-workspace.yaml` catalog |
| TanStack Router / plugin | `1.170.31` / `1.168.34` | MIT | catalog |
| Tailwind CSS / Vite plugin | `4.3.3` | MIT | catalog |
| RxJS | `7.8.2` | Apache-2.0 | harness/viewer manifests |
| TypeBox | `1.3.7` | MIT | schema/core manifests |
| Mol* (including MVS) | `5.11.0`, one physical lockfile resolution | MIT | wrapper and plugin manifests; `audit-p80-hardening.mjs` |
| Lit | `3.1.3` | BSD-3-Clause | vendored Nightingale manifests |
| D3 | `7.9.0` | ISC | vendored Nightingale manifests |
| lodash-es | `4.17.21` | MIT | vendored track manifest |

## Vendored Nightingale

The exact source is upstream commit `a4a65eccbf03fe5290adb1ec171cb5a43e8a3d83`
(`v5.10.3`) from [ebi-webcomponents/nightingale](https://github.com/ebi-webcomponents/nightingale).
The retained root [LICENSE](vendor/nightingale/LICENSE) is MIT. The selected
workspace packages are `nightingale-new-core`, `nightingale-sequence`,
`nightingale-track`, and `nightingale-linegraph-track`; their manifests retain
their upstream licensing metadata. The `nightingale-sequence` manifest states
ISC while its upstream tarball retains the same MIT notice; this discrepancy is
recorded rather than rewritten. Source origin and selected closure are in
[UPSTREAM.md](vendor/nightingale/UPSTREAM.md); all behavior-affecting local
changes are enumerated in [PATCHES.md](vendor/nightingale/PATCHES.md).

There is no registry `@nightingale-elements/*` package in the lockfile, no
vendored Mol* subtree, and no separate MVS implementation. The P80 audit fails
if any of those invariants drift.

## Fixture provenance and terms

The fixture metadata records source URLs, retrieval/revision data, redistribution
terms, hashes, byte budgets, transformations, mappings, gaps, missing residues,
and synthetic labels. The checked-in raw records use UniProt CC BY 4.0, wwPDB
CC0 1.0, InterPro/Pfam CC0 1.0 where applicable, and retained PDBe SIFTS notices.
See [fixtures/README.md](fixtures/README.md) and the per-case `metadata.json`
records; use the metadata as the authoritative provenance record.
