# M01B dependency and Nightingale viewport audit

Status: feasibility gate complete; no production dependency, lockfile, vendor,
or configuration change was made by this packet.

## Decision

M02 should pin both packages at **`1.33.0`**:

| Consumer | Package | Exact version | Reason |
| --- | --- | --- | --- |
| React application surfaces | `lucide-react` | `1.33.0` | Typed React components for the shell, chooser, toolbar, and app-owned icon buttons. |
| Native DOM renderer controls | `lucide` | `1.33.0` | The tree-shaken DOM `createElement` API plus named icon-node imports is a small clean fit for Seq* and Nightingale-owned controls. |

Both packages are required. Passing React components through the wrapper
boundary would couple renderer packages to React; drawing bespoke SVGs in each
native control would duplicate an icon implementation. They have no runtime
dependencies, so this is the minimum package set.

M20 should implement a **wrapper-owned synchronized viewport controller**. It
must not vendor or depend on `@nightingale-elements/nightingale-manager`.
Nightingale's manager can broadcast `display-start`/`display-end`, but it does
not own fixed headers, an overview scrollbar, bounded geometry, a serializable
viewport descriptor, or a lifecycle-safe external controller. Using it would
therefore add a fifth vendor package without removing the wrapper work.

## Lucide evidence

The registry metadata and downloaded tarballs were inspected on 2026-08-20.

| Package | Registry integrity | Downloaded SHA-256 | License | Runtime dependencies | Compatibility |
| --- | --- | --- | --- | --- | --- |
| `lucide-react@1.33.0` | `sha512-MTRwMy0ZlL8Ur/vOAiJ9XGHE+kFPC7brq6MxAm0GiGXEBj0qy0jA/pG4N675oSzciO/UCdX8T+5yUQdmDeTLxg==` | `7acc49b25c0b6fb580deb02f701f2a32259088f0f461761e2b2c52545a07b140` | ISC, with retained Feather MIT notices | none; React is a peer | peer range explicitly includes React 19 |
| `lucide@1.33.0` | `sha512-qfSZR1mmM65zfGeqonve67gtHBmyJtvlpdMuXiQLN04RaQmEvD0o85S9Gi+A6JQaQXpjKz5FIUBdAUEhb1Lj1Q==` | `2a7a33a212eefde0cf1a0459beb17b2273d454aee5cf31c8058a192fd9d33a43` | ISC, with retained Feather MIT notices | none | ESM `module` entry and declarations supplied |

The actual tarballs have `sideEffects: false`, ESM modules, CJS fallbacks, and
declarations. `Box`, `Cuboid`, and `Layers` are directly exported by both
packages. Native code must combine the named `createElement` export with a
named icon-node export, for example `createElement(Box)`. It must not call
`createIcons`, import the `icons` namespace, or use a dynamic icon registry;
those APIs are unnecessary for controls whose icon is known at build time.

An isolated temporary app using the exact tarballs compiled with TypeScript
6.0.3 and React 19.2.8, then built in Vite 8.2.1. Its React entry imported only
`Box` and `Layers`; the production JS was 192,303 bytes (60,867 gzip), including
React/ReactDOM. A DOM-only entry importing only `Box` and `createElement`
produced 1,311 bytes (730 gzip). Neither output contained unselected `Airplay`
or `AlarmClock` exports; the DOM output also omitted `createIcons` and
`iconsAndAliases`. This proves the intended static named-import path
tree-shakes under the prototype toolchain.

The temporary clean-store `pnpm --offline --frozen-lockfile` experiment could
not complete because the current local pnpm 11 store lacks Vite's optional
platform-package metadata/tarballs. This is not a Lucide dependency failure:
the selected tarballs themselves have no dependencies, and the exact temporary
React/TypeScript/Vite build passed. M02 must nevertheless rerun the required
workspace offline frozen install after the real lockfile is generated; this
audit does not waive that gate.

## Approved M02 delta

M02 exclusively owns these changes:

1. Add `lucide: 1.33.0` and `lucide-react: 1.33.0` to the single
   `pnpm-workspace.yaml` catalog. These are the only version declarations;
   package manifests consume `catalog:` so a second Lucide version cannot
   drift in.
2. Add `"lucide-react": "catalog:"` to `apps/web/package.json`. React code
   imports static named components from `lucide-react`, such as
   `import { Box } from "lucide-react"`; it does not use `DynamicIcon`.
3. Add `"lucide": "catalog:"` to `packages/seq-viewer/package.json` and
   `packages/wrapper-nightingale/package.json`, the two packages that own
   native DOM controls. Native code uses static named imports such as
   `import { Box, createElement } from "lucide"` followed by
   `createElement(Box)`. It does not import `lucide` from the web package, pass
   React elements through wrapper contracts, call `createIcons`, or import
   `icons`.
4. Regenerate `pnpm-lock.yaml` once under Node 26.7.0 and pnpm 11.22.0 and
   preserve the two registry integrities above. Every importer must resolve to
   the same `lucide@1.33.0`; `lucide-react@1.33.0` must have React 19.2.8 as its
   only peer realization. There must be exactly one lockfile package snapshot
   for each Lucide package and no new runtime transitive snapshot.
5. Regenerate `DEPENDENCY_EVIDENCE.json`. Add readable inventory entries for
   both packages to `THIRD_PARTY_LICENSES.md`, recording ISC plus the retained
   Feather MIT notice. Extend `scripts/audit-p80-hardening.mjs` with the exact
   version/single-resolution assertions if its generic evidence checks do not
   already prove them. `scripts/audit-p01-dependencies.mjs` needs no Lucide
   allowlist change because its external allowlist is scoped to vendored
   Nightingale manifests.
6. Run production builds with the exact static imports and inspect the emitted
   chunks: selected icon paths must be present, while representative
   unselected icons (`Airplay`, `AlarmClock`) and all-icons/dynamic registries
   must be absent. Record chunk sizes as regression evidence rather than
   imposing the temporary spike's whole-app byte count as a budget.
7. Under the pinned mise toolchain, prove both ordinary and offline frozen
   installation. Acceptance requires `node --version` to report `v26.7.0`,
   `pnpm --version` to report `11.22.0`, the dependency/evidence audits to pass,
   and the offline install plus affected package/app builds to succeed without
   a registry request. The expected new runtime resolution count is exactly
   two, because each selected package has zero dependencies.

The pinned-runtime acceptance sequence is:

```sh
mise install --locked
mise exec -- node --version
mise exec -- pnpm --version
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm install --offline --frozen-lockfile
mise exec -- pnpm --filter @seq-star/seq-viewer build
mise exec -- pnpm --filter @seq-star/wrapper-nightingale build
mise exec -- pnpm --filter @seq-star/prototype-web build
mise run check:dependencies
mise run check:p80
```

## Nightingale same-commit inspection

The current vendor is commit
`a4a65eccbf03fe5290adb1ec171cb5a43e8a3d83` (tag `v5.10.3`), whose selected
packages carry version `5.6.0`. The source at that exact commit for
`packages/nightingale-manager/src/nightingale-manager.ts` was compared with
the published `@nightingale-elements/nightingale-manager@5.6.0` tarball:

| Artifact | SHA-256 |
| --- | --- |
| Manager tarball | `27ce148dbbcfd06a16a47d14c2f726b05e0a94b3e2beedf5f85bd65b5f0e3c0d` |
| Manager source from tarball | `6a12d840dc4f41172fb7537a563e14425966294852a22fd1aa729c6e28314306` |
| Manager source from pinned commit | `6a12d840dc4f41172fb7537a563e14425966294852a22fd1aa729c6e28314306` |

They are byte-identical. The tarball metadata declares ISC, but its retained
`LICENSE` is the Nightingale MIT notice, consistent with the existing vendor
license reconciliation.

The manager registers descendant elements and listens for bubbling `change`
events. It reflects `length`, `display-start`, `display-end`, and `highlight`
attributes to every registered element. Existing same-commit `withZoom`
already emits that `change` payload and clamps the zoom range; `WheelHelper`
already maps horizontal/Shift-wheel gestures to pan and regular/pinch gestures
to zoom. `nightingale-sequence` already renders letters once its per-base width
exceeds the measured glyph width. The present wrapper creates independent
elements and never coordinates their display range, so those upstream pieces
cannot currently provide the requested synchronized behavior.

The manager cannot provide the requested UI geometry. It neither owns the
wrapper's external labels nor creates a plot-only overview, has no fixed-header
layout, exposes no JSON-safe viewport descriptor, and has no staged-tree or
generation semantics. It would also require adding and adapting a new
vendored package solely to forward an event the wrapper already receives.

## M20 frozen approach

`packages/wrapper-nightingale` owns one `NightingaleViewportController` per
rendered coordinate-space group. It must:

- retain canonical inclusive biological `start`/`end` and total length;
- listen to native bubbling display-range changes, normalize/round/clamp once,
  then set the same `display-start` and `display-end` on every live element
  while suppressing its own reflected updates;
- drive the plot-only overview, handles, keyboard controls, wheel pan/zoom,
  and resize updates from that one canonical state;
- render labels in a fixed grid column outside the horizontally movable plot
  region; give the overview the plot-column width only;
- preserve the existing staged tree, generation, owner-isolated applied state,
  and idempotent disposal; and
- expose the existing/additive JSON-safe viewport descriptor only through the
  wrapper presentation boundary, never by exposing vendor state.

This approach uses the existing four local Nightingale workspace packages. The
current lockfile has only `link:` entries for them, and `mise run
check:dependencies` passes with “local Nightingale links only”. No registry
`@nightingale-elements/*` package is present.

## Future vendor ownership

No `UPSTREAM.md` or `PATCHES.md` change is required for the selected approach.
M20 owns wrapper-only implementation. If a later review reverses this decision
and vendors the manager, M20 must exclusively add the exact pinned-commit
source, package manifest, TypeScript workspace adaptation, its MIT notice and
the metadata/license discrepancy to `UPSTREAM.md`, and an append-only patch
entry in `PATCHES.md`; it must not install the registry package.

## Verification performed

```sh
# Exact registry metadata and tarball inspection (temporary directory)
pnpm view lucide-react@1.33.0 ...
pnpm view lucide@1.33.0 ...
npm pack lucide-react@1.33.0
npm pack lucide@1.33.0

# Exact tarball TypeScript/Vite probes
pnpm exec tsc --noEmit --strict --jsx react-jsx --module esnext \
  --moduleResolution bundler --target es2024 react-entry.tsx dom-entry.ts
pnpm exec vite build

# Existing vendor/local-resolution proof
mise run check:dependencies
```
