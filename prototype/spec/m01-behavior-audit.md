# M01A — current behavior and interaction-contract audit

Status: audit evidence for M01 reconciliation (no production change)

This note records the starting behavior of the reviewed C00–C50 checkpoint.
It is deliberately separate from the planned target behavior in
`ui-interaction-modernization-plan.md`; the contracts below are proposals for
the M01 freeze, not silently introduced implementation requirements.

## Evidence collected

### CDS host sizing

The standalone audit runner sampled `/#/cds-protein` for 5.25 seconds on the
current checked build. Repeated runs measured both viewer hosts rising from
312–314px to 942–944px; their Seq* roots/canvases and document scroll height
rose by the same **630px**. The rate is about 60px every 500ms. This reproduces
the reported growing page.

The cycle is structural:

1. `cds-protein.tsx` gives each host `min-h-72`, but no definite height.
2. `CanvasSeqViewer` sizes its root/canvas to `height: 100%` and then makes its
   spacer `max(viewer height, total rows)`.
3. Its target `ResizeObserver` sees the promoted content height and resizes the
   canvas/spacer again.

The browser did not emit a console error in this production-preview run; the
previous development audit's ResizeObserver-loop report is consistent with the
same self-sizing geometry. M10 must fix the definite host geometry, rather
than suppressing the observer warning.

### Seq* navigation in Renderer comparison

The navigation has a fixed 130px right reserve for controls in
`seq-viewer/src/index.ts`: the axis is positioned `right: 130px`, while the
control group contains four 17px buttons, a 39px Reset button, four 2px gaps,
and a 4px right inset (115px total). At narrow panel widths the usable overview
is consequently only the residual width after the 156px row header and the
130px reserve. `navigationAxisWidth()` falls back to `viewerWidth - 294`, but
the actual axis width is read later from layout. That mixed geometry is a risk
for the reported renderer-comparison crowding despite the nominal CSS reserve.
The standalone test measures the navigation root, axis, controls, and window at
1280, 768, 480, and 390px. It fails closed when a target is absent or a box is
non-finite, and it requires the reported overlap/overflow to be present at
390px. The checked run found the viewport window stuck at 393px while the axis
was respectively 250, 364, 76, and 0px, so it overflowed at all four widths.
M11 must invert those predicates. The replacement should be one grid/flex
layout with a measured controls column and `minmax(0, 1fr)` overview.

The M01 standalone test captures the three bounding boxes at a 390px viewport
as a regression diagnostic. It must be inverted by M11 to require: axis right
edge <= control left edge, window wholly inside axis, and non-negative usable
overview width at every supported panel width.

### Semantic feature hits

The native feature identity is already stable (`annotationId`, `itemId`, and,
for relationships, the hit endpoint role/index). Its payload geometry is not
semantic-item geometry today:

- Seq* `CanvasSeqViewer.hitLayer()` finds a loci item at the pointer and emits
  the complete matching locus. The checked Reference diagnostic proves that a
  pointer anywhere in `site-1` emits the full `[5,12)` interval, not the
  pointer column. A multi-locus item would still emit only its first matching
  locus, so the general semantic-item contract is not complete yet.
- The vendored Nightingale base element computes a mouseover event's
  `regions` from the pointer position (`hoverRegionFromPointer`), always a
  one-column `[n,n]` region.
- `NativeNightingaleDriver` intentionally forwards those raw regions for every
  hover whenever a feature identity is present. Its `lociForIdentity()` helper
  is used only for select, so a domain hover is still a single point.

For example, TP53 `dna-binding` is the complete half-open interval `[93,293)`,
but a Nightingale hover event carries one pointer region and maps as one point.
The existing P41 E2E test also asserts this current behavior
(`hoveredRegion.start === hoveredRegion.end`). This is the direct cause of the
Mol* feature-hover result being one residue rather than the full domain.

Relationship hits are intentionally different: Seq* already emits all
relationship endpoint loci while retaining the singular endpoint role/index
that was hit. Nightingale currently reduces a relationship identity to the
clicked endpoint's one locus in `lociForIdentity()`, so it needs the same
complete-relationship rule.

### Nightingale viewport and presentation

The wrapper creates a separate native element per layer and updates each
element's `width` in `resize()`. It has no shared display range, panning
manager, or wrapper-owned viewport descriptor. Rows are ordinary two-column
grids (`10rem minmax(0,1fr)`), labels are ordinary buttons, and there is no
scroll container with a sticky header column. Therefore horizontal scroll
cannot synchronize the tracks while holding labels fixed. The browser baseline
records root `overflow-x: visible`, content wider than the root, and every
header at computed `position: static`.

The complete `nightingale-sequence` residue string is assigned as `data`, but
at full P04637 scale each residue is narrower than the native glyph threshold,
so the element shows offsets/ruler information and no readable letters. This
is expected native behavior at the current scale, not a missing sequence
payload. M20 must reveal letters only when the shared viewport makes their
cells readable.

Current labels deliberately have `border-radius: 0.375rem`, 6px vertical
padding, and a 0.45rem root row gap. That is the non-compact, rounded baseline
to replace with compact square-corner controls and tighter track rhythm.

### Repeat selection and stale hover ownership

Seq* selection is not a toggle: on a second click of the same target,
`CanvasSeqViewer.setNativeSelection()` returns through `sameNativeTarget()`.
It emits no clear and leaves native selection rendered. Nightingale wrapper
leases have the same effect: a repeated native `select:set` reuses its lease
and publishes another set rather than a clear.

Hover leases in `harness-core/runtime.ts` are keyed by
`rule + sourceComponent + destination`. This preserves a single replacement
lease only for one directed edge. In a two-view rule, a Mol* hover A can leave
an externally applied Mol*-owned highlight on the sequence viewer. A later
sequence hover B creates a different sequence-to-Mol* lease; it does not retire
the incoming Mol*-to-sequence lease on the sequence source. This explains the
reported stale A plus current B visual union. Native Mol* clears still matter,
but cannot be the only retirement path for cross-renderer transfer.

The deterministic audit test instantiates the production `MolstarWrapper` and
`ApplicationHarness`, enters A -> B -> clear through the driver's real native
subscription, and records the resulting sequence commands. It proves one
stable Mol*-owned correlation/interaction lease, replace-only A/B state, clear,
preservation of an unrelated owner, and exactly three native messages despite
an imperative driver callback during apply. No test or React code publishes
`interaction.native` directly. M11 must retain this evidence and add the
cross-renderer pointer-transfer case.

## Proposed M01 contract freeze

### 1. Native semantic feature hit

No new data-model type is required. Freeze the existing `InteractionEvent`
shape with these semantic rules:

| Hit kind | `semanticTarget` | `loci` on `set` |
| --- | --- | --- |
| sequence/value column | absent | exactly the pointed coordinate locus |
| loci item (feature/domain/site) | `annotationId`, `itemId`, `trackId` | canonical, stable-order conversion of **all loci on that item** |
| relationship endpoint | `annotationId`, `itemId`, `trackId`, hit `endpointRole`, hit `locusIndex` | canonical, stable-order conversion of **all loci on all endpoints** |
| clear | same identity/lease as its set | `[]` |

Canonical order is annotation-item source order, then locus source order; no
deduplication across distinct loci. Coordinates remain exact half-open
intervals/points/boundaries. A wrapper may use pointer geometry to identify the
item, but must resolve the complete item before publishing. The harness maps
every emitted locus and reports partial/unmapped members as it does today.

`itemId` is the canonical relationship identity as well as the canonical loci
item identity. The freeze does not require or publish the redundant
`relationshipId` alias. The existing optional public field remains readable
for compatibility, but an implementation that elects to emit it later must
first add contract evidence that it is exactly equal to `itemId`.

### 2. Single native selection toggle

Define a native semantic fingerprint as document ID, view ID, origin track and
layer, semantic target fields, and ordered canonical loci. For `select`:

1. no active native fingerprint: publish `set` and render it;
2. same fingerprint: clear local native rendering and publish `clear` with the
   same interaction ID/owner lease;
3. different fingerprint: publish clear for the old lease before set for the
   new lease.

This is a wrapper/source policy only. Programmatic command modes (`add`,
`remove`, `toggle`) remain owner-scoped and unchanged. A reflected peer sees
exactly one matching clear and must not echo a native event.

### 3. Hover ownership

For each connected synchronization rule, hover is one global ephemeral lease,
not one lease per source/destination edge. On native hover set from any member:

1. abort pending mappings for the prior group lease;
2. clear every reflected application made by the prior group lease, including
   one resident on the new source viewer;
3. install one new owner `{ correlationId, sourceComponent }` and apply its
   mapped loci only to peers;
4. a clear retires that same lease; a stale clear from an older lease is ignored.

This preserves selections and unrelated synchronization groups. It is the
minimum contract that prevents Mol* A + sequence B from visually accumulating.

### 4. Track action presentation

Freeze an additive wrapper configuration descriptor, not a SeqViewSpec action:

```ts
type TrackPresentationAction = {
  readonly kind: "structure-profile" | "layer-inspection";
  readonly accessibleName: string;
  readonly tooltip: string;
  readonly icon: "box" | "layers";
};

type TrackPresentation = Readonly<{
  readonly trackId: string;
  readonly action?: TrackPresentationAction;
}>;

type SequenceWrapperPresentationConfig = Readonly<{
  readonly tracks?: readonly TrackPresentation[];
}>;
```

All fields are JSON-safe strings/arrays/objects; functions, React nodes, icon
components, callbacks, and inferred plugin state are forbidden. The
application-harness component descriptor exclusively owns this wrapper config.
The Reference and Nightingale wrappers validate it against the displayed
document: track IDs must be unique, absent IDs produce a deterministic
diagnostic, and unspecified tracks render no action. The wrapper owns DOM/icon
presentation only. A `structure-profile` action is icon-only with its declared
tooltip/accessibility text; `layer-inspection` is neutral. The ordinary
truncated label remains readable and separate.

Activating either the label or its action publishes the existing standard
`interaction.native` event with `interaction: "track-activate"`, `phase:
"set"`, origin document/view/section/track/layer identity, and `loci: []`.
There is no wrapper callback and no renderer-specific intent. The integration
plugin consumes that standard event, validates track identity in the active
generation, translates it into its domain intent/profile selection, and emits
the complete SeqViewSpec/MVS request. React page code supplies component config
and composes the panels only; it does not interpret track IDs or generate
visualization documents.

### 5. Renderer chooser presentation

Freeze a shared chooser-host-owned, JSON-safe descriptor:

```ts
type RendererChooser = {
  readonly caseId: string;
  readonly modes: readonly ("reference" | "nightingale" | "compare")[];
  readonly initialMode: "reference" | "nightingale" | "compare";
};
```

`compare` is permitted only for Renderer comparison. Protein, Complex,
Alignment, and CDS declare reference/nightingale only after their wrapper
capabilities are truthful. The shared `RendererChooserHost`, not each route,
owns the active mode and wrapper lifecycle. The page supplies the descriptor,
case component IDs, and layout only.

Switch ordering is frozen:

1. disable further mode changes and mark the transition pending;
2. publish/complete native hover and selection clears for the outgoing wrapper,
   retire reflected hover and selection owner leases, and clear its applied
   interaction owners;
3. await outgoing wrapper disposal and host cleanup;
4. mount/start the incoming wrapper, wait for ready/capabilities, and replay the
   same immutable visible SeqViewSpec request;
5. expose the new mode only after its rendered/degraded lifecycle; a failure
   keeps an explicit failed state and never reports the old wrapper as active.

Thus track/profile biological document state and typed intent semantics remain
stable, while ephemeral hover **and selection** intentionally clear at every
renderer switch. Interaction state is never replayed into the new wrapper.
Switching must not ask the integration plugin to regenerate the sequence
document or imply support for an unavailable renderer. The fixed-purpose P01
and Reference diagnostic routes are explicit exceptions with no chooser.

## Verification handoff

Run the un-wired baseline runner while the defects exist:

```sh
cd prototype
mise exec -- pnpm exec playwright test -c tests/m01-behavior/playwright.config.ts
mise exec -- pnpm exec vitest run -c tests/m01-behavior/vitest.config.ts
```

M10/M11/M20 should replace its baseline assertions with target tests in their
own packets; this directory remains audit evidence and is intentionally not
included in the root Playwright configuration.
