# Nightingale upstream

- Repository: <https://github.com/ebi-webcomponents/nightingale>
- Upstream commit: `a4a65eccbf03fe5290adb1ec171cb5a43e8a3d83`
- Upstream tag: `v5.10.3`
- Commit date: 2026-07-09
- License: MIT repository license; selected sequence package metadata also
  identifies ISC. The upstream repository `LICENSE` is retained beside this
  file and the selected package metadata is retained in each package manifest.

## Selected source

The feasibility gate vendors the smallest upstream dependency closure needed
for the required renderer probe:

| Local directory | Upstream package | Probe responsibility |
| --- | --- | --- |
| `nightingale-new-core/` | `@nightingale-elements/nightingale-new-core` | Lit base element, sequence coordinates, zoom, resize, highlight, and native event helpers |
| `nightingale-sequence/` | `@nightingale-elements/nightingale-sequence` | protein sequence track |
| `nightingale-track/` | `@nightingale-elements/nightingale-track` | interval blocks and single-position marker shapes |
| `nightingale-linegraph-track/` | `@nightingale-elements/nightingale-linegraph-track` | numeric/value track |

The upstream root build, Storybook, examples, unrelated components, and tests
are intentionally omitted. Each selected directory retains its ordinary
editable `src/`, README when upstream supplies one, package manifest, and
TypeScript configuration. The shared TypeScript configuration is retained here
in a pnpm-compatible form; the upstream Lerna/Rollup publishing pipeline is not
needed by this source-consumption spike.

## Selection rationale

Commit `a4a65eccbf03fe5290adb1ec171cb5a43e8a3d83` is the current tagged upstream
release at selection time. Its four-package subset uses standard browser APIs,
Lit 3, and D3 7 and is compatible with the prototype's pinned Node 26/pnpm 11
toolchain. Keeping the upstream package names while requiring `workspace:*`
for every internal edge lets pnpm prove that no registry Nightingale copy is
present.

## License reconciliation

The exact upstream commit root `LICENSE` is MIT (copyright 2023
EMBL-European Bioinformatics Institute), and that exact notice is retained as
`LICENSE`. The selected `nightingale-sequence/package.json` declares `ISC`, but
the published `@nightingale-elements/nightingale-sequence@5.6.0` tarball's own
`LICENSE` is the same MIT notice. This subset therefore retains the actual MIT
license text and records the manifest/tarball inconsistency; it does not invent
an ISC copyright notice or claim an ISC text was supplied.
