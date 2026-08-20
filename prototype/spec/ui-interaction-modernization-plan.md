# Mol* Harness UI and Interaction Modernization Plan

Status: proposed implementation plan

This plan covers the interaction, renderer, alignment-ensemble, naming, and
visual-design improvements requested after the reviewed Complex interaction
round. It keeps the existing architecture intact:

- SeqViewSpec describes display state, not application actions;
- Seq* owns sequence/alignment models, coordinates, and the reference viewer;
- wrappers own native renderer lifecycle and native/applied interaction state;
- the harness owns messages, routing, synchronization, and typed intents;
- integration plugins own biological translation and complete SeqViewSpec/MVS
  generation;
- React routes own composition, presentation choices, and layout only.

The user-facing product name becomes **Mol* Harness Prototype**. `Seq*` remains
the name of the sequence/alignment subsystem and reference renderer.

## 1. Reported outcomes

The completed round must deliver all of the following:

1. Hovering any point inside a semantic range/domain/feature highlights the
   complete annotation item in the sequence renderer and every mapped residue
   of that item in Mol*.
2. A Mol* hover cannot remain stale when the pointer moves to a sequence
   renderer; a subsequent sequence hover must replace, not union with, the old
   structure hover.
3. Clicking the same selection twice in either sequence renderer toggles that
   selection off and clears the synchronized peer without disturbing other
   owners.
4. Nightingale has one synchronized horizontal viewport, fixed visible row
   headers, compact square-corner controls, aligned tracks, and sequence letters
   when zoomed to a readable scale.
5. Visualization cards have one outer boundary only. Embedded sequence and Mol*
   hosts do not add redundant borders, padding, or rounded frames.
6. The Seq* navigation band never runs under or beyond its controls, including
   the narrower Renderer comparison panel.
7. The CDS/protein case renders immediately at a stable bounded height and does
   not enter a ResizeObserver/layout feedback loop.
8. Alignment annotations produce distinct structure presentations; member
   activation selects its associated structure; Show all displays the frozen
   structural ensemble in one superposed view.
9. Every case-study sequence surface can choose the Seq* reference renderer or
   Nightingale. Renderer comparison additionally offers Compare mode.
10. The application uses a compact light glass visual system, Lucide icons,
    sticky navigation, clear active-route state, human-facing names, and the new
    product name.

## 2. Terminology and interaction policy

### 2.1 Feature

User-facing copy may say feature, region, domain, site, or annotation. The
runtime contract is a **semantic annotation item** with one or more loci. If a
pointer hits any position covered by one item, the native event carries that
item's stable identity and its complete loci, not merely the pointer column.

### 2.2 Hover

Hover is ephemeral and replace-only. Each source/destination synchronization
edge has one active hover lease. A new hover replaces the prior lease union;
clear retires it. Native and externally applied hover state may not accumulate
visually after the pointer transfers between viewers. Selection remains a
separate family.

### 2.3 Selection toggle

The default native selection policy is single replaceable selection:

- first click: set/replace;
- click a different item: clear old, then set new;
- click the identical semantic target/loci again: clear it;
- programmatic add/remove/toggle modes remain owner-scoped and supported.

Reference and Nightingale wrappers must publish matching set/clear leases so the
peer toggles exactly once without echo.

### 2.4 Track action affordance

Track labels remain readable and truncated. A separate compact icon-only action
button is used when the host configuration declares that track activation has a
3D consumer. The default icon is Lucide `Box`/`Cuboid`; it has a tooltip and an
accessible name such as `Show Conservation in 3D`. Generic views without a 3D
consumer use a neutral `Layers` action or no action rather than falsely implying
that a structure will open.

### 2.5 Nightingale degradation

`wrapper.nightingale.fallback.bars-heatmap` is an honest representation fallback,
not a load failure. Renderer comparison requests value-colored bars. The
selected Nightingale linegraph can draw one fixed line color but cannot preserve
one color per residue, so the declared heatmap fallback renders the same values
with the same continuous color encoding. Normal UI must say, for example,
`Variant density shown as heatmap; Nightingale cannot preserve value-colored bars`.
The technical diagnostic code remains available in the inspector.

### 2.6 Planning-audit observations

The pre-plan browser audit confirmed these are current implementation defects,
not styling assumptions:

- on CDS, both hosts had already grown beyond 9,700px and continued growing by
  about 64px every 500ms; the dev server reported a continuous ResizeObserver
  notification loop;
- the CDS route gives each host only `min-height` while the embedded Seq* root
  and spacer size themselves from `height:100%`, forming the feedback cycle;
- the alignment fixture currently exposes one structure (1A3N chain A), so a
  truthful Show all ensemble requires new checked structures and transforms;
- the Nightingale wrapper currently rejects the alignment representation and
  creates independent native track elements without a shared manager viewport;
- the Nightingale sequence element has the complete residue string, but omits
  letters at the current full-length scale because individual bases are narrower
  than the measured glyph width;
- the Renderer comparison page already declares the bars-to-heatmap fallback in
  SeqViewSpec, which is why Nightingale is degraded rather than failed.

## 3. Target product presentation

### 3.1 Application shell

- Product name: **Mol* Harness Prototype**.
- Sticky top header with translucent light surface, backdrop blur, subtle bottom
  hairline, and safe opaque fallback when backdrop filtering is unavailable.
- Active case-study navigation uses both `aria-current="page"` and a visible
  filled/underlined state.
- Human-facing navigation names:
  - Renderer comparison;
  - Protein + structure;
  - Protein complex;
  - Alignment ensemble;
  - CDS translation;
  - Compatibility lab (formerly P01 evidence);
  - Reference sequence viewer lab.
- Header and page controls remain keyboard accessible at 200% zoom and at a
  390px viewport.

### 3.2 Light glass system

- pale neutral/blue page gradient rather than flat gray;
- translucent white cards with one subtle border, restrained blur, soft shadow,
  and high-contrast text;
- compact spacing scale (4/8/12/16/24px) and reduced heading margins;
- visualizer cards use a header strip and flush host body;
- glass is progressive enhancement: reduced-transparency, forced-colors, and
  unsupported-backdrop environments retain an opaque accessible surface;
- animations obey `prefers-reduced-motion`.

### 3.3 Icons

The feasibility packet freezes exact compatible, license-audited versions of:

- `lucide-react` for React application surfaces;
- `lucide` for DOM-native Seq*/Nightingale controls only if the package-level
  tree-shaken DOM API proves smaller and cleaner than passing app-owned icons.

The published [`lucide-react`](https://www.npmjs.com/package/lucide-react) and
[`lucide`](https://www.npmjs.com/package/lucide) packages currently report zero
runtime dependencies and ISC licensing, but the implementation packet must
inspect the actual selected tarballs and pin the then-current compatible
versions exactly. No icon font, remote asset, or CDN is allowed.

## 4. Required implementation workflow

Every packet uses:

`Orchestrator -> Implementer -> independent Reviewer -> Orchestrator/Reconciler`

- Implementers and reviewers never edit concurrently.
- Each reviewed packet receives a checkpoint commit before dependent work.
- `gpt-5.6-luna` is preferred for bounded styling, route, and regression-test
  packets.
- `gpt-5.6-terra` is used for interaction contracts, viewer/wrapper behavior,
  Nightingale vendor work, fixture/mapping work, and final integration review.
- Shared configuration, manifests, lockfile, public contracts, fixture manifest,
  and vendored Nightingale files have one exclusive owner at a time.
- Any newly discovered dependency or fixture requires orchestrator approval
  before it is written into shared manifests.

## 5. Implementation sequence

```text
M00 plan checkpoint
  -> M01 feasibility/dependency/fixture gates
      -> M02 reviewed dependency freeze
          -> M10 host sizing + CDS stability
              -> M11 semantic interaction and Seq* navigation foundation
          -> M20 Nightingale viewport/presentation foundation
              -> M21 Nightingale alignment adapter
          -> M30 glass shell + shared visualization card
              -> M31 shared renderer chooser
                  -> M40 Renderer comparison + Protein/Complex integration
                  -> M50 alignment ensemble vertical slice
                  -> M60 CDS and remaining case-study rollout
                  -> [reviewed M40 + reviewed M50 + reviewed M60]
                      -> M70 integrated hardening/final independent review
```

M10 and M20 may proceed in parallel only after the reviewed M02 dependency
checkpoint because both can consume native Lucide icons. M11 starts only after
M10 because both packets touch the Seq* viewer package (M10 owns host sizing and
M11 owns interaction/navigation). M30 may also begin after M02, but M31 waits
for both renderer wrappers to expose the frozen presentation contract. M70
starts only after M40, M50, and M60 each have an independently reviewed
checkpoint.

## 6. M00 — plan checkpoint

### Objective

Freeze this packet graph and confirm that the reviewed C00-C50 Complex round is
an ancestor with a clean worktree.

### Owned paths

- this plan only.

### Acceptance

- every reported item maps to an acceptance criterion below;
- component ownership respects the architecture;
- optional-looking work (alignment ensemble fixtures and Nightingale alignment)
  is explicitly gated rather than silently omitted;
- reviewed Complex-round checkpoint `09d3d7e` (and its C00-C50 ancestors) is
  reachable from `HEAD`, and the starting worktree contains no unrelated
  edits;
- independent review finds no sequencing or ownership conflict.

## 7. M01 — feasibility, dependency, and contract freeze

### Objective

Remove uncertainty before changing public contracts, vendored Nightingale, the
lockfile, or alignment fixtures.

### Implementer

`gpt-5.6-terra`, high reasoning.

### Exclusive owned paths

- temporary spike tests under `prototype/tests/m01-*`;
- dependency proposal/evidence notes;
- alignment fixture proposal notes;
- no production or lockfile edits until orchestrator approval.

### Required gates

1. **Current-behavior audit**
   - record computed host/canvas heights for CDS over at least five seconds;
   - reproduce the Renderer comparison navigation overlap at narrow width;
   - record Mol* -> sequence -> Mol* stale-hover message/owner sequence;
   - prove interval-item payloads from Reference and Nightingale;
   - record Nightingale viewport, letters, label, and scroll behavior.
2. **Lucide gate**
   - inspect exact package exports, React 19/Vite/TypeScript 6 compatibility,
     tree-shaking, license, tarball integrity, and offline build;
   - propose the minimum exact package set and lockfile change.
3. **Nightingale viewport gate**
   - inspect the manager/zoom packages from the already-pinned upstream commit;
   - prove whether the same-commit manager can be vendored without registry
     Nightingale duplication;
   - compare that with a smaller wrapper-owned synchronized viewport;
   - freeze one approach and update `UPSTREAM.md`/`PATCHES.md` requirements.
4. **Alignment ensemble gate**
   - select 3-5 alignment members with redistributable local structures;
   - verify exact sequence/member/structure mappings, missing residues,
     mutations, checksums, browser size, and license/provenance;
   - precompute deterministic rigid transforms into the P69905/1A3N frame;
   - verify MVS can load all structures, apply transforms, render a fresh frame,
     color each member, focus one, and dispose offline;
   - fail the gate rather than invent an ensemble if fewer than two additional
     mappings are defensible.
5. **Contract freeze**
   - freeze native feature-hit payload semantics;
   - freeze repeat-selection toggle semantics;
   - freeze wrapper presentation options for track action icons and renderer
     chooser capabilities;
   - freeze typed alignment intents for profile/member/show-all actions.

### Verification

- no production dependency is added during the spike;
- no runtime network is used by the resulting cases;
- fixture and dependency audits still pass;
- reviewer checks actual upstream/tarball/fixture evidence.

## 8. M02 — reviewed dependency freeze

### Objective

Apply only the exact dependency and shared evidence changes approved from M01
before any icon-consuming renderer or app packet begins.

### Owner

Orchestrator/reconciler with exclusive ownership.

### Owned paths

- exact package manifests approved by M01;
- `prototype/pnpm-lock.yaml`;
- dependency/license evidence and audit allowlists;
- no viewer, wrapper, vendor, fixture, or page implementation.

### Required behavior

- pin the minimum approved Lucide package set exactly;
- install from verified tarballs and regenerate the lockfile once;
- update dependency/license evidence deterministically;
- prove offline frozen install, TypeScript/Vite import compatibility, tree
  shaking, and zero unexpected transitive packages;
- create an independently reviewed checkpoint commit consumed by M10, M11,
  M20, and M30.

### Verification

```sh
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm install --offline --frozen-lockfile
mise run check:dependencies
mise run check:p80
mise run check
git diff --check
```

## 9. M10 — host sizing and CDS stability

### Objective

Eliminate intrinsic-size/ResizeObserver feedback and establish one explicit host
geometry contract before applying new card styling.

### Implementer

`gpt-5.6-terra`, medium reasoning.

### Owned paths

- `prototype/packages/seq-viewer/src/**` sizing code/tests;
- `prototype/packages/wrapper-seq-viewer/src/**` sizing tests if required;
- `prototype/apps/web/src/routes/cds-protein.tsx`;
- focused CDS/reference viewer browser tests.

### Required behavior

- every embedded viewer host has an explicit bounded block size, never only
  `min-height` with a `height:100%` child;
- canvas/spacer calculations cannot increase the containing host's intrinsic
  height;
- ResizeObserver ignores unchanged rounded dimensions and cannot self-trigger a
  growth loop;
- replacement, route remount, viewport resize, and StrictMode do not accumulate
  observers or animation frames;
- the CDS nucleotide and protein documents visibly render and synchronize.

### Acceptance

- CDS host and document scroll height remain within 1px over a five-second
  observation and after 20 resize notifications;
- both canvases have non-zero bounded size and visible tracks/letters at a
  readable zoom;
- forward/reverse nucleotide-codon mapping, clear, toggle, and disposal pass;
- page height is stable at desktop and 390px layouts.

## 10. M11 — semantic interaction and Seq* navigation foundation

### Objective

Make feature hover, hover replacement, selection toggle, track actions, and
navigation geometry correct in the reference viewer and harness path.

### Implementer

`gpt-5.6-terra`, high reasoning.

### Owned paths

- `prototype/packages/seq-viewer/src/**`;
- `prototype/packages/wrapper-seq-viewer/src/**`;
- `prototype/packages/harness-core/src/**` only if contract audit proves a
  shared routing defect;
- `prototype/packages/wrapper-molstar/src/**` only for the stale-hover boundary;
- focused package/browser contract tests.

### Required behavior

- any hit inside an annotation item returns its complete item loci and semantic
  identity;
- discontinuous items preserve every locus and relationship hits preserve every
  endpoint;
- interval translation maps every mapped structure residue and diagnoses
  unmapped portions without reducing the event to the pointer point;
- Mol* receives one `highlightOnly`-equivalent replacement union for the mapped
  feature, never one accumulating mark per pointer move;
- Mol* native hover clear and subsequent sequence hover cannot coexist as stale
  visual owners;
- identical native selection toggles off with the same owner lease;
- navigation uses non-overlapping CSS grid/flex regions for header, overview,
  handles, and controls rather than an absolute-width assumption;
- row header text truncates; an optional square icon action remains visible;
- pointer, keyboard, wheel, drag, gap, and viewport descriptor behavior remain
  bounded.

### Acceptance

- hovering each point inside one domain produces an identical full-domain locus
  set and highlights every mapped domain residue in Mol*;
- domain A -> domain B -> clear leaves only B, then none;
- Mol* residue A -> sequence feature B shows only B in Mol* and one current
  sequence highlight;
- click A -> click A clears both viewers; click A -> click B replaces A;
- unrelated selection/highlight owners survive every clear;
- Renderer comparison navigation overview ends before the first control at all
  widths from 390px to 1600px.

## 11. M20 — Nightingale viewport and compact presentation foundation

### Objective

Give Nightingale one coherent viewport and make the selected vendor subset feel
like a compact sequence renderer rather than independent stacked widgets.

### Implementer

`gpt-5.6-terra`, high reasoning.

### Exclusive owned paths

- `prototype/vendor/nightingale/**` when the M01 decision requires vendor work;
- `prototype/packages/wrapper-nightingale/**`;
- `prototype/tests/p30-nightingale/**`;
- no shared manifests/lockfile without orchestrator ownership.

### Required behavior

- one synchronized display range controls every native Nightingale element;
- trackpad/wheel horizontal pan and zoom match the frozen interaction contract;
- a bottom viewport/scroll affordance is sized to the plot area only;
- row headers remain fixed while the plot pans or scrolls horizontally;
- headers use compact spacing, square corners, ellipsis, tooltip, focus ring,
  and a separate icon-only track action when configured;
- sequence letters render when the base width is readable; ticks remain useful
  when letters do not fit;
- all tracks remain pixel-aligned during pan/zoom/resize;
- full feature loci, toggle selection, native clear, applied-owner isolation,
  staged replacement, and teardown retain current guarantees.

### Acceptance

- zooming until one base is at least the measured glyph width visibly renders
  the residue letters;
- header positions are unchanged after full-range horizontal pan;
- 100 alternating pan/zoom operations retain track alignment within 1px;
- identical selection toggles off locally and remotely exactly once;
- fixed labels never wrap or acquire rounded borders;
- no registry `@nightingale-elements/*` dependency is introduced.

## 12. M21 — Nightingale alignment adapter

### Objective

Make the renderer chooser truthful on the alignment case rather than offering a
non-functional Nightingale option.

### Implementer

`gpt-5.6-terra`, high reasoning.

### Owned paths

- Nightingale wrapper and selected same-commit vendor paths;
- wrapper contract/real-browser tests;
- SeqViewSpec public schema is read-only unless the gate finds an actual missing
  display primitive.

### Required behavior

- render each alignment member as a synchronized Nightingale sequence row with
  explicit gap columns and stable member identity;
- virtualize or bound 32 rows without losing the shared viewport;
- publish alignment column plus mapped member locus for native interaction;
- render consensus/conservation/subgroup tracks using existing annotation
  primitives;
- fixed member headers expose the configured structure action only for members
  with a frozen structure association.

### Acceptance

- the existing 32x118 alignment renders offline in both Reference and
  Nightingale modes;
- query/non-query/gap identities remain exact through scroll and renderer switch;
- the Nightingale alignment path introduces no direct structure mapping.

## 13. M30 — glass shell and shared visualization card

### Objective

Apply the modern compact visual system once, without duplicating route-specific
card markup or domain behavior.

### Implementer

`gpt-5.6-luna`, medium reasoning.

### Owned paths

- global app CSS/theme tokens;
- `prototype/apps/web/src/routes/__root.tsx`;
- new presentation-only components under `prototype/apps/web/src/components/**`;
- app manifest/lockfile only under orchestrator's exclusive approved Lucide
  dependency packet;
- visual/accessibility browser tests.

### Required behavior

- rebrand app and document title to Mol* Harness Prototype;
- sticky responsive header and visible active case-study state;
- shared `PageIntro`, `StatusCard`, `VisualizationCard`, compact toolbar, icon
  button, and renderer chooser primitives;
- one card border only; host body is flush, `min-width:0`, and explicitly sized;
- human-facing labels replace packet codes in normal navigation/copy;
- Lucide icons are tree-shaken, decorative icons are hidden from assistive
  technology, and icon-only actions have accessible names/tooltips.

### Acceptance

- all pages remain usable at 390, 768, 1280, and 1600px;
- sticky header does not cover anchor/focused content;
- active route has visual and semantic state;
- forced-colors/reduced-motion/reduced-transparency fallbacks remain usable;
- browser audit finds no nested visualizer border and no horizontal document
  overflow.

## 14. M31 — shared renderer chooser

### Objective

Allow every case-study sequence surface to select Reference or Nightingale
without putting document translation or lifecycle state into React.

### Implementer

`gpt-5.6-terra`, medium reasoning.

### Owned paths

- `prototype/packages/harness-react/**` for a presentation-only host/chooser
  lifecycle primitive;
- app presentation components and route composition;
- wrapper factories only for the frozen presentation options;
- route tests.

### Frozen modes

- Renderer comparison: `Compare | Reference | Nightingale`;
- Protein + structure: `Reference | Nightingale`;
- Protein complex: `Reference | Nightingale`;
- Alignment ensemble: `Reference | Nightingale`;
- CDS translation: one chooser applies to both nucleotide and protein panels.

Compatibility lab and Reference sequence viewer lab are explicit diagnostic,
non-case-study exceptions. Compatibility lab must continue to show the exact
fixed renderer spikes it is intended to compare; Reference sequence viewer lab
must remain pinned to the Reference renderer whose native contract it exposes.
They receive the shared visual system and human-facing names in M60, but no
misleading renderer chooser.

### Required behavior

- switching disposes the old wrapper before host removal and creates one fresh
  harness/component instance;
- the integration plugin republishes the same immutable current case document;
- no route translates loci, constructs MVS, or publishes synthetic native
  interaction messages;
- the choice is represented in hash-router search state for reload/deep-link
  reproducibility; no runtime network or account storage is used;
- pending/failed/degraded state is truthful per selected wrapper.

### Acceptance

- repeated Reference <-> Nightingale switching retains stable document digest,
  one active subscription, one host tree, and no late messages;
- current selection is either deliberately restored through a typed harness
  snapshot or truthfully cleared; the chosen policy is consistent in every case;
- renderer switch is keyboard accessible and does not change biological state.

## 15. M40 — Renderer comparison, Protein, and Complex integration

### Objective

Roll the foundations through the principal sequence/structure cases and replace
technical prototype copy with user-facing presentation.

### Implementers

- `gpt-5.6-luna` for route composition/style;
- `gpt-5.6-terra` for plugin/range/stale-hover reconciliation;
- disjoint paths or sequential ownership only.

### Required behavior

- Renderer comparison explains Nightingale's heatmap fallback in plain language
  while inspector evidence retains the exact diagnostic;
- compare/single renderer modes use the same immutable request;
- Protein + structure range/domain hover highlights complete mapped features;
- Complex regions/interface/contact ranges preserve complete multi-polymer loci;
- Mol* -> sequence -> Mol* transfer never displays stale plus current hover;
- track headers use compact text plus configured 3D action icon;
- all panels use the shared flush visualization card.

### Acceptance

- exhaustive P04637 region/site/variant/score hover mapping matches the checked
  sequence-to-structure table;
- a partially mapped range highlights mapped residues and reports missing ones;
- Complex interface/contact hover marks both roles without one-residue collapse;
- every case passes in Reference and Nightingale modes, with Compare mode on the
  portability page;
- fallback copy never exposes `wrapper.nightingale.*` outside diagnostics.

## 16. M50 — alignment structural ensemble vertical slice

### Objective

Turn the alignment page from one neutral query structure into an inspectable,
offline structural ensemble driven by alignment annotations and member actions.

### Implementer

`gpt-5.6-terra`, high reasoning.

### Exclusive owned paths

- alignment integration plugin/tests;
- newly approved checked alignment-ensemble fixtures/mappings/transforms and
  fixture manifest;
- alignment route/e2e;
- no wrapper or root configuration edits during plugin implementation.

### Typed intents/profiles

- `alignment.profile.activate`: `consensus | conservation | subgroup`;
- `alignment.structure.show-member`: exact member/structure ID;
- `alignment.structure.show-all`: frozen ensemble ID;
- clear/supersede/dispose behavior follows request-envelope identity.

### Required behavior

- consensus colors mapped residues by consensus identity/mismatch policy;
- conservation colors all mapped structured members by one deterministic
  alignment-column scale;
- subgroup colors use frozen subgroup categories and legend colors;
- clicking a structured member's icon shows that member in its superposed frame;
- Show all loads every frozen structure, applies checked transforms, and displays
  them simultaneously with stable member colors;
- members without a structure show an honest unavailable action, never a wrong
  structure;
- latest profile/member/show-all action wins and stale MVS cannot reappear;
- Reference and Nightingale alignment modes generate identical typed intents.

### Acceptance

- every profile has a distinct validated MVS tree and exact selector/color count;
- each member action loads the correct local structure and identity;
- Show all contains the exact fixture-manifest members/transforms and reaches a
  fresh rendered/degraded frame offline;
- hover/select maps through alignment column -> member sequence -> that member's
  structure only; gaps remain unmapped;
- route remount disposes every loaded structure and subscription.

## 17. M60 — CDS and remaining case-study rollout

### Objective

Complete renderer switching, compact panels, naming, and interaction consistency
for CDS and every remaining page/lab.

### Implementer

`gpt-5.6-luna`, medium reasoning, with Terra reconciliation for interaction
failures.

### Required behavior

- CDS uses the stable host geometry from M10 and both renderer modes;
- nucleotide/protein full-codon interval highlights and partial-edge diagnostics
  remain exact;
- all case studies expose the frozen renderer chooser modes;
- Compatibility lab and Reference sequence viewer lab use human-facing copy,
  compact glass cards, bounded diagnostics, and no packet IDs as primary labels;
- the two diagnostic labs remain fixed-purpose renderer exceptions as declared
  in M31 and do not display a non-functional chooser;
- Lucide controls replace text glyphs where they improve recognition without
  hiding meaning.

### Acceptance

- CDS remains stable for 30 seconds and through 20 renderer switches;
- every route is reachable by hash deep link with active sticky navigation;
- no page contains `Seq* Prototype` or user-facing `P01 evidence`;
- all existing inspector/download/offline behavior remains intact.

## 18. M70 — integrated hardening and final independent review

### Objective

Verify the round as one offline product and close every item in section 1.
M70 may start only after reviewed M40, M50, and M60 checkpoint commits are all
ancestors of `HEAD`.

### Implementer/reviewer

- hardening implementer: `gpt-5.6-terra`, medium reasoning;
- final independent reviewer: `gpt-5.6-terra`, high reasoning.

### Owned paths

- aggregate tests under `prototype/tests/**`;
- `prototype/TRACEABILITY.md`;
- this plan's status line;
- narrow production reconciliation only after reviewer findings.

### Required browser matrix

- feature/domain complete-range hover in both sequence renderers;
- Mol* -> sequence -> Mol* hover transfer and clear;
- repeated-selection toggle in every wrapper pairing;
- Nightingale fixed headers, synchronized pan/zoom, letters, compact controls;
- Seq* navigation non-overlap at all case widths;
- all renderer chooser modes and disposal/remount counts;
- all alignment profiles/member/show-all ensemble states;
- complete M40 Protein/Complex/Renderer-comparison browser evidence;
- complete M50 alignment ensemble/member/profile browser evidence;
- complete M60 CDS/all-case chooser and diagnostic-lab browser evidence;
- CDS height stability and mapping in both renderer modes;
- sticky active navigation, responsive glass cards, focus visibility, 200% zoom,
  forced-colors, reduced-motion, and narrow/wide layouts;
- no non-loopback request.

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
mise exec -- pnpm list '@nightingale-elements/*' --recursive --depth Infinity
git diff --check
git status --short
```

The final reviewer reads this request, this plan, component specifications,
fixture/vendor/dependency evidence, the complete cumulative diff, and actual
browser evidence. Every blocking/high finding is reconciled and the complete
matrix reruns before the reviewed checkpoint commit.

## 19. Requirements traceability

| Requested outcome | Primary packet(s) |
| --- | --- |
| Complete range/domain hover in Mol* | M11, M40 |
| Nightingale horizontal scroll with fixed headers | M20 |
| Compact square Nightingale labels/buttons | M20, M30 |
| Remove nested panel borders | M30, M40, M60 |
| Nightingale sequence letters | M20 |
| Clear stale Mol*/sequence hover union | M11, M40 |
| More compact UI | M20, M30, M60 |
| Light Apple-like glass appearance | M30 |
| Seq* navigation width | M11 |
| Explain bars -> heatmap degradation | M40 |
| Lucide icons and 3D track action | M01, M11, M30 |
| Alignment annotation coloring | M50 |
| Alignment member structure action | M50 |
| Alignment Show all superposition | M01, M50 |
| Repeat selection toggles | M11, M20 |
| CDS blank/runaway page | M10, M60 |
| Mol* Harness Prototype rebrand | M30 |
| Human-friendly lab names | M30, M60 |
| Reference/Nightingale switch in every case | M21, M31, M40, M50, M60 |
| Sticky active app header | M30 |
