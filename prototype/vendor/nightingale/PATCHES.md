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

## P30 generic embedding surface

Affected files:
`nightingale-new-core/src/nightingale-base-element.ts`,
`nightingale-new-core/src/utils/bindEvents.ts`,
`nightingale-new-core/src/mixins/withResizable/index.ts`,
`nightingale-new-core/src/mixins/withZoom/index.ts`,
`nightingale-sequence/src/nightingale-sequence.ts`,
`nightingale-track/src/nightingale-track.ts`,
`nightingale-linegraph-track/src/nightingale-linegraph-track.ts`, and the three
leaf packages' narrow public declarations under `types/`.

- Added stable embedding-supplied track, layer, generation, and feature IDs.
  DOM IDs use a collision-free Unicode code-point encoding and include the
  feature occurrence, so repeated item IDs cannot collide while the normalized
  event retains the stable external item identity.
- Added one bubbling `nightingale-interaction` event that normalizes native
  hover, selection, clear, and track activation across the selected renderers.
  Pointer hover reports the current sequence residue when the renderer exposes
  its zoom coordinate conversion, rather than expanding to the hovered
  feature's complete interval; datum-derived regions remain the fallback.
  Feature/sequence clicks derive regions from the actual D3 datum even when
  click highlighting is disabled; linegraph clicks now expose their computed
  sequence position independently of hover/highlight configuration. An
  unresolved click is not emitted as an empty selection.
  A public emitter provides the same event path for deterministic embedding
  tests and keyboard or host-driven integrations.
- Added owner-keyed imperative `highlight` and `selection` state. Both families
  retain every region independently, clear only the requested owner, and render
  with distinct overlays without mutating Nightingale's existing highlight
  state.
- Added generation-tagged `waitForSeqstarFirstRender`. Leaf renderers signal it
  only after their actual D3 sequence/feature/chart frame has been constructed;
  superseded waits are abortable.
- Made disconnect cleanup complete for the sequence load listener, resize
  observation, wheel/D3 zoom bindings, and queued animation frames. Reconnect
  installs one native event bridge and disposal remains idempotent.

These APIs are generic visualizer embedding seams. They contain no SeqViewSpec,
harness, application, or TP53-specific behavior.
