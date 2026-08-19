# Local Nightingale patches

This log is append-only for behavior-affecting changes to the vendored source.
The source files selected for P01a are otherwise byte-for-byte copies of
upstream commit `a4a65eccbf03fe5290adb1ec171cb5a43e8a3d83`.

## P01a workspace adaptation

Affected files: the four selected `package.json` files, their `tsconfig.json`
files, and the shared `tsconfig.json` in this directory.

- Replaced upstream Rollup/Lerna package build commands with direct TypeScript
  compilation. This keeps the source ordinary and editable without importing
  upstream's Yarn/Lerna publishing toolchain into the prototype.
- Changed selected-package dependencies from semver ranges to `workspace:*`.
  This is a resolution safeguard: pnpm must fail instead of fetching a registry
  `@nightingale-elements/*` package.
- Pinned all external dependencies exactly for prototype reproducibility.
- Adjusted `lodash-es` from upstream `4.17.15` to `4.17.21`. The selected track
  source uses only `clamp`; `4.17.21` preserves that API while using the current
  compatible patched release rather than reintroducing the old vulnerable
  transitive surface.
- Added package `exports` maps for explicit public entry points.
- Disabled declaration emission for the vendor build and added narrow public
  declarations for the three leaf renderer packages under `types/`. TypeScript
  6 rejects upstream's inferred mixin class declarations as non-portable
  (`TS2883`); the compatibility declarations describe the unchanged public
  data and element surfaces used by the spike while `tsc` emits the ESM runtime
  from ordinary source. This avoids introducing the upstream Rollup/TS 5
  publishing pipeline solely to reproduce generated declarations. The core
  package retains its editable source types for vendor-internal compilation.

No Nightingale runtime behavior is changed in P01a.

## P01a TypeScript 6 module-resolution compatibility

Affected file:
`nightingale-new-core/src/decorators/customElementOnce.ts`.

- Changed the type-only `CustomElementDecorator` import from the undeclared
  `lit/decorators` directory path to Lit's supported `lit/decorators.js` export,
  alongside the existing runtime import. This has no runtime behavior change;
  it allows TypeScript 6 `moduleResolution: "Bundler"` to honor Lit's exports
  map instead of relying on legacy directory resolution.

## Feasibility findings reserved for P30

These are not patches yet. They are concrete seams that require a reviewed
generic solution before production wrapper behavior is implemented:

- **Stable identities:** feature data retain `accession`, but the track creates
  unscoped DOM IDs as `g_${accession}`. A stable externally supplied track ID
  and collision-safe feature/item identity surface are needed.
- **External hover and selection:** the `fixedHighlight` setter immediately
  renders and clears an imperative interval, while click events expose
  `selectedId`. Directly changing `highlight` decodes the region but does not
  call `updateHighlight` until a later refresh. There is no separate owner-aware
  imperative selection API or clear operation.
- **Readiness:** Lit's `updateComplete` reports template completion, not a
  generation-tagged usable D3 frame. The wrapper needs a generic post-render
  signal carrying the request generation.
- **Lifecycle:** resize observation and manager registration are cleaned up,
  but the sequence component adds an anonymous `load` listener on every
  connection and the zoom mixin does not dispose its wheel helper/D3 bindings
  or cancel a queued animation frame on disconnect.
- **Native events:** feature/sequence tracks publish bubbling `change` events;
  the line graph uses a similar but differently cased `eventtype` detail. A
  generic normalized vendored notification is preferable to library-specific
  branching in the wrapper.
