# MolViewSpec Usage Improvement Specification

Status: proposed prototype follow-up

## 1. Purpose and evidence

This document defines how the prototype should generate clearer and smaller
MolViewSpec (MVS) documents. It does not change the harness/wrapper boundary:
integration plugins still generate complete MVS requests, and the Mol* wrapper
still only validates, loads, interacts with, and disposes those requests.

The primary design evidence is `prototype/spec/mvs-features.msgpack` (SHA-256
`c31bbfa1b451ce813744bd6085e1528ca65b35d32c86acb0ac93ac73f5a98cab`). It is a
deflated MessagePack MolViewStory container, not plain MessagePack. The checked
decoder inflates it with Mol* `Task`/`inflate`, then calls Mol* `decodeMsgPack`:

```sh
cd prototype
pnpm run inspect:mvs-story
pnpm run inspect:mvs-story -- --scene color_multi
pnpm run inspect:mvs-story -- --scene color_themes_continuous
pnpm run inspect:mvs-story -- --json --output /tmp/mvs-features.json
```

The decoded version 1 story is titled **MVS Features Overview**, contains 48
scenes and two embedded assets, and describes itself as an October 2025 feature
overview. The scenes most relevant here are:

- `component_expr_chain_range` and `component_union_expr`: expression and union
  selectors;
- `representation_cartoon`, `representation_ball_and_stick`, and
  `representation_multi`: representations are separate visual decisions;
- `color`, `color_selector`, and `color_multi`: one representation can receive
  multiple selector-scoped color nodes;
- `annotations`, `color_themes_discrete`, and `color_themes_continuous`:
  annotation-driven coloring and palettes;
- `labels`, `tooltips`, `opacity`, `focus`, `primitives`, and `canvas`: optional
  presentation features which should be used intentionally.

The story is design evidence, while the APIs and validation exported by the
single pinned `molstar@5.11.0` dependency remain the executable authority.

## 2. Problems in the current prototype

### 2.1 Dense residue data creates geometry

`generateUniProtAnnotationMvs` always creates a neutral chain cartoon and then
creates a component, `ball_and_stick` representation, and color node for every
mapped annotation item. This is especially inappropriate for the synthetic
AlphaMissense-like track: its meaning is a residue color field, but the MVS tree
turns every observed residue into additional atomic geometry. The result is
visually noisy, produces a large state tree, obscures the cartoon, and makes
hover labels appear like a list of independently rendered residues.

### 2.2 Representation choice is not driven by semantics

Regions, quantitative values, sparse sites, variants, interface sets, and
individual contacts currently share variants of the same component-plus-
geometry strategy. They need different policies:

- a residue color field should color a polymer representation;
- a region should normally color a polymer representation;
- a sparse site may optionally add atomic detail;
- a relationship may emphasize and focus its endpoint geometry;
- an ordinary synchronization highlight should remain an imperative wrapper
  interaction and should not require regenerating the MVS document.

### 2.3 MVS assets are not part of the request contract

The story demonstrates `colorFromUri` and embedded MolViewStory/MVSX assets.
The prototype currently publishes a standalone MVSJ-like JSON document and a
local structure URL. It has no portable request field for generated annotation
assets. Using `colorFromUri` prematurely would make a supposedly complete
request depend on an untracked side resource.

## 3. Generation rules

### 3.1 Common structural baseline

Each generated structure view MUST:

1. download the checked local structure once;
2. parse it once;
3. create the verified model or assembly structure once;
4. create one background component per intentionally distinct polymer group;
5. create one `cartoon` representation per background component;
6. apply a deterministic neutral or polymer-role base color;
7. add semantic colors to that representation with selector-scoped `color`
   nodes.

The generator MUST NOT create a new structure, component, or representation
merely because a residue has a different color.

The preferred builder shape is:

```typescript
const polymer = structure.component({ selector: chainSelector });
const cartoon = polymer
  .representation({ type: "cartoon" })
  .color({ color: baseColor });

for (const group of selectorsGroupedByColor) {
  cartoon.color({ color: group.color, selector: group.selectors });
}
```

MVS color order MUST be deterministic: base color first, then specific colors
in a stable order. Selectors MUST retain the verified entity, label/auth chain,
label/auth residue, and insertion-code fields produced by the mapping table.

### 3.2 Dense quantitative residue tracks

Dense or sparse numeric residue arrays whose intended visual channel is color
MUST use the existing cartoon representation. This includes the synthetic
AlphaMissense-like score and synthetic confidence tracks.

The generator MUST:

- evaluate the SeqViewSpec color encoding exactly as it does now;
- exclude unmapped and ambiguous residues while retaining them in diagnostics;
- group mapped selectors by the final evaluated color;
- add one selector-scoped color node per distinct final color;
- produce zero `ball_and_stick`, `spacefill`, or primitive nodes for the score;
- avoid automatic focus for a whole dense track.

The initial implementation MUST preserve exact evaluated colors rather than
quantizing the scale. A later, explicitly approved optimization may quantize a
continuous scale if the generated document records the policy and tests its
maximum color error.

For the P04637 AlphaMissense-like activation, the expected visual result is one
grey cartoon with the 196 observed/mapped residues colored on that cartoon.
Missing 1TUP residues and out-of-construct values remain diagnosed and absent.

### 3.3 Regions and categorical residue sets

Regions/domains and categorical coverage SHOULD color the cartoon using union
selectors grouped by final color. Overlapping regions MUST have a documented,
stable precedence based on SeqViewSpec layer/item order.

The observed-coverage activation SHOULD render observed residues on the base
cartoon and leave missing/unmapped residues in the neutral color. It MUST NOT
manufacture coordinates for missing residues.

### 3.4 Sparse sites and variants

Sparse sites and variants MUST always color their selected residues on the
cartoon. Site activation MUST also add selector-colored `ball_and_stick` detail
for its mapped residues. Variants MAY add the same detail when all of the
following are true:

- atomic detail is useful for the activation's stated purpose;
- the mapped selector count is below a named generator limit;
- the additional representation is covered by a structural tree assertion;
- the document description says that atomic detail was added.

Atomic detail is an opt-in semantic policy, not a fallback for coloring. Labels
or tooltips MAY be added for small, named feature sets. Dense per-residue labels
or tooltips MUST NOT be emitted.

### 3.5 Complex interfaces and relationships

The 1BRS background SHOULD remain two cartoons with stable polymer-role colors.
Interface activation MUST recolor endpoint residue sets on those cartoons and
MUST add one bounded, selector-colored `ball_and_stick` union per polymer role
so the complete interface residue set is visible in atomic context.

Activating one contact MAY add ball-and-stick representations for that
contact's two endpoints and focus their union. The MVS generation summary and
harness focus commands MUST preserve the relationship ID and both endpoint
roles. Focus/highlight synchronization remains owner-scoped and clearable.

### 3.6 Alignment structure view

The neutral 1A3N view already follows the desired one-cartoon baseline. Mapping
hover and selection are transient wrapper interactions and MUST remain outside
MVS regeneration. A future static alignment annotation may add selector-scoped
cartoon colors under the same rules as other residue fields.

## 4. Annotation assets and palettes

The story demonstrates `colorFromUri`, `colorFromSource`, and categorical,
discrete, and continuous palettes. These are useful for reducing very large
lists of color nodes, but only under the correct data contract.

`colorFromSource` MUST NOT be used to pretend that a synthetic AlphaMissense-
like score is an existing mmCIF field such as B-factor. Source annotations are
allowed only when the checked structure file really contains the named
category/field with the required residue identity.

`colorFromUri` is deferred until the visualization request can carry or resolve
a checked local annotation asset. That follow-up MUST:

- add an explicit asset collection to the portable request or adopt MVSX;
- preserve hashes, MIME/format, and provenance;
- validate all asset references before publishing the request;
- load with runtime network disabled;
- include assets in the inspector/download path;
- remain compatible with the same pinned `molstar` package.

Until then, selector-scoped `color` nodes are the required portable solution.

## 5. Shared generator design

Integration plugins SHOULD share a small MVS presentation helper which accepts
already-mapped semantic groups. It MUST NOT perform biological coordinate
translation or import wrapper state.

```typescript
interface MvsResidueColorGroup {
  readonly semanticId: string;
  readonly color: `#${string}`;
  /** Larger values win, matching later SeqViewSpec layer/item precedence. */
  readonly precedence: number;
  readonly selectors: readonly MvsResidueSelector[];
}

interface MvsAtomicDetailGroup {
  readonly semanticId: string;
  readonly color: `#${string}`;
  readonly selectors: readonly MvsResidueSelector[];
}

interface MvsCartoonStyle {
  readonly componentSelector: MvsResidueSelector;
  readonly baseColor: `#${string}`;
  readonly residueColors: readonly MvsResidueColorGroup[];
  readonly atomicDetails?: readonly MvsAtomicDetailGroup[];
}
```

The helper owns only MVS tree construction, stable ordering, selector
deduplication, and presentation diagnostics. Each case plugin remains
responsible for mapping, semantic IDs, color evaluation, and item-level result
summaries. Case plugins assign precedence from their SeqViewSpec layer/item
order. The helper resolves each structural selector to the greatest precedence
and rejects equal-precedence conflicts with different final colors instead of
choosing by incidental color or input order.

## 6. Acceptance criteria

### 6.1 Structural MVS assertions

Tests MUST traverse the generated MVS tree; screenshots alone are insufficient.

For P04637 AlphaMissense-like activation:

- exactly one 1TUP structure node;
- exactly one P04637 chain component;
- exactly one cartoon representation;
- zero ball-and-stick/spacefill/primitive representations;
- one base color plus no more than one selector color per distinct evaluated
  mapped color;
- exactly 196 mapped residue selectors derived from the checked TSV;
- unchanged partial/unmapped mapping diagnostics;
- `MVSData.validationIssues(..., { noExtra: true })` returns no issues.

For regions, sites, variants, coverage, interface, and contact activations,
tests MUST assert the allowed representation profile from sections 3.3–3.5 and
verify exact selector identities and colors.

### 6.2 Browser behavior

Offline browser tests MUST verify:

- the generated request reaches `rendered` or explicitly diagnosed `degraded`;
- AlphaMissense-like activation visibly retains a cartoon and does not create a
  residue-wise ball-and-stick forest;
- replacing tracks replaces the complete MVS view without stale geometry;
- native/harness highlight and selection still replace/clear correctly;
- repeated replacement and disposal do not increase representation,
  subscription, or message counts.

### 6.3 Performance guardrails

The generator tests MUST record node counts by MVS node kind. AlphaMissense-like
generation MUST scale primarily with distinct colors, not with
component-plus-representation nodes per residue. Browser readiness MUST remain
based on Mol*'s post-load frame signal, never a fixed delay.

## 7. Implementation sequence

1. Add a read-only MVS tree inspection helper and node-count tests.
2. Add the shared cartoon-color builder helper in `integration-plugins`.
3. Refactor P04637 generation, starting with the AlphaMissense-like and coverage
   tracks, then regions/sites/variants.
4. Refine the 1BRS interface/contact profiles.
5. Run focused wrapper contracts and every offline Mol* case study.
6. Consider annotation assets/MVSX only as a separately reviewed contract
   extension.

No wrapper API, harness topic, coordinate translator, or React layout change is
required for steps 1–4.
