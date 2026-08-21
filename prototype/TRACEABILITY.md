# Requirements traceability matrix

Status values are evidence-based through the reviewed P80 clean-worktree gate.
P80 was independently reviewed after reconciliation, then verified from an
exact detached checkout using the pinned offline toolchain and full browser
matrix. The C00–C50 Complex-interaction evidence below is implemented and
awaiting its separate final independent review.
“Future” means intentionally outside the prototype rather than silently
unimplemented.

| ID | Requirement summary | Evidence | Gate | Status |
| --- | --- | --- | --- | --- |
| ARCH-01 | portable documents, wrappers, harness, plugins, page composition remain distinct | `spec/architecture.md`; package graph; `scripts/audit-p80-hardening.mjs` | `check:p80` | signed off |
| ARCH-02 | no shared visualizer state tree; native state remains behind wrappers | `packages/wrapper-*`; wrapper contract tests | `test` | signed off |
| ARCH-03 | lower Seq* packages have no React/harness/visualizer dependencies | package manifests; P80 source audit | `check:p80` | signed off |
| ARCH-04 | wrappers never import another wrapper; plugins do not manipulate native state | package source audit; `packages/integration-plugins/*.test.ts` | `check:p80`, `test` | signed off |
| ARCH-05 | page owns layout only; no biological mapping/direct viewer wiring | `apps/web/src/routes`; P80 route audit | `check:p80` | signed off |
| SVS-01 | SeqViewSpec is declarative, resolved, coordinate-explicit, strict and identity-stable | `packages/seq-view-spec/src`; `spec/seq-view-spec.md` | `check:schema`, `test` | signed off |
| SVS-02 | JSON Schema draft 2020-12 artifact is deterministic and validates examples | `packages/seq-view-spec/schema`; scripts | `check:schema`, `check:p80` | signed off |
| SVS-03 | zero-based half-open loci, cross references, fallbacks, representations and extensions validate | `semantic.test.ts`, `contracts.test.ts`, invalid fixtures | `test` | signed off |
| SEQ-01 | normalized models, diagnostics, deterministic algorithms, FASTA/A3M normalization | `packages/seq-core/src` | `test` | signed off |
| COORD-01 | identity, table, alignment/member, reverse, partial/ambiguous/unmapped mappings preserve provenance | `packages/seq-coords/src/*.test.ts` | `test` | signed off |
| COORD-02 | CDS one-to-many/reverse orientation/phase stretch mapping | `packages/seq-coords/src/cds*`; P70 tests | `test`, `e2e` | optional stretch signed off |
| HARNESS-01 | TypeBox envelopes, FIFO/reentrancy-safe RxJS fabric and routing policies | `packages/harness-core/src/contracts.test.ts` | `test` | signed off |
| HARNESS-02 | transactional composition, lifecycle generations, disposal and diagnostics | `packages/harness-core/src/runtime.test.ts`; web shell e2e | `test`, `e2e` | signed off |
| HARNESS-03 | deterministic translator graph, cancellation, bidirectional owner-scoped sync and echo prevention | harness tests; wrapper contract tests | `test` | signed off |
| VIEW-01 | reference viewer supports required sequence/alignment/annotation representations and exact loci | `packages/seq-viewer`; `tests/p20-seq-viewer` | `test`, focused e2e | signed off |
| VIEW-02 | resize/DPR/virtualization and disposal do not duplicate native behavior | P20 browser harness; wrapper contracts | `test`, e2e | signed off |
| WRAP-01 | common accepted/rendered/superseded/degraded/failed contract, latest wins, cleanup | `tests/wrapper-contract` | `test` | signed off |
| WRAP-02 | Nightingale generic ID/readiness/event/owner overlay patches are documented | `vendor/nightingale/{UPSTREAM,PATCHES}.md`; P30 e2e | `check:p80`, e2e | signed off |
| WRAP-03 | Mol* uses one pinned package for MVS validation/loading, loci and imperative interaction | `packages/wrapper-molstar`; P40 harness | `check:dependencies`, `test`, e2e | signed off |
| PLUGIN-01 | plugins register translators/process intents and generate requests, never viewer-native commands | `packages/integration-plugins/src` | `test`, `check:p80` | signed off |
| WEB-01 | React 19/Vite/Tailwind/TanStack lazy hash routes; Router plugin before React | `apps/web`; `vite.config.ts`; P80 audit | `build`, `check:p80`, e2e | signed off |
| WEB-02 | page-scoped harness host, diagnostics, redaction, route disposal and basic accessibility | `packages/harness-react`; `web-shell.spec.ts`; `hardening.spec.ts` | `test`, e2e | signed off |
| FIX-01 | four required deterministic, offline fixture cases have provenance, hashes, budgets and mapping audit | `fixtures/manifest.json`, per-case metadata | `check:fixtures`, `check:p80` | signed off |
| FIX-02 | no repository mmCIF tokenizer; pinned Mol* validates selected structure identities | fixture manifest `structureParserValidation`; P01B evidence | `check:fixtures`, e2e | signed off |
| CASE-1 | same P04637 SeqViewSpec/digest drives reference viewer and local Nightingale; fallback and two-way interaction work | `renderer-portability.ts`, `renderer-portability.spec.ts`, `hardening.spec.ts` | e2e | signed off |
| CASE-2 | P04637/1TUP track activation maps to valid inspectable/downloaded MVS with partial/unmapped and bidirectional hover | `uniprot-structure.ts`; its unit/e2e tests; `hardening.spec.ts` | `test`, e2e | signed off |
| CASE-3 | 1BRS named polymers, interface/contact endpoints and two-chain MVS; synthetic values conspicuous | `complex.ts`; `complex.spec.ts`; fixture metadata | `test`, e2e | signed off |
| CASE-4 | 32-row PF00042/P69905/1A3N alignment, virtual rows and composed two-step mapping | `alignment-structure.ts`; its unit/e2e tests | `test`, e2e | signed off |
| CASE-5 | nucleotide/protein CDS mapping is optional, explicit and offline | `cds-protein.ts`; `cds-protein.spec.ts` | `test`, e2e | optional stretch signed off |
| CASE-6 | live CryoET DS-10493 PP7 particles link through a curated class index to EMD-77085 density, representative 1DWN, and P03630; spatial selection, 3.7σ density, clickable accession presentations plus source links, track-specific annotated MVS, exact dynamic sequence/structure mapping, renderer choice, compact external-Neuroglancer layout, and inspection remain harness-owned | `packages/wrapper-tomogram`; `packages/integration-plugins/src/cryoet-tomogram*`; `apps/web/src/routes/cryoet-tomogram.tsx`; `tests/e2e/cryoet-tomogram.spec.ts`; `spec/case-studies.md` | focused Vitest/Playwright, live endpoint probe, `check`, `test` (213), `build` | implemented, pending independent review |
| MVS-01 | MolViewStory evidence is decoded by inflating before MessagePack decoding, using the single pinned Mol* runtime | `spec/mvs-features.msgpack`; `scripts/read-mvs-story.mjs`; `molviewspec-improvements.md` | `pnpm run inspect:mvs-story`, `check:p80` | reviewed checkpoint `84babdb` |
| MVS-02 | selector-scoped semantic colors use deterministic one-cartoon presentation, not per-residue geometry | `mvs-presentation.ts`; `mvs-presentation.test.ts` | focused Vitest, `test` | reviewed checkpoint `46a14ea` |
| MVS-03 | all P04637 profiles retain one cartoon; mapped sparse sites additionally use bounded selector-colored ball-and-stick detail, while 196 mapped AlphaMissense-like selectors retain exact colors without added geometry | `uniprot-structure.ts`; `uniprot-structure.test.ts`; `molviewspec-hardening.test.ts`; `uniprot-structure.spec.ts`; `molviewspec-improvements.spec.ts` | focused Vitest/Playwright, `test`, `test:e2e` | reviewed baseline `3f641db`; sparse-detail follow-up |
| MVS-04 | 1BRS interface and contact preserve two cartoons plus one bounded selector-colored atomic-detail representation per polymer role; contact alone adds a union focus | `complex.ts`; `complex.test.ts`; `molviewspec-hardening.test.ts`; `complex.spec.ts`; `molviewspec-improvements.spec.ts` | focused Vitest/Playwright, `test`, `test:e2e` | reviewed baseline `16efb27`; interface-detail follow-up |
| MVS-05 | P69905/1A3N remains one neutral cartoon with no static annotation geometry; all revised request profiles are structurally counted and browser-exercised offline | `alignment-structure.ts`; `molviewspec-hardening.test.ts`; `alignment-structure.test.ts`; `molviewspec-improvements.spec.ts`; `hardening.spec.ts` | `mise exec -- pnpm exec vitest run packages/integration-plugins/src/molviewspec-hardening.test.ts`; `mise exec -- pnpm exec playwright test tests/e2e/molviewspec-improvements.spec.ts`; final commands below | independently reviewed G40 checkpoint |
| H10 | Mol* native hover synchronization replaces its prior owner lease across rapid movement and clear, preserves unrelated highlights and selections, prevents echo, and disposes subscriptions | `packages/harness-core/src/runtime.test.ts` (`replaces one synchronized native hover lease…`, stale translation and reflection-key cases); `tests/wrapper-contract/molstar.contract.test.ts` (native lease, echo and disposal cases) | `mise run test`; wrapper-contract Vitest project | reviewed checkpoint `6337190` |
| H20 | Exactly three fixture-derived offline protein/structure datasets have distinct tracks, exact bidirectional mappings, ordered sequence-before-neutral requests, cancellable generation, latest-wins switching, stale-activation rejection, and one pinned Mol* runtime; a dataset becomes committed active only after both exact request envelopes report rendered/degraded | `packages/integration-plugins/src/uniprot-datasets.test.ts`; `scripts/audit-p80-hardening.mjs`; `tests/e2e/uniprot-structure.spec.ts` | `mise run test`; `mise run check:p80`; focused and full Playwright | reviewed checkpoint `b5e8a11`; lifecycle reconciliation and H40 browser audit |
| H30 | Catalog-driven accessible selector and lifecycle-aware transition headings expose only confirmed dataset identity and displayed SeqViewSpec/MVS plus request-bound mapping; validated copy/download, bounded history, scroll containment, adversarial identity handling, remount telemetry and offline behavior are exercised | `apps/web/src/inspect-panel-state.test.ts`; `apps/web/src/routes/uniprot-structure.tsx`; `tests/e2e/uniprot-structure.spec.ts`; `tests/e2e/hardening.spec.ts` | `mise run test`; focused and full Playwright | reviewed checkpoint `be079fe`; lifecycle reconciliation and H40 browser audit |
| H40 | Rapid dataset switching, partial readiness, stale lifecycle, terminal failure/supersede, and representative activation keep status and headings from claiming an unconfirmed mixed dataset; integration remains offline and remount leaves one harness telemetry subscription | `packages/integration-plugins/src/uniprot-datasets.test.ts`; `tests/e2e/uniprot-structure.spec.ts`; H10–H30 evidence above | focused Vitest/Playwright; full verification commands below | integrated hardening checkpoint |
| P00 | pinned mise/pnpm/toolchain, workspace, project refs, empty shell and smoke test | `c784ecd`; root tooling | `mise install`, check/test/build/e2e | signed off |
| P01 | Nightingale/Mol*/fixture feasibility and one-Mol*/local-vendor gates | `0102cc4`; `P01*-FEASIBILITY.md`; fixture audit | `check:dependencies`, `check:fixtures`, e2e | signed off |
| P02 | public-contract freeze, digest and coordinate/lifecycle golden tests | `3984c77`; contract tests | `test`, `check` | signed off |
| P10 | model and coordinate foundation | `74901e7`; seq core/coords tests | `test`, `check` | signed off |
| P11 | executable SeqViewSpec contract and schema artifact | `4e103ea`; schema tests/scripts | `check:schema`, `test` | signed off |
| P12 | harness core | `6560f1f`; harness tests | `test` | signed off |
| P20/P21 | viewer migration plus host/router/diagnostics shell | `cbbe4d2`; P20/browser and web-shell tests | `test`, e2e | signed off |
| P22 | reference wrapper/first vertical slice | `e3365dd`; wrapper contracts/reference e2e | `test`, e2e | signed off |
| P30/P40 | Nightingale and Mol* production wrappers | `c9f553d`; P30/P40 harnesses/contracts | `check:dependencies`, `test`, e2e | signed off |
| P41 | UniProt structure vertical slice | `6bc2e36`; P41 unit/e2e | `test`, e2e | signed off |
| P50/P60 | complex and alignment vertical slices | `dc9267a`; P50/P60 unit/e2e | `test`, e2e | signed off |
| P70 | optional CDS/protein slice | `72fd655`; P70 unit/e2e | `test`, e2e | optional stretch signed off |
| P80-01 | dependency, license, vendor, fixture, boundary and schema hardening audit | `scripts/audit-p80-hardening.mjs`; `THIRD_PARTY_LICENSES.md` | `check:p80` | signed off |
| P80-02 | offline repeated-navigation/rapid-interaction hardening coverage | `tests/e2e/hardening.spec.ts` | `test:e2e:hardening` | signed off |
| P80-03 | clean offline checkout recipe and final traceability | this file; `README.md` | orchestrator clean-worktree gate | signed off |
| C00 | reviewed Complex/reference interaction plan, P01 ancestry, fixture and dependency prerequisite | `spec/complex-interaction-improvement-plan.md`; commits `f51b4a7`, `0102cc4` | `git merge-base --is-ancestor 0102cc4 HEAD`, `check:fixtures`, `check:dependencies` | reviewed checkpoint |
| C10 | reference viewer native hover/selection replaces stale local state, preserves external owners, and exposes all relationship endpoints | `packages/seq-viewer/src/index.ts`; `tests/p20-seq-viewer`; `tests/e2e/reference-viewer.spec.ts` | focused Vitest/Playwright, `test` | reviewed checkpoint `5f302d3` |
| C11 | navigation chrome exposes bounded pan/zoom, gaps, keyboard controls and a JSON-safe viewport descriptor | `packages/seq-viewer`; `packages/wrapper-seq-viewer`; `tests/p20-seq-viewer`; reference wrapper contracts | focused Vitest/Playwright, `test` | reviewed checkpoint `026fc05` |
| C20 | harness maps one native interaction across exact destination spaces, unions successes, diagnoses partial/ambiguous loci and cancels stale hover leases | `packages/harness-core/src/runtime.test.ts` | `mise run test` | reviewed checkpoint `8736430` |
| C30 | 1BRS startup and six validated deterministic MVS profiles preserve exact chain translators, atomic-detail counts, selector colors and contact focus | `packages/integration-plugins/src/complex.ts`; `complex.test.ts`; `molviewspec-hardening.test.ts` | focused Vitest, `test` | reviewed checkpoint `48a192a` |
| C40 | generic inspector binds rendered SeqViewSpec/MVS lifecycle identity, generated summaries and bounded redacted messages without a dataset catalog | `apps/web/src/inspect-panel*`; `inspect-panel-state.test.ts` | `mise run test`, app e2e | reviewed checkpoint `aadb8ca` |
| C41 | Complex and reference pages prove offline startup, native sequence relationship events, exact MVS summaries, bounded navigation, remount disposal and P01 evidence overflow | `tests/e2e/{complex,reference-viewer,p01-feasibility}.spec.ts`; `tests/e2e/molviewspec-improvements.spec.ts` | focused Playwright, `test:e2e` | reviewed checkpoint `ded26bd` |
| C50 | integrated audit covers startup/document identity, six MVS profiles, local/applied owner isolation, bidirectional mapping/clear, relationship endpoints, cancellation/no echo, navigation/remount, P01 narrow/wide overflow, and offline/dependency/fixture/license checks; narrow P01 host shrink fix is the authorized production reconciliation | cumulative C00–C41 tests; `tests/e2e/p01-feasibility.spec.ts`; `scripts/audit-p80-hardening.mjs` | final C50 command matrix in `spec/complex-interaction-improvement-plan.md` | implemented, pending independent review |
| M70 | UI modernization aggregate matrix: complete semantic hover and replace-only transfer/clear, wrapper selection toggles, Nightingale chrome, all chooser modes and disposal, alignment ensemble states, CDS stability, diagnostic labs, offline routing, and accessible glass shell; renderer terminal failure is accepted/replay-lineage exact; complex links fall back to inspectable dual-role markers; P01 host remains bounded without clipping | `packages/harness-react/src/index.test.ts`; focused wrapper/harness tests; `tests/e2e/{renderer-portability,uniprot-structure,complex,alignment-structure,cds-protein,reference-viewer,p01-feasibility,hardening,ui-interaction-modernization}.spec.ts` | final M70 command matrix in `spec/ui-interaction-modernization-plan.md` | implemented and independently reviewed |

The original P80 clean worktree passed `mise install --locked`,
`mise exec -- pnpm install --offline --frozen-lockfile`, `mise run check:p80`,
`mise run check`, `mise run test`, `mise run build`, and `mise run test:e2e`.

The MolViewSpec-improvements final gate additionally runs, from `prototype/`:
`mise exec -- pnpm install --offline --frozen-lockfile`, `mise run check:p80`,
`mise run check`, `mise run test`, `mise run build`, `mise run test:e2e`,
`mise exec -- pnpm exec vitest run packages/integration-plugins/src/molviewspec-hardening.test.ts`,
`mise exec -- pnpm exec playwright test tests/e2e/molviewspec-improvements.spec.ts`,
`git diff --check`, and `git status --short`.
P80 reviewed checkpoint: REVIEWED (this checkpoint commit; see Git history).

The H10–H40 integrated gate runs, from `prototype/`:
`mise exec -- pnpm install --offline --frozen-lockfile`, `mise run check:p80`,
`mise run check`, `mise run test`, `mise run build`, `mise run test:e2e`,
`mise exec -- pnpm exec playwright test tests/e2e/uniprot-structure.spec.ts`,
`git diff --check`, and `git status --short`.

The M70 aggregate gate runs the command matrix in
`spec/ui-interaction-modernization-plan.md` from `prototype/`. Its browser
evidence combines focused behavioral probes (to retain exact native-event and
owner assertions) with `tests/e2e/ui-interaction-modernization.spec.ts`, which
checks every case-study chooser mode, actual Nightingale viewport chrome, and
the forced-colors/reduced-motion/narrow-width/zoom shell. Results are pending
the final independent review checkpoint. The implementer run passed `mise
install --locked`, offline frozen install, `check:p80`, `check`, `test` (24
files / 197 tests), `build`, and `test:e2e` (33 application tests, plus 1
P01B, 22 P20, 6 P30, and 1 P40 browser probes), followed by the single-Mol*
and local-Nightingale dependency listings and `git diff --check`.
The final reconciliation additionally passed the exact accepted-replay failure
lineage unit matrix and focused `renderer-portability`, `complex`, and P01
browser tests (9 browser probes); the Nightingale complex test verifies the
declared `links`-to-`markers` diagnostic and both named endpoint roles/loci.
