# MolViewSpec Improvement Implementation Plan

Status: proposed implementation plan

This plan implements `molviewspec-improvements.md` using the same reviewed
packet workflow as the initial prototype:

> Orchestrator → Implementer → Independent reviewer → Orchestrator/reconciler

The MolViewStory input and decoder are evidence for this work. The executable
authority remains the single pinned `molstar@5.11.0` package and its MVS
builders, types, validator, and loader.

No G10, G20, G30, or G40 implementation work may begin until G00 has completed
independent review, all findings have been reconciled, and the specification
checkpoint has been committed.

## 1. Coordination rules

For every packet, the orchestrator provides the implementer with:

- the original requirements and relevant specification sections;
- explicit owned paths and shared read-only paths;
- constraints and decisions which are already frozen;
- acceptance criteria;
- focused and workspace verification commands.

After the implementer stops changing files, an independent reviewer reads the
same requirements and the actual diff. The reviewer does not edit. The
orchestrator evaluates every finding, assigns a narrow reconciliation when
needed, reruns the packet and workspace gates, and creates a reviewed checkpoint
commit. An implementer and reviewer never edit the same packet concurrently.

Use `gpt-5.6-terra` for implementation and nontrivial reconciliation. Use
`gpt-5.6-luna` for bounded, evidence-based packet review where the diff is small
and the acceptance probes are explicit. Use `gpt-5.6-terra` for the final G40
cross-packet review. The orchestrator retains ownership of commits, shared
configuration, manifests, public exports, and final reconciliation.

Do not add dependencies. Do not edit `legacy/`. Do not add another MVS package
or import MolViewSpec from anywhere except the pinned `molstar` package. All
case studies remain runnable with runtime network access disabled.

## 2. Packet sequence

```text
G00 specification checkpoint
  ↓
G10 shared MVS presentation foundation
  ├── G20 UniProt/1TUP profiles ──┐
  └── G30 complex profiles ──────┤
                                  ↓
                         G40 integrated hardening
```

G20 and G30 may be implemented in parallel only after G10 is reviewed and
committed. Their owned source/test paths are disjoint, and the G10 helper and
public contracts are read-only during both packets. No parallel agent may edit
the integration-plugin manifest/index, root scripts/configuration, lockfile,
fixture manifest, Mol* wrapper, or vendored Nightingale tree.

## 3. G00 — evidence, decoder, specification, and plan

### Objective

Create a reproducible way to inspect the deflated MessagePack MolViewStory and
freeze the design and implementation plan before changing case-study behavior.

### Owned paths

- `prototype/spec/mvs-features.msgpack`
- `prototype/spec/molviewspec-improvements.md`
- `prototype/spec/molviewspec-improvement-plan.md`
- `prototype/packages/integration-plugins/scripts/read-mvs-story.mjs`
- the `inspect:mvs-story` script entries in the root and integration-plugin
  package manifests

### Constraints

- Inflation MUST precede MessagePack decoding.
- The decoder MUST use `Task`, `inflate`, and `decodeMsgPack` from the same
  pinned Mol* package already owned by `integration-plugins`.
- It MUST reject unsupported container versions.
- Embedded binary assets MUST not be silently lost when exporting JSON.
- The story input is read-only evidence and MUST retain its recorded checksum.
- No case-study generator or wrapper behavior changes in G00.

### Acceptance

- the summary reports version 1, 48 scenes, and two assets;
- `--scene color_multi` exposes selector-scoped colors on one cartoon;
- `--scene color_themes_continuous` exposes annotation palette usage;
- `--json` emits parseable JSON and base64-preserves both binary assets;
- the specification distinguishes immediate MVSJ selector-color work from a
  future reviewed MVSX/asset-contract extension;
- this plan assigns every implementation change to a reviewed packet.

### Verification

```sh
mise exec -- pnpm run inspect:mvs-story
mise exec -- pnpm run inspect:mvs-story -- --scene color_multi
mise exec -- pnpm run inspect:mvs-story -- --scene color_themes_continuous
mise run check
mise run test
mise run build
mise run check:p80
git diff --check
```

## 4. G10 — shared MVS presentation and tree inspection

### Objective

Add small internal helpers for deterministic cartoon coloring and structural
MVS assertions. Freeze the helper before changing any case generator.

### Implementer model

`gpt-5.6-terra`, medium reasoning.

### Owned paths

- new internal files under
  `prototype/packages/integration-plugins/src/mvs-presentation*`
- focused tests colocated with those files

The integration-plugin public index, manifest, lockfile, existing case files,
wrapper packages, and web app are read-only. The helper should remain internal
unless the orchestrator explicitly approves a public export after review.

### Required behavior

- accept already-mapped selectors and semantic color groups;
- create one component/cartoon baseline per supplied polymer style;
- apply the base color first and selector colors in deterministic order;
- accept explicit numeric semantic precedence from the caller, resolve each
  selector to the greatest precedence, and reject equal-precedence conflicting
  colors;
- deduplicate selectors across all final colors without dropping
  label/auth/insertion identity;
- group selectors only when their final evaluated color is identical;
- optionally create one bounded atomic-detail component/representation for an
  explicitly permitted sparse semantic group;
- expose a read-only MVS tree counter/query helper for tests;
- perform no coordinate translation, color evaluation, domain lookup, loading,
  or wrapper access.

### Acceptance

- deterministic input permutations produce byte-equivalent tree subgraphs;
- dense input creates one component and one cartoon, with zero atomic-detail
  representations;
- sparse detail creates at most one additional component/representation per
  declared detail group, not per residue;
- duplicate selectors collapse; selectors which differ in any structural
  identity field remain distinct;
- returned documents pass pinned MVS validation.

### Verification

```sh
mise exec -- pnpm --filter @seq-star/integration-plugins build
mise exec -- pnpm exec vitest run packages/integration-plugins/src/mvs-presentation.test.ts
mise run check
mise run test
mise run build
git diff --check
```

## 5. G20 — UniProt/1TUP presentation profiles

### Objective

Refactor P04637 MVS generation so annotation semantics choose presentation.
The AlphaMissense-like score colors the existing cartoon instead of creating a
ball-and-stick component/representation per mapped residue.

### Implementer model

`gpt-5.6-terra`, high reasoning.

### Owned paths

- `prototype/packages/integration-plugins/src/uniprot-structure.ts`
- `prototype/packages/integration-plugins/src/uniprot-structure.test.ts`
- `prototype/tests/e2e/uniprot-structure.spec.ts`
- P41-specific test fixtures/helpers only if a new checked artifact is required

The shared G10 helper, wrapper packages, mapping/structure fixtures, app route,
manifests, lockfile, and public contracts are read-only.

### Frozen presentation decisions

- Regions/domains: one chain cartoon, selector-scoped colors, no atomic detail.
- Synthetic AlphaMissense-like score: one chain cartoon, exact evaluated
  selector colors, no atomic detail, no auto-focus.
- Observed coverage: one chain cartoon, observed selectors colored, missing and
  unmapped residues neutral, no atomic detail.
- Sites and variants: always color the cartoon. Sites additionally use one
  bounded union component and ball-and-stick representation per final color;
  variants may opt in under the same limit. Never create one representation per
  residue.
- Mapping status, original loci, colors, request order, and lifecycle semantics
  stay unchanged.

### Acceptance

For AlphaMissense-like activation, structural tests assert:

- one download/parse/model structure;
- one P04637 component and cartoon representation;
- zero ball-and-stick, spacefill, surface, or primitive nodes;
- exactly 196 TSV-derived mapped selectors;
- base color first, then no more than one color node per distinct evaluated
  mapped color;
- unchanged mapped/partial/ambiguous/unmapped summary;
- valid MVS with no extra fields.

Every other activatable P04637 track receives a named structural profile test.
The real offline browser test activates AlphaMissense-like data, observes a
rendered/degraded production Mol* lifecycle, and proves replacement does not
retain prior geometry.

### Review emphasis

- selector identity and exact color preservation;
- deterministic color-node ordering;
- absence of accidental B-factor/source-annotation misuse;
- no changes to coordinate mapping or wrapper behavior;
- node-count assertions inspect the generated MVS tree, not screenshots.

## 6. G30 — 1BRS interface and relationship profiles

### Objective

Keep the two-polymer cartoon context while making interface and contact detail
proportional to their semantics.

### Implementer model

`gpt-5.6-terra`, medium reasoning.

### Owned paths

- `prototype/packages/integration-plugins/src/complex.ts`
- `prototype/packages/integration-plugins/src/complex.test.ts`
- `prototype/tests/e2e/complex.spec.ts`

The shared G10 helper, fixtures, wrappers, app route, manifests, lockfile, and
public contracts are read-only.

### Frozen presentation decisions

- Background: one cartoon for barnase and one for barstar, with stable role
  colors.
- Interface activation: recolor all mapped interface endpoints on the two
  cartoons and add one selector-colored union ball-and-stick representation per
  endpoint role.
- Single-contact activation: retain cartoon context; add at most one union
  ball-and-stick detail representation per endpoint role and focus both roles.
- Preserve relationship ID, both endpoint roles, every mapped endpoint,
  generated-document/request order, owner-scoped focus/clear, and no echo.

### Acceptance

- all 43 frozen contacts still cross-audit against exact selectors;
- interface MVS has exactly two cartoon representations and two bounded
  atomic-detail representations, independent of interface residue count;
- contact MVS has exactly two cartoons and at most two bounded atomic-detail
  representations, independent of selector count;
- endpoint role colors and focus union are deterministic;
- current harness relationship activation/clear tests remain green;
- production Mol* renders offline and repeated replacement/disposal is clean.

## 7. G40 — alignment baseline and integrated hardening

### Objective

Verify all structural case studies together, reconcile cross-packet findings,
update traceability, and create the final reviewed checkpoint.

### Implementer/reconciler model

`gpt-5.6-terra`, high reasoning. Final reviewer: independent
`gpt-5.6-terra`, high reasoning.

### Owned paths

The orchestrator assigns exact hardening/test/document paths after G20/G30
review. Root scripts/configuration, traceability, and any public seams remain
exclusive to the orchestrator/reconciler.

### Required work

- assert the P69905/1A3N neutral view remains one component/cartoon with no
  static annotation geometry;
- run structural MVS node-count tests for every generated request profile;
- exercise P04637 score/coverage/regions/sites/variants and 1BRS
  interface/contact in the real offline browser;
- verify mapping and interaction behavior is unchanged in both directions;
- verify latest-wins replacement, first-frame readiness, owner clears, no echo,
  repeated disposal/remount, and stable subscriptions/message counts;
- verify one `molstar@5.11.0`, no separate MVS package, clean fixtures/licenses,
  and no runtime external request;
- update requirements traceability with exact tests and final commands.

### Final verification

```sh
mise exec -- pnpm install --offline --frozen-lockfile
mise run check:p80
mise run check
mise run test
mise run build
mise run test:e2e
git diff --check
git status --short
```

The final reviewer reads the improvement specification, this plan, every
reviewed checkpoint diff, and the complete resulting case-study generators.
The improvement series is complete only when all material findings are
reconciled and the worktree is clean after the final checkpoint commit.
