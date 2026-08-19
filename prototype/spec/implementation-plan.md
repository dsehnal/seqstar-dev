# Seq* Prototype Implementation Plan

Status: proposed handoff plan

This plan implements the specifications through repeated
**Orchestrator → Implementer → Reviewer → Orchestrator/Reconciler** cycles. The
orchestrator owns the integrated result and may not mark a work packet complete
solely from an implementer's report.

## 1. Objective and definition of done

Implement a self-contained workspace under `prototype/` containing:

- the scoped Seq* base library and SeqViewSpec implementation;
- an event-driven application harness with plugin composition and coordinate
  translation;
- the migrated reference sequence viewer;
- vendored, locally editable Nightingale plus its wrapper;
- Mol* and MolViewSpec through one pinned `molstar` npm dependency plus wrapper;
- the required renderer-portability, UniProt/structure, complex, and
  alignment/structure pages;
- deterministic offline fixtures, diagnostics, and automated verification.

The prototype is done when every required acceptance criterion in the component
specifications and case studies is verified, all workspace checks pass, and an
independent final reviewer finds no unresolved blocking or high-severity defect.
The nucleotide/protein page is a stretch deliverable and does not block done.

## 2. Initial physical workspace

The publication architecture remains modular, but the prototype starts with a
limited number of physical packages:

```text
prototype/
  apps/
    web/                         @seq-star/prototype-web
  packages/
    seq-core/                    @seq-star/seq-core
      src/{data,model,io,algorithm}/
    seq-coords/                  @seq-star/seq-coords
    seq-view-spec/               @seq-star/seq-view-spec
    seq-viewer/                  @seq-star/seq-viewer
    harness-core/                @seq-star/harness-core
    harness-react/               @seq-star/harness-react
    wrapper-seq-viewer/          @seq-star/wrapper-seq-viewer
    wrapper-nightingale/         @seq-star/wrapper-nightingale
    wrapper-molstar/             @seq-star/wrapper-molstar
    integration-plugins/         @seq-star/integration-plugins
  vendor/
    nightingale/
  fixtures/
  tests/e2e/
  spec/
  .mise.toml
  biome.jsonc
  package.json
  pnpm-workspace.yaml
  tsconfig.json
```

`seq-data`, `seq-model`, `seq-io`, and `seq-algorithm` remain explicit source
modules and public subpath exports inside `seq-core` until independent package
versioning or dependency needs justify a split. This avoids monorepo ceremony
without collapsing architectural boundaries.

## 3. Multi-agent operating model

### 3.1 Roles

For each packet the orchestrator issues one bounded handoff. One implementer
owns the packet end-to-end. After the implementation stops changing, a reviewer
independently reads the original specifications and actual diff. The
orchestrator reconciles every finding, delegates fixes if needed, reruns the
verification gate, and records completion.

Agents share a working tree. Parallel implementers are allowed only for packets
listed as parallel-safe and only with disjoint path ownership. Shared root files
(`package.json`, lockfile, workspace config, TypeScript references, Biome
config) have one orchestrator-appointed owner at a time.

Implementers do not commit unless the orchestrator explicitly asks. The
orchestrator creates reviewed checkpoint commits after reconciliation.

### 3.2 Required implementer report

```text
Files changed:
- ...

Implementation summary:
- ...

Verification run:
- command: result

Acceptance criteria:
- criterion: evidence

Uncertainties or risks:
- ...
```

### 3.3 Required reviewer report

The reviewer receives the packet objective, relevant specs, acceptance
criteria, and commit/diff range—not the implementer's narrative as the primary
source. Findings use:

- **Blocking**: cannot integrate; violates a core requirement or cannot build;
- **High**: incorrect behavior, architecture violation, data error, leak, or
  missing required test;
- **Medium**: maintainability, incomplete edge case, or weak verification;
- **Low**: non-blocking clarity or cleanup.

Every finding names files/lines, evidence, and a concrete fix. “Looks good” is
not sufficient; a no-findings review lists requirements and tests inspected.

### 3.4 Reconciliation record

For every reviewer finding, the orchestrator records `accepted`, `rejected with
reason`, or `deferred with explicit non-blocking rationale`. Blocking and high
findings cannot be deferred from a required packet.

## 4. Global constraints

- All new implementation files live under `prototype/`.
- `legacy/seq-star-workspace` is read-only source material during implementation.
- Preserve useful legacy algorithms, but port them behind the new contracts;
  do not copy the legacy application architecture wholesale.
- Use the pinned `molstar` npm package for Mol*, MVS builders/types, validation,
  and loading. Do not vendor Mol*, install a separate MVS implementation, or
  allow multiple Mol* versions.
- Vendor Nightingale as ordinary source with upstream commit, license, and
  local patch log.
- No new dependency without orchestrator approval and a documented need.
- Required browser behavior works without runtime network access.
- Avoid unrelated refactors and generated-file churn.
- Tests assert biological identities/loci and message chains, not fragile DOM
  layout or pixel identity.

## 5. Verification gates

Once scaffolded, these root commands are canonical:

```text
mise run check       Biome + TypeScript + schema/example validation
mise run test        all Vitest unit and contract tests
mise run build       package declarations + production web build
mise run test:e2e    required offline Playwright cases
```

Each packet runs focused package tests plus every applicable global gate.
`pnpm install --frozen-lockfile` must work after dependency-changing packets.

## 6. Work packets

### P00 — Toolchain and workspace scaffold

Objective: create the reproducible empty workspace and verification skeleton.

Scope:

- root tooling files under `prototype/`;
- package directories/manifests and TypeScript references;
- minimal Vite/React/TanStack/Tailwind shell;
- Vitest and Playwright configuration;
- mise tasks and root scripts.

Acceptance:

- exact Node, pnpm, Biome, TypeScript, and dependency versions are pinned;
- `mise install`, frozen install, check, test, build, and an empty browser smoke
  test run successfully;
- dependency direction can be typechecked with placeholder public entry points;
- TanStack Router plugin order and generated-file exclusions are correct;
- no legacy root package file is reused accidentally.

Review emphasis: reproducibility, package boundaries, duplicate dependencies,
and whether commands work from `prototype/` on a clean checkout.

### P01 — External integration and fixture feasibility gate

Objective: remove external uncertainty before building around guessed APIs or
unusable data.

This packet has three parallel-safe investigations after P00, each producing a
small executable spike or fixture manifest. They may use separate implementers
with one reviewer covering the combined gate.

#### P01a — Nightingale vendoring spike

- choose and record an exact upstream commit;
- inspect package dependencies and select the smallest source subset that can
  render sequence, feature/block, marker, and value tracks;
- integrate selected local packages into pnpm without relying on upstream Yarn
  or Lerna at runtime;
- render one local component in the web shell;
- identify necessary source patches for external highlight, stable IDs,
  readiness, and disposal;
- create `UPSTREAM.md`, retain licenses, and start `PATCHES.md`.

Gate: local-source Nightingale builds in the pinned toolchain and the dependency
graph contains no registry duplicate.

Upstream: [ebi-webcomponents/nightingale](https://github.com/ebi-webcomponents/nightingale).

#### P01b — Mol* + MVS npm spike

- pin one `molstar` npm version;
- identify its supported MVS builder/type, validation, and load entry points;
- load a tiny checked-in structure from a minimal MVS document;
- prove native residue hover extraction and imperative highlight/clear APIs;
- document any browser-worker or asset configuration required by Vite.

Gate: a production build works and the dependency graph contains one Mol*
version and no separate MVS package.

The selected APIs must come from the `molstar` package's supported MVS surface;
the upstream implementation currently lives under
[`src/extensions/mvs`](https://github.com/molstar/molstar/tree/master/src/extensions/mvs).

#### P01c — Fixture pack

- select exact fixtures for all four required cases;
- verify redistribution terms and record source/version/retrieval metadata;
- keep structure and alignment inputs small enough for repository and browser
  use;
- ensure UniProt data has rich annotations plus mapped and unmapped intervals;
- ensure complex data has two polymers/chains and relationship endpoints;
- ensure the MSA has 20–50 members, gaps, and one structure-linked member;
- add checksums and clearly label synthetic values.

Candidates to verify and freeze during this gate:

| Case | Candidate | Required feasibility proof |
| --- | --- | --- |
| Renderer portability | UniProt TP53 `P04637` | normalized rich tracks, zoomable 393-aa sequence, renderer capability probe |
| UniProt + structure | `P04637` with PDB `1TUP`, one explicit p53 chain | exact construct/chain mapping, mapped and unmapped annotations, missing/label/auth numbering audit |
| Multi-polymer complex | PDB `1BRS`, barnase chain A + barstar chain D | exact precursor/mature offsets and mutations, deterministic contact rule, synthetic confidence label |
| Alignment + structure | deterministic 32-row subset of AFDB `P69905` A3M with PDB `1A3N` | A3M license/normalization/downsampling, visible gaps, query identity, exact chain mapping |

If the AFDB A3M cannot be redistributed cleanly or normalized within budget,
use a verified PF00042/CC0 subset containing the structure-linked member. Do
not invent or silently substitute data.

Primary candidate records: [UniProt P04637](https://www.uniprot.org/uniprotkb/P04637/entry),
[PDB 1TUP](https://www.rcsb.org/structure/1TUP),
[PDB 1BRS](https://www.rcsb.org/structure/1BRS),
[UniProt P69905](https://www.uniprot.org/uniprotkb/P69905/entry), and
[PDB 1A3N](https://www.rcsb.org/structure/1A3N). Provenance review uses the
[UniProt license](https://www.uniprot.org/help/license/),
[RCSB PDB usage policy](https://www2.rcsb.org/pages/usage-policy), and the
[AlphaFold DB license](https://alphafold.ebi.ac.uk/assets/License-Disclaimer.pdf).

Gate: each case has an approved `metadata.json`, raw input inventory, mapping
strategy, and size budget. Fixture transformation may follow in later packets.

P01 is a stop/go gate. The orchestrator adjusts wrapper mappings or fixture
details in the specs before downstream implementation if a spike disproves an
assumption.

### P02 — Shared contract freeze

Objective: turn cross-package prose into compileable public API skeletons and
golden contract tests before agents work independently.

Scope:

- confirm the physical package graph and one-way ownership of diagnostics,
  serialized DTOs, runtime models, and coordinate types;
- complete message schema registry, component/plugin factory, processor,
  capability, dynamic-coordinate-space, and async startup interfaces;
- freeze JSON-safe message rules and the capability-name grammar;
- freeze owner-scoped interaction apply/clear semantics;
- define FIFO/reentrancy, lifecycle generation/state transitions, late native
  completion, and adapter-specific first-frame hooks;
- freeze canonical coordinate-space equality, wildcard/path/composition/error
  semantics and golden mapping examples;
- define active SeqViewSpec document projection and RFC 8785/SHA-256 digests;
- prove TypeScript references and Vite source consumption through one minimal
  package-to-app import.

Acceptance:

- every public symbol referenced by the component specs has one owning package
  and a compiling declaration;
- golden tests describe message, lifecycle, translation, interaction-owner,
  capability, and digest behavior;
- no package cycle exists;
- reviewer can assign P10–P22 paths without shared-contract ambiguity.

P02 is an orchestrator-owned freeze point. Later packets propose contract
changes for reconciliation rather than editing shared exports opportunistically.

### P10 — Seq* model and coordinate foundation

Objective: implement `seq-core` and `seq-coords` without UI dependencies.

Scope:

- result/diagnostic and normalized model primitives;
- coordinate spaces, numeric/label loci, bounds helpers;
- translator interfaces, mapping associations, and result composition;
- identity, explicit alignment/member, table-driven structure, and reverse
  translator algorithms;
- FASTA/aligned-FASTA/A3M normalization needed by approved fixtures;
- consensus and conservation helpers.

Acceptance:

- exact/partial/ambiguous/unmapped and one-to-many tests pass;
- alignment gap and reverse-mapping tests pass;
- composition preserves original source associations and path IDs;
- algorithms are deterministic and record policy/provenance;
- packages have no React, harness, Mol*, or Nightingale imports.

Review emphasis: coordinate conventions, loss of ambiguity/provenance, reverse
assumptions, mutation, and cross-package dependency leaks.

### P11 — SeqViewSpec schema, builder, and validator

Objective: make `seq-view-spec.md` executable as the single portable document
contract.

Scope:

- TypeBox schema and inferred TypeScript types;
- JSON Schema draft 2020-12 export;
- semantic validator with stable codes and JSON Pointer paths;
- thin builder, deterministic color evaluator, and RFC 8785/SHA-256 digest;
- examples for single protein, multi-polymer, relationship, and alignment;
- invalid fixture corpus.

Acceptance:

- every normative 0.1 invariant has a positive or negative test;
- generated schema is deterministic and checked in or reproducibly generated;
- all spec examples validate;
- unknown core fields fail while namespaced extensions behave as specified;
- no harness or renderer dependency exists.

Review emphasis: mismatch between prose/schema/types, incomplete discriminated
unions, cross-reference validation, fallback compatibility, and bounds.

### P12 — Harness core

Objective: implement messages, plugins, routing, translators, and interaction
synchronization independently of real visualizers.

Scope:

- TypeBox message schemas and event fabric;
- component/plugin registries and transactional lifecycle;
- routing policies and processor isolation;
- translator graph and deterministic path selection;
- synchronization service and loop prevention;
- mock components/translators for contract tests.

Acceptance:

- invalid messages do not terminate the fabric;
- latest/ordered/animation-frame policies behave under rapid input;
- setup rollback and reverse disposal are verified;
- path tie-breaking and abort behavior are deterministic;
- bidirectional hover/selection works with no echo;
- a mock third visualizer registers without core changes.

Review emphasis: RxJS completion/error behavior, reentrancy, cancellation races,
subscription leaks, loop-prevention correctness, and hidden global state.

### P20 — Reference viewer migration

Objective: port reusable legacy canvas code into `@seq-star/seq-viewer` behind
the new SeqViewSpec and provider contracts.

Scope:

- legacy coordinate/rendering/viewport code selected after inspection;
- representation provider registry;
- sequence, alignment, blocks, markers, bars, heatmap, swatch, and links;
- imperative highlight/selection and native interaction stream;
- resizing, virtualization/clipping, accessibility, and disposal;
- focused browser component harness.

Acceptance:

- every required representation renders a validated document;
- hit-testing returns stable IDs and exact loci;
- gaps and multi-segment gaps never create false positions;
- applied interactions do not emit native interactions;
- repeated mount/resize/dispose has no duplicate listeners;
- no legacy React demo or old spec model leaks into the public API.

Review emphasis: off-by-one errors, DPR/resize, canvas hit testing, listener
cleanup, mutation of documents, and over-porting legacy code.

### P21 — Harness React adapter, web shell, and diagnostics

Objective: provide the page-scoped host and make architecture behavior visible.

Scope:

- harness provider/hooks and component host registration;
- final route shell and lazy case routes;
- visualizer panel/error/loading components;
- event diagnostics, correlation view, mapping view, and document inspector;
- route disposal tests.

Acceptance:

- harness instances are page-scoped and disposed before host removal;
- diagnostics safely display serializable messages and generated documents;
- rapid hover traffic is summarized without hiding ordered events;
- page code contains no coordinate mapping or viewer-to-viewer calls;
- keyboard navigation and basic responsive panel layout pass browser checks.

Parallelism: P20 and P21 may run in parallel after P12 if they do not modify
shared root config or harness public types. The orchestrator integrates them
before P22.

### P22 — Reference-viewer wrapper and first vertical slice

Objective: connect the reference viewer to the harness and prove lifecycle plus
interaction contracts before adding external visualizers.

Scope:

- common wrapper test kit;
- reference-viewer wrapper;
- fixture-provider and identity translator plugin foundations;
- one reference-only diagnostic route.

Acceptance:

- request validation, accepted/rendered/failed/superseded lifecycle works;
- latest request wins visibly;
- native and applied interaction directions are distinct;
- disposal removes every subscription;
- wrapper contract tests can be reused by Nightingale and Mol* wrappers.

### P30 — Nightingale wrapper and renderer-portability case

Objective: complete required case 1 using vendored Nightingale.

Scope:

- approved generic Nightingale patches and patch log;
- SeqViewSpec-to-Nightingale representation mapping;
- stable identity table, lifecycle readiness, interactions, and commands;
- renderer-portability plugin/page and capability comparison;
- offline Playwright case.

Acceptance: every criterion in case study 1 passes, both wrappers consume the
same document/digest, fallbacks are explicit, and hover/selection synchronize
in both directions without flicker or echo.

Review emphasis: accidental registry imports, invasive/domain-specific vendor
patches, unstable DOM identity, cleanup, and silently dropped layers.

### P40 — Mol* wrapper

Objective: turn the P01b spike into a production wrapper consuming MVS requests
from the harness.

Scope:

- MVS validation/loading from the pinned `molstar` package;
- latest-request replacement and first-frame lifecycle;
- normalized structure locus extraction;
- imperative highlight/selection/focus and clear;
- common wrapper contract tests and a small offline wrapper route.

Acceptance:

- one Mol*/MVS dependency exists;
- wrapper has no UniProt, SeqViewSpec, SIFTS, or AF-specific generation logic;
- native and applied interactions are loop-free;
- unrelated structure commands diagnose rather than guess;
- replacement, resize, and repeated disposal browser tests pass.

Parallelism: P30 and P40 are parallel-safe after P22 if vendor and wrapper paths
remain disjoint. Lockfile changes are reconciled by the orchestrator.

### P41 — UniProt/structure vertical slice

Objective: implement required case 2 end to end.

Scope:

- normalized approved UniProt/structure fixtures and mapping tables;
- forward/reverse structure translator plugin;
- track-activation intent bridge;
- UniProt annotation-to-MVS generator using APIs from pinned `molstar`;
- page, MVS inspector/download, mapping summary, and Playwright flow.

Acceptance: every case 2 criterion passes, including partial/unmapped handling,
deterministic colors, inspectable valid MVS before loading, latest activation
replacement, and bidirectional mapped hover.

Reviewer independently compares generated MVS selectors/colors against fixture
mapping tables; it does not rely only on the Mol* screenshot.

### P50 — Multi-polymer complex vertical slice

Objective: implement required case 3 without introducing special-case core
logic.

Scope:

- approved two-polymer fixture and provenance;
- per-chain translators;
- confidence, interface, and relationship annotations;
- interface/contact MVS generation;
- page and Playwright flow.

Acceptance: every case 3 criterion passes, chain identity never follows display
order, endpoint roles survive, multi-chain selectors validate, and synthetic
values are conspicuously labeled.

### P60 — Alignment/structure vertical slice

Objective: implement required case 4 using composed translators.

Scope:

- normalized 20–50-member alignment fixture;
- consensus/conservation tracks;
- alignment row virtualization;
- column/member and member/structure translator composition;
- page and Playwright flow.

Acceptance: every case 4 criterion passes, gaps remain unmapped, stable row IDs
survive virtualization, and diagnostics prove a two-step path rather than a
case-specific shortcut.

Parallelism: P50 and P60 may run in parallel after P41 only if fixture, plugin,
route, and test files are disjoint. Changes to shared plugin APIs are proposed
to the orchestrator rather than made concurrently.

### P70 — Nucleotide/protein stretch slice

Start only after all required gates pass. Implement explicit strand/phase/
offset translators, independent sequence viewers, codon reverse mapping, and
the optional continuation to structure. This packet is reviewed normally but
cannot delay required hardening.

### P80 — Integrated hardening and final review

Objective: verify the repository as a product rather than a collection of
passing package tests.

Scope:

- dependency and license inventory;
- Nightingale upstream/patch audit;
- fixture provenance/checksum audit;
- clean-checkout install/build/test;
- full offline Playwright suite and repeated navigation/rapid interaction runs;
- bundle/dependency duplicate inspection;
- documentation links and run instructions;
- final requirements traceability matrix.

The final gate explicitly verifies:

- one pinned `molstar` version supplies both viewer and MVS APIs, with no
  separate MVS dependency or vendored Mol* source;
- all Nightingale imports resolve to the recorded vendor tree;
- generated JSON Schema matches its committed artifact;
- late request completion cannot surface an old generation;
- owner-scoped clears and repeated bidirectional reflection do not erase or
  echo unrelated state;
- dependency-boundary checks find no cycles, legacy imports, or direct
  viewer-to-viewer wiring;
- Playwright blocks every non-loopback request;
- repeated navigation has stable subscription and message counts;
- fixture rights, hashes, transformations, and synthetic labels are complete.

Final reviewer works from all specifications, case studies, and the complete
diff. The orchestrator resolves all blocking/high findings, reruns all gates,
and signs off each row in the traceability matrix.

## 7. Dependency and concurrency map

```text
P00
 └─ P01a / P01b / P01c  (parallel feasibility gate)
     └─ P02  (shared contract freeze)
         └─ P10
             └─ P11
                 └─ P12
                     └─ P20 / P21  (parallel, then reconcile)
                         └─ P22
                             └─ P30 / P40  (parallel, then reconcile)
                                 └─ P41
                                     └─ P50 / P60  (conditional parallelism)
                                         ├─ P70 (optional)
                                         └─ P80
```

P10, P11, and P12 run sequentially because they establish shared contracts.
P20/P21 and P30/P40 are the best implementation parallelism points. Earlier
parallelism risks contract churn; later parallelism risks shared integration
conflicts.

## 8. Standard task handoff

```text
Objective:
<one work packet outcome>

Relevant context:
- normative specs: <exact files/sections>
- prerequisite checkpoint: <commit>
- existing implementation patterns: <paths>

Scope:
- owned paths: <explicit paths>
- allowed shared files: <explicit files or none>
- out of scope: <adjacent packets>

Constraints:
- preserve reviewed public contracts unless escalation is approved
- follow workspace conventions
- avoid unrelated refactors
- no new dependency without approval
- do not commit unless requested

Acceptance criteria:
- <copied, testable packet criteria>

Verification:
- <focused unit/contract/browser commands>
- mise run check
- applicable global gates

Return:
- files changed
- implementation summary
- tests/checks run with results
- acceptance evidence
- uncertainties or risks
```

## 9. Orchestrator checkpoint record

After each packet, record in the task log:

```text
Packet:
Implementer:
Reviewer:
Prerequisite commit:
Diff/commit reviewed:
Verification evidence:
Findings and disposition:
Acceptance criteria status:
Checkpoint commit:
Remaining risks:
```

The new orchestrator session should begin by reading all component specs and
this plan, verifying the specification checkpoint commit, and starting P00. It
must not reinterpret “done” from the plan summary alone.
