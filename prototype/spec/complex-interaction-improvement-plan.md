# Complex Interaction Improvement Implementation Plan

Status: implemented; C50 evidence complete, pending independent final review

This plan improves the 1BRS barnase–barstar case study, the reusable Seq\*
reference viewer, and the shared inspector. It uses the same reviewed packet
workflow as the initial prototype:

> Orchestrator → Implementer → Independent reviewer → Orchestrator/reconciler

No implementation packet may start until C00 is reviewed, reconciled, and
committed. The plan does not authorize a deployment or any runtime network
dependency.

The reviewed P01 feasibility gate is an explicit prerequisite, not work owned
by this plan. Commit `0102cc4` already completed P01a/P01b/P01c: it froze the
1BRS fixture mappings, verified the pinned Mol*/MVS APIs and browser loading,
and recorded the Nightingale feasibility evidence. Before C30 starts, the
orchestrator MUST verify that `0102cc4` is an ancestor of the working branch and
rerun the existing dependency and fixture audits. C41's P01 route change is
only a presentation/overflow correction to that retained feasibility page; it
does not replace or reopen the P01 stop/go gate.

## 1. Objectives

The completed work must provide:

- an initial neutral 1BRS structure as soon as the Complex page opens;
- visibly interactive native hover and selection in the reference viewer;
- exact bidirectional barnase/barstar residue synchronization with Mol\*;
- both endpoints highlighted when hovering a contact relationship;
- distinct, truthful MVS presentations for each Complex track profile;
- a visible, bounded navigation track for horizontal zoom and pan;
- the shared scrollable inspector used by the UniProt page;
- a useful `/reference-viewer` conformance surface for viewer events, local
  state, external commands, relationship identity, and navigation;
- bounded overflow for the P01 Mol\* interaction evidence.

The implementation must preserve offline operation, owner-scoped interaction
state, exact polymer/chain identity, deterministic MVS output, lifecycle
replacement semantics, and idempotent disposal.

## 2. Coordination rules

For every packet, the orchestrator gives the implementer the original request,
this plan, relevant component specifications, explicit owned paths, read-only
paths, acceptance criteria, and verification commands. The implementer stops
editing before review begins.

The independent reviewer reads the original requirements and actual diff,
runs focused adversarial probes, and does not edit. The orchestrator evaluates
every finding, assigns or applies narrow reconciliation, reruns the gates, and
creates a reviewed checkpoint commit.

Use `gpt-5.6-terra` for implementation and nontrivial reconciliation. Use
`gpt-5.6-luna` for bounded independent packet review. Use `gpt-5.6-terra` for
the final C50 integrated review.

Do not let agents edit shared files concurrently. The orchestrator retains
exclusive ownership of commits, root configuration, manifests, lockfile,
public export surfaces, generated route tree, and final reconciliation. Do not
add dependencies without a new concrete need and explicit approval.

All implementation remains under `prototype/`. Treat `legacy/` as read-only.
The legacy navigation renderer and interactions are design evidence only; do
not transplant the legacy data model, React surface, or mutable state system.

## 3. Frozen behavior decisions

### 3.1 Complex MVS profiles

The Complex integration plugin owns MVS generation. Track activation maps to
these profiles:

| Source action | Profile | Required presentation |
| --- | --- | --- |
| Page startup or `sequences` header | `neutral` | two chain-colored cartoons, no atomic detail |
| `polymer-regions` header | `regions` | two cartoons colored by declared processing regions, no atomic detail |
| `synthetic-confidence` header | `confidence` | two cartoons colored by the explicit synthetic score scale, no atomic detail |
| `interface` header | `interface` | two cartoons plus all unique interface residues in role-colored ball-and-stick |
| `contacts` header | `contacts` | two cartoons plus all unique contact endpoints in ball-and-stick, colored by each residue's minimum frozen contact distance |
| Specific contact click/select | `contact` | two cartoons plus exactly the selected pair in role-colored ball-and-stick and one union focus |

The `contact` profile requires a valid frozen relationship ID. Every other
profile rejects a relationship ID. Invalid combinations fail before building
or publishing an MVS document.

Hover is transient interaction state and must never replace the displayed MVS.

### 3.2 Relationship native events

When a relationship item is hit, `SeqViewerInteraction.loci` contains all loci
from every named endpoint. The semantic target retains:

- relationship annotation and item IDs;
- the endpoint role and locus index actually under the pointer, when known;
- stable document, view, section, track, and layer identity.

This lets the local viewer and synchronized destinations highlight the full
relationship without losing which endpoint was hit.

`semanticTarget.endpointRole` and `locusIndex` describe the singular endpoint
actually hit. They do not claim to label every locus in the event. The complete
role-to-loci association remains authoritative in the relationship annotation
and in the integration plugin's generated relationship summary. Browser tests
assert the hit role from the native event and all roles from the annotation or
generated summary as separate facts.

### 3.3 Native versus applied state

The reference viewer owns visible local native hover and selection state.
Native state is rendered immediately and published once through the wrapper.
It is not inserted into the externally applied owner maps and therefore does
not echo.

External highlight and selection remain owner-scoped. Clearing one native or
external owner must not clear unrelated state.

### 3.4 Multi-space synchronization

One interaction may contain loci from more than one source coordinate space.
The harness resolves a unique destination space and translator path per source
locus, maps compatible groups, and unions the mapped loci into one applied
command with one stable interaction owner.

Ambiguity and unmapped status are diagnosed per locus. A newest hover cancels
all mapping groups from the prior hover. Its clear retires the complete union.
Selection replace/add/remove/toggle semantics remain unchanged.

Complex translators use exact sequence-space IDs and exact chain-aware
structure patterns. Generic `{ kind: "sequence" }` patterns are not sufficient
for the two-polymer case.

### 3.5 Navigation track

Navigation is viewer chrome derived from the active view axis, not a new
SeqViewSpec data representation. The default reference viewer shows a compact
navigation band with:

- the complete multi-segment axis and explicit visual gaps;
- a viewport window corresponding to the current horizontal zoom and pan;
- a draggable window body for bounded pan;
- draggable left and right handles for zoom;
- discoverable wheel/trackpad pan and modifier-wheel zoom;
- keyboard-operable pan, zoom, and reset controls;
- gap-safe hit-testing and a minimum visible-column bound.

C11 owns an additive public viewport-event contract across `seq-viewer`,
`harness-core`, and the reference wrapper. A viewport event includes a
JSON-safe descriptor with flattened, gap-excluding `offsetStart`, `offsetEnd`,
and `totalColumns`, plus the visible biological interval for every intersected
axis segment (`segmentId`, `spaceId`, `start`, and `end`). This descriptor is
the observable authority for navigation tests; DOM pixels are secondary visual
evidence. It contains no renderer pixels, mutable objects, or native events.

The full view is the lower zoom bound. Pan is clamped so blank space cannot be
scrolled into view. Loading a replacement document resets or applies its
declared initial viewport. Navigation emits native viewport events but does not
emit residue hover/select events.

### 3.6 Generic inspector

The shared inspector must not require UniProt dataset topics. Dataset catalog
and switch status are optional summary sections. For every page it still shows:

- wrapper-confirmed current SeqViewSpec and MVS documents;
- pending and visible request/lifecycle identity;
- validation, copy, and download actions;
- bounded, redacted chronological harness messages;
- an optional generated-presentation summary.

Generated MVS evidence binds to a targeted request by exact request ID, source,
correlation, and causation. If dataset catalog messages exist, their additional
document/view checks remain enforced. Complex summaries expose profile,
relationship ID, endpoint roles, selector counts, and synthetic-data labeling.

The panel retains its 36rem maximum height and internal scrolling.

## 4. Packet sequence

```text
C00 plan checkpoint + verified reviewed P01 prerequisite
  ├── C10 reference-viewer native interaction foundation ─┐
  ├── C20 multi-space harness synchronization ─────────────┴─→ C11 navigation track ─┐
  └── C40 generic inspector foundation ──────────────────────────────────────────────┤
                                                                                     ↓
                                                                    C30 Complex plugin/profiles
                                                                                     ↓
                                                                    C41 page integration + P01
                                                                                     ↓
                                                                    C50 hardening/final review
```

C10, C20, and C40 may be implemented in parallel only with disjoint ownership.
C11 starts after both C10 and C20 because it owns the viewer plus an additive
harness/wrapper viewport contract. C30 starts after C11 is reviewed and the
reviewed P01 ancestry/fixture/dependency prerequisite has been reverified. C41
starts after C30 and C40 are reviewed and committed.

## 5. C00 — plan checkpoint

### Objective

Freeze responsibilities, interaction semantics, profile behavior, packet
ownership, and verification before implementation.

### Owned paths

- `prototype/spec/complex-interaction-improvement-plan.md`

All production, fixture, test, manifest, and configuration paths are read-only.

### Acceptance

- every requested symptom maps to an implementation packet;
- native state, applied state, relationship loci, and multi-space routing have
  unambiguous ownership;
- every Complex track action has a distinct profile;
- no new dependency or fixture is required;
- implementer/reviewer sequencing and shared-path exclusions are explicit.
- `git merge-base --is-ancestor 0102cc4 HEAD` succeeds and the existing fixture
  and dependency audits still pass.

### Verification

```sh
git diff --check
git merge-base --is-ancestor 0102cc4 HEAD
mise exec -- pnpm run check:fixtures
mise exec -- pnpm run check:dependencies
```

## 6. C10 — reference-viewer native interaction foundation

### Objective

Make the standalone reference viewer visibly interactive and make relationship
hits preserve every endpoint.

### Implementer model

`gpt-5.6-terra`, medium reasoning.

### Owned paths

- `prototype/packages/seq-viewer/src/**`
- package-owned focused tests under `prototype/packages/seq-viewer/**`
- focused standalone viewer fixtures under `prototype/tests/p20-seq-viewer/**`

Wrapper production code, harness core, integration plugins, app routes,
manifests, lockfile, and specs are read-only.

### Required behavior

- render native hover locally across the complete track height;
- render native selection locally with deterministic replace semantics;
- clear native hover on gaps, pointer leave, replacement, and disposal;
- keep native and externally applied owner state independent;
- return all endpoint loci for a relationship hit while retaining hit endpoint
  metadata;
- render all endpoint columns for native relationship hover/selection;
- publish exactly one native set/clear lease without echo;
- preserve stable IDs after vertical scrolling and resize.

### Acceptance

- residue hover is visibly present before any harness reflection returns;
- A→B hover replaces A without leaving a stale column;
- a relationship hover marks both polymers and publishes both loci;
- unrelated external highlight/selection owners survive native clear;
- applied commands remain silent;
- replacement and repeated disposal release native state and listeners.

### Verification

```sh
mise exec -- pnpm --filter @seq-star/seq-viewer build
mise exec -- pnpm exec vitest run packages/seq-viewer
mise exec -- pnpm exec playwright test --config tests/p20-seq-viewer/playwright.config.ts
mise run check
mise run test
git diff --check
```

## 7. C11 — reference-viewer navigation track

### Objective

Add discoverable, bounded horizontal navigation using selected rendering and
interaction ideas from the read-only legacy implementation.

### Implementer model

`gpt-5.6-terra`, medium reasoning.

### Owned paths

- `prototype/packages/seq-viewer/src/**`
- `prototype/packages/harness-core/src/index.ts`
- focused additive contract tests in `prototype/packages/harness-core/src/**`
- `prototype/packages/wrapper-seq-viewer/src/index.ts`
- focused reference-wrapper contract tests
- package-owned navigation tests
- `prototype/tests/p20-seq-viewer/**`

C10 and C20 are read-only except for necessary reconciliation within this
packet. Integration plugins, app routes, unrelated wrappers, manifests, and
lockfile are read-only. The only approved public change is the additive,
JSON-safe viewport descriptor described in section 3.5 and its TypeBox schema.

### Required behavior

- render the complete axis, segment labels/gaps, and current viewport window;
- drag the viewport body to pan and handles to zoom;
- clamp both ends and enforce the minimum visible-column count;
- provide keyboard pan/zoom/reset and accessible labels;
- make wheel and trackpad behavior discoverable and deterministic;
- keep residue hit-testing exact after navigation;
- publish the exact serializable viewport descriptor on every completed or
  programmatic viewport change;
- reset navigation and listeners on replacement/disposal.

### Acceptance

- after zooming, users can pan to both ends without blank overscroll;
- the viewport window and main canvas remain synchronized;
- multi-segment gaps never yield biological positions;
- every emitted descriptor matches the visible flattened offsets and exact
  per-segment biological intervals;
- mouse, trackpad, keyboard, resize, remount, and repeated disposal pass;
- no legacy runtime code or public data model is copied.

### Verification

```sh
mise exec -- pnpm --filter @seq-star/seq-viewer build
mise exec -- pnpm --filter @seq-star/harness-core build
mise exec -- pnpm --filter @seq-star/wrapper-seq-viewer build
mise exec -- pnpm exec vitest run packages/seq-viewer
mise exec -- pnpm exec playwright test --config tests/p20-seq-viewer/playwright.config.ts
mise run check
mise run test
git diff --check
```

## 8. C20 — multi-space harness synchronization

### Objective

Allow one native interaction to map exact loci into multiple coordinate spaces
owned by the same destination component.

### Implementer model

`gpt-5.6-terra`, high reasoning.

### Owned paths

- `prototype/packages/harness-core/src/runtime.ts`
- `prototype/packages/harness-core/src/runtime.test.ts`

All viewer, wrapper, plugin, app, configuration, manifest, lockfile, and public
schema paths are read-only. A public contract change requires orchestrator
approval and a revised packet.

### Required behavior

- resolve candidate destination spaces independently per source locus;
- group loci by unique destination/path without losing source association;
- execute groups under one cancellation scope and stable interaction lease;
- union successful results into one apply command;
- diagnose partial, unmapped, and ambiguous loci deterministically;
- newest hover cancels every prior group and clear retires the union;
- observer failures and translator timeouts retain existing guarantees.

### Acceptance

- barnase+barstar loci map to chain A+chain D in one destination component;
- ambiguity in one locus cannot silently select a chain;
- a partial mapping preserves mapped loci and reports the rest;
- rapid relationship A→B→clear leaves no stale target state;
- unrelated owners and selection modes are preserved;
- disposal aborts all grouped work and publishes nothing late.

### Verification

```sh
mise exec -- pnpm --filter @seq-star/harness-core build
mise exec -- pnpm exec vitest run packages/harness-core/src/runtime.test.ts
mise run check
mise run test
git diff --check
```

## 9. C30 — Complex initial view, exact translators, and MVS profiles

### Objective

Make the Complex plugin publish an initial structure, use exact bidirectional
mapping, and generate distinct deterministic presentations for every track.

### Implementer model

`gpt-5.6-terra`, high reasoning.

### Owned paths

- `prototype/packages/integration-plugins/src/complex.ts`
- `prototype/packages/integration-plugins/src/complex.test.ts`
- new Complex-only internal helper tests if required

The shared MVS presentation helper is read-only. Viewer, wrapper, harness, app,
fixtures, public index, manifests, lockfile, and configuration are read-only.

### Required behavior

- publish the initial SeqViewSpec followed by a neutral MVS request;
- bind lifecycle and generated evidence to exact request envelopes;
- use exact barnase/barstar sequence IDs and exact chain-aware structure
  patterns in both translator directions;
- implement the six frozen profiles from section 3.1;
- make every track-header activation choose its declared profile;
- make specific contact selection choose the exact contact profile;
- map contact hover/select endpoints without conflating display order and role;
- keep hover transient and MVS replacement latest-wins;
- preserve explicit synthetic provenance and frozen fixture identities.

### Acceptance

- startup MVS contains exactly two cartoons and no atomic detail;
- `neutral` has exactly two chain components/two cartoons, the declared barnase
  and barstar base colors, zero selector recolors, zero ball-and-stick, and zero
  focus nodes;
- `regions` has exactly two cartoons, zero ball-and-stick/focus, and recolors
  every observed residue belonging to the frozen P00648/P11540 processing
  regions while leaving unmapped precursor residues out with diagnostics;
- `confidence` has exactly two cartoons, zero ball-and-stick/focus, and exactly
  one evaluated color for each of the 195 observed structure selectors derived
  from `synthetic-confidence.tsv`; the four unobserved rows remain reported and
  absent from selectors;
- `interface` recolors the same 19 barnase and 16 barstar selectors on their
  cartoons and creates exactly two bounded ball-and-stick unions (one per
  polymer role), never one representation per residue, with zero focus nodes;
- `contacts` accounts for all 43 frozen relationships, uses the 19/16 unique
  endpoint selectors, assigns each selector the deterministic color for its
  minimum frozen contact distance, and creates exactly two bounded
  ball-and-stick unions with zero focus nodes;
- `contact` has two cartoons, exactly two role-colored selector recolors,
  exactly two one-residue ball-and-stick unions, and exactly one union focus
  containing the selected barnase and barstar selectors;
- every profile passes pinned `MVSData.validationIssues(..., { noExtra: true })`,
  is deterministic under reordered fixture rows, and has a distinct request ID
  and structural tree invariant;
- invalid profile/relationship combinations fail before publication;
- forward and reverse exact mapping works for both chains without ambiguity;
- failure, supersession, rapid activation, and disposal cannot surface stale
  MVS or interaction state.

### Verification

```sh
mise exec -- pnpm --filter @seq-star/integration-plugins build
mise exec -- pnpm exec vitest run packages/integration-plugins/src/complex.test.ts
mise run check
mise run test
mise run build
git diff --check
```

## 10. C40 — generic inspector foundation

### Objective

Generalize the UniProt inspector so case pages without dataset catalog topics
can use the same lifecycle-safe document and message inspection surface.

### Implementer model

`gpt-5.6-terra`, medium reasoning.

### Owned paths

- `prototype/apps/web/src/inspect-panel.tsx`
- `prototype/apps/web/src/inspect-panel-state.ts`
- `prototype/apps/web/src/inspect-panel-state.test.ts`

Case routes, plugins, viewers, wrappers, configuration, route tree, manifests,
and lockfile are read-only.

### Required behavior

- render a truthful generic summary when no dataset catalog exists;
- preserve current UniProt dataset behavior unchanged;
- bind generated evidence to requests by exact envelope identity;
- accept optional generic profile/relationship/endpoint summary fields;
- expose only lifecycle-confirmed visible documents;
- retain validation identity, stale-result rejection, redaction, bounded rows,
  copy/download, 36rem maximum height, and internal scrolling.

### Acceptance

- Complex SeqViewSpec and startup MVS become inspectable without fake dataset
  messages;
- generated Complex profile summaries follow only the matching visible MVS;
- stale, failed, superseded, forged, and reused request IDs cannot replace the
  visible inspector document;
- UniProt switching and its existing adversarial reducer suite still pass;
- invalid documents cannot be copied or downloaded.

### Verification

```sh
mise exec -- pnpm exec vitest run apps/web/src/inspect-panel-state.test.ts
mise exec -- pnpm --filter @seq-star/prototype-web build
mise run check
mise run test
git diff --check
```

## 11. C41 — Complex page, reference diagnostic, and P01 integration

### Objective

Expose the completed behavior in the real pages without putting translation or
interaction glue into React.

### Implementer model

`gpt-5.6-terra`, medium reasoning.

### Owned paths

- `prototype/apps/web/src/routes/complex.tsx`
- `prototype/apps/web/src/routes/reference-viewer.tsx`
- `prototype/apps/web/src/routes/p01-feasibility.tsx`
- `prototype/tests/e2e/complex.spec.ts`
- `prototype/tests/e2e/reference-viewer.spec.ts`
- focused P01 route tests when needed

Plugin, viewer, wrapper, harness, inspector implementation, fixtures, route
tree, configuration, manifests, lockfile, and public contracts are read-only.

### Required behavior

- Complex composes the two wrappers, plugin, hosts, and shared inspector only;
- a neutral 1BRS structure reaches rendered/degraded lifecycle on startup;
- native residue hover is visible locally and reflected to the correct chain;
- Mol\* native residue hover reflects to the exact barnase/barstar column;
- contact hover visibly marks both sequence endpoints and both structure loci;
- each track header exposes its distinct MVS profile;
- the navigation band can zoom and pan the multi-segment axis;
- `/reference-viewer` displays local hover/selection, relationship semantic
  target/loci, external owner commands/clears, and navigation events;
- P01 interaction evidence is a bounded, scrollable, wrapping block.

React code must not construct MVS, translate loci, publish synthetic native
events, or synchronize viewers directly.

The retained `/p01-feasibility` route is an explicit feasibility-spike
exception: it may continue to call the already-reviewed P01 imperative proof
helpers and display their native stream evidence. C41 may change only the
evidence container's layout/overflow and its focused regression. Production
Complex and reference-viewer pages receive no such exception.

### Acceptance

- the Complex page opens with both canvases and both inspector documents;
- actual sequence-canvas pointer movement proves local A→B→clear replacement;
- actual contact hit proves two endpoint loci and both highlighted columns;
- deterministic production-wrapper native Mol\* events prove both reverse
  chain mappings, clear, no echo, and no stale column;
- header activation proves neutral/regions/confidence/interface/contacts are
  structurally distinct and lifecycle-bound;
- specific contact activation preserves relationship ID, endpoint roles, two
  details, and union focus;
- navigation drag/wheel/keyboard is bounded and gap-safe;
- P01 long interaction text cannot expand the evidence card;
- all browser requests remain loopback/data only.

### Verification

```sh
mise exec -- pnpm --filter @seq-star/prototype-web build
mise exec -- pnpm exec playwright test tests/e2e/complex.spec.ts tests/e2e/reference-viewer.spec.ts
mise exec -- pnpm exec playwright test tests/e2e/p01-feasibility.spec.ts
mise run check
mise run test
mise run build
git diff --check
```

## 12. C50 — integrated hardening and final independent review

### Objective

Verify the result as one offline product and close traceability for every
reported Complex/reference-viewer defect.

### Implementer model

`gpt-5.6-terra`, medium reasoning for hardening. Final independent reviewer:
`gpt-5.6-terra`, high reasoning.

### Owned paths

- aggregate tests under `prototype/tests/**`
- `prototype/TRACEABILITY.md`
- this plan's status line

Production reconciliation is assigned narrowly after review. Root
configuration, manifests, lockfile, fixtures, vendor trees, and dependency
evidence remain orchestrator-owned.

### Required audit

- startup structure and exact current-document inspector identity;
- all six deterministic MVS profiles and selector/color counts;
- local native hover/selection and applied-owner isolation;
- bidirectional barnase/barstar mapping and reverse clear;
- relationship all-endpoint identity and transient two-sided hover;
- multi-space cancellation, partial/ambiguous diagnostics, and no echo;
- navigation bounds, gap behavior, accessibility, resize, replacement, and
  disposal;
- repeated route navigation with stable subscription/message counts;
- P01 evidence overflow at narrow and wide layouts;
- offline request audit, dependency boundary, one Mol\* version, fixture
  integrity, generated evidence, and license checks.

### Final verification

```sh
mise install --locked
mise exec -- pnpm install --offline --frozen-lockfile
mise run check:p80
mise run check
mise run test
mise run build
mise run test:e2e
mise exec -- pnpm list molstar --recursive --depth Infinity
mise exec -- pnpm why molstar --recursive
git diff --check
git status --short
```

The final reviewer reads the original request, this plan, component
specifications, actual cumulative diff, and test evidence. The orchestrator
reconciles every blocking/high finding and reruns the complete final
verification before creating the reviewed checkpoint commit.
