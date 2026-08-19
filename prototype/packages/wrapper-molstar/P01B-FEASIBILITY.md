# P01b Mol* + MolViewSpec feasibility record

## Decision

- Pin `molstar` exactly at `5.11.0` (npm integrity
  `sha512-Jv2oHkKoCpzrhqLmGlknepm0pfRsoTDebsGRkvXpbUFb6p+JIAkhLyM3uqV2twC6VR83ZbXtdswOtouPhozpuQ==`, package shasum
  `591a8bdac7eac9851dffb49e5a9e0764a4f1acd6`).
- The package declares Node `>=22.0.0`; the spike uses the workspace's pinned
  Node `26.7.0`, TypeScript `6.0.3`, Vite `8.2.1`, React `19.2.8`, and React DOM
  `19.2.8`.
- Do not install a separate MolViewSpec package. All rows below resolve from
  `molstar@5.11.0`.

## Verified API matrix

| Need | Supported module and symbol | Executable use in this spike |
| --- | --- | --- |
| MVS builder | `molstar/lib/extensions/mvs/index.js`: `MVSData.createBuilder()` | `src/p01b/mvs.ts` |
| MVS types | `molstar/lib/extensions/mvs/mvs-data.js`: `MVSData` | `src/p01b/mvs.ts` |
| validation | `molstar/lib/extensions/mvs/index.js`: `MVSData.validationIssues()` | `validateMvs()` |
| serialization | same module: `MVSData.toMVSJ()` | `loadSyntheticPeptide()` |
| MVS loading | `molstar/lib/apps/viewer/app.js`: `Viewer.loadMvsData()`; lower-level alternative `molstar/lib/extensions/mvs/load.js`: `loadMVS()` | `loadSyntheticPeptide()` |
| viewer creation | `molstar/lib/apps/viewer/app.js`: `Viewer.create()` | `createMolstarSpikeViewer()` |
| native hover | `Viewer.plugin.behaviors.interaction.hover` | spike-only observation; P01 makes no canvas-hover proof |
| native selection | `Viewer.plugin.managers.structure.selection.events.loci.{add,remove,clear}` | spike-only observation; P01 does not claim canvas-click proof |
| locus creation | `StructureElement.Loci.fromSchema()` in `molstar/lib/mol-model/structure.js` | spike-only helper used to verify imperative commands |
| residue extraction | `StructureElement.Loci.forEachLocation()`, `Unit.isAtomic()`, and `StructureProperties` in the same module | `extractResidues()` |
| external highlight/select/focus | `Viewer.structureInteractivity()` from `molstar/lib/apps/viewer/app.js`; accepts `StructureElement.Schema` and actions `highlight`, `select`, `focus` | spike highlight and selection helpers |
| clear highlight/select | the same API with no `elements` or `expression` | spike clear helpers |
| first frame | `Viewer.plugin.canvas3d.didDraw`, `reprCount`, and `requestDraw()` from `molstar/lib/mol-canvas3d/canvas3d.js` | spike-only readiness probe; resolves on a real post-load draw with a nonzero representation count |
| resize | `Viewer.handleResize()`; lower-level `PluginContext.handleResize()` | retained for P40 |
| disposal | `Viewer.dispose()` -> idempotent `PluginContext.dispose()` | browser spike calls disposal twice on `pagehide` |

The checked-in structure is a non-biological two-residue PDB at
`tests/p01b-molstar/synthetic-peptide.pdb`; the source helper also embeds the
same data as its standalone default. The browser proof serves the PDB from its
loopback Vite origin and aborts on non-loopback network use.

## Vite and browser integration

- Import `Viewer` directly from `molstar/lib/apps/viewer/app.js`. Do not import
  `molstar/lib/apps/viewer/index.js`, because that entry imports SCSS and would
  require adding Sass.
- Import the precompiled, self-contained stylesheet once in the web app from
  `molstar/build/viewer/molstar.css`. It contains its logo as a data URL and no
  external font or image request.
- No worker, WASM, or font is required by this viewer/MVS path. The eager Viewer
  extension registry causes Vite to emit Mol*'s bundled JPEG backgrounds even
  though the spike enables only MVS; Vite fingerprints and serves them from the
  built origin, so no manual asset copy or asset plugin is required.
- The browser host must have nonzero width and height and `position: relative`.
- The verified production build emits about 5.03 MB minified JavaScript (1.43 MB
  gzip), 69 kB CSS, and 520 kB of local JPEG assets. It also warns that the eager
  optional MP4 extension references Node built-ins, although the required MVS
  path neither executes that extension nor makes a remote request. P40 should
  evaluate a minimal PluginUI spec or route-level chunk; a library bundler is
  not needed for the gate.

After the orchestrator owns the lockfile and installs the manifest change, run:

```text
pnpm install --frozen-lockfile
pnpm exec tsc -b packages/wrapper-molstar --force
pnpm exec vite build tests/p01b-molstar --outDir dist-p01b
pnpm exec playwright test --config tests/p01b-molstar/playwright.config.ts
pnpm list molstar --recursive --depth Infinity
pnpm why molstar --recursive
```

The two dependency commands must report exactly `molstar@5.11.0`; `pnpm list`
must not report any separate MVS implementation.

## P40 implications and remaining risks

- P01 verifies local MVS loading, a post-load frame, real-structure locus
  conversion, and interaction-stream/locus-normalization wiring. It does **not**
  claim a real canvas hover or click proof. Real canvas interaction verification
  is deferred to P40/P80 by explicit scope decision.

- `Viewer.structureInteractivity()` clears all Mol*-managed marks for the named
  action. It does not implement owner-scoped interaction state. P40 must retain
  per-owner schemas/loci and recompute the union when one owner is replaced or
  cleared.
- `StructureElement.Schema` supports label/auth chain and residue numbering,
  entity IDs, insertion codes, operators, instances, and ranges. P40 must match
  the active structure/model identity before applying a schema; a residue number
  alone is not safe.
- Hover can yield non-element loci (bonds, shapes, volumes) and coarse elements.
  The spike intentionally returns no residue identities for unsupported loci;
  P40 must publish an explicit unsupported/unmapped diagnostic.
- `Viewer.plugin.*`, Canvas3D `didDraw`, `selectQ`, behavior subjects, and
  manager event streams are implementation-facing Mol* surfaces. They are
  suitable only for this pinned P01 spike and are not a P40 public contract.
  P40 cannot freeze them without separate upstream/public-API validation.
- The MVS load promise is not treated as first-frame readiness. The verified
  readiness recipe requests and observes a subsequent canvas draw with at least
  one representation and must be generation-tagged for latest-request wins.
- The package ships many server-side modules and optional native peers, but the
  direct browser imports above keep those out of the Vite graph. The lockfile
  reviewer should nevertheless inspect optional peers and license inventory.
