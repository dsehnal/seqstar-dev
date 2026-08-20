# Requirements traceability matrix

Status values are evidence-based through the reviewed P80 clean-worktree gate.
P80 was independently reviewed after reconciliation, then verified from an
exact detached checkout using the pinned offline toolchain and full browser
matrix.
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
| MVS-01 | MolViewStory evidence is decoded by inflating before MessagePack decoding, using the single pinned Mol* runtime | `spec/mvs-features.msgpack`; `scripts/read-mvs-story.mjs`; `molviewspec-improvements.md` | `pnpm run inspect:mvs-story`, `check:p80` | reviewed checkpoint `84babdb` |
| MVS-02 | selector-scoped semantic colors use deterministic one-cartoon presentation, not per-residue geometry | `mvs-presentation.ts`; `mvs-presentation.test.ts` | focused Vitest, `test` | reviewed checkpoint `46a14ea` |
| MVS-03 | all P04637 profiles retain one cartoon; mapped sparse sites additionally use bounded selector-colored ball-and-stick detail, while 196 mapped AlphaMissense-like selectors retain exact colors without added geometry | `uniprot-structure.ts`; `uniprot-structure.test.ts`; `molviewspec-hardening.test.ts`; `uniprot-structure.spec.ts`; `molviewspec-improvements.spec.ts` | focused Vitest/Playwright, `test`, `test:e2e` | reviewed baseline `3f641db`; sparse-detail follow-up |
| MVS-04 | 1BRS interface and contact preserve two cartoons plus one bounded selector-colored atomic-detail representation per polymer role; contact alone adds a union focus | `complex.ts`; `complex.test.ts`; `molviewspec-hardening.test.ts`; `complex.spec.ts`; `molviewspec-improvements.spec.ts` | focused Vitest/Playwright, `test`, `test:e2e` | reviewed baseline `16efb27`; interface-detail follow-up |
| MVS-05 | P69905/1A3N remains one neutral cartoon with no static annotation geometry; all revised request profiles are structurally counted and browser-exercised offline | `alignment-structure.ts`; `molviewspec-hardening.test.ts`; `alignment-structure.test.ts`; `molviewspec-improvements.spec.ts`; `hardening.spec.ts` | `mise exec -- pnpm exec vitest run packages/integration-plugins/src/molviewspec-hardening.test.ts`; `mise exec -- pnpm exec playwright test tests/e2e/molviewspec-improvements.spec.ts`; final commands below | independently reviewed G40 checkpoint |
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
| FUTURE-01 | EMDB/tomogram third-visualizer validation | `spec/case-studies.md` | none | future, not prototype scope |

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
