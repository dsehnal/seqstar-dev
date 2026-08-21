# Prototype Web Application Specification

Status: prototype specification draft

The web application is a Vite/React host demonstrating the component contracts.
It composes routes, harness instances, visualizer hosts, fixtures, and
diagnostics. It is not the location of biological integration logic.

## 1. Technology

- Vite and React 19;
- Tailwind CSS 4 through the Vite plugin;
- TanStack Router with file-based, code-split routes;
- the `harness-react` lifecycle adapter;
- Playwright for browser acceptance.

The TanStack Router Vite plugin runs before the React plugin. Generated route
tree code is excluded from Biome formatting and is never manually edited.

## 2. Routes

```text
/                         prototype overview and architecture
/renderer-portability     Seq* reference viewer plus Nightingale
/uniprot-structure        Nightingale plus Mol*
/complex                  Seq* multi-polymer viewer plus Mol*
/alignment-structure      Seq* alignment viewer plus Mol*
/nucleotide-protein       stretch case, hidden when not implemented
```

Each case-study route is lazy-loaded and creates one page-scoped harness. Route
unmount disposes that harness before visualizer host elements are removed.

## 3. Page composition

Each case page contains:

- a short user story and interaction instructions;
- visualizer panels with stable component IDs;
- loading, unsupported, and failure states derived from lifecycle messages;
- controls that publish intents or visualization requests through the harness;
- an optional diagnostics drawer;
- fixture provenance and a clear synthetic-data label where applicable.

The app may choose responsive panel arrangement. It MUST keep both participating
visualizers usable at the prototype's supported desktop viewport and provide a
stacked layout at narrower widths.

Page components MUST NOT:

- call another visualizer from an interaction handler;
- translate biological coordinates;
- build MVS residue selectors or SeqViewSpec annotations;
- subscribe directly to another wrapper's native events;
- maintain a duplicate cross-view selection store.

## 4. Harness construction

Every page declares an `ApplicationHarnessSpec` plus host-registered factories
and plugin specs. A typical page performs:

```text
create harness
  -> register component host elements
  -> install plugins and translators
  -> start wrappers
  -> publish initial visualization requests
  -> render ready state
```

Construction failures appear in the page error state with diagnostics. Initial
requests are not published until their target components are registered; the
harness may retain the latest request while a component finishes starting.

## 5. Diagnostics drawer

The drawer is a prototype verification tool, not part of SeqViewSpec. It shows:

- chronological message type, source, target, and timestamp;
- correlation and causation chains;
- visualization lifecycle and degradation results;
- mapping path, per-locus status, and diagnostics;
- active document/view IDs for each wrapper;
- plugin and component capabilities;
- a validated JSON view/download action for generated SeqViewSpec and MVS.

Hover traffic is summarized or sampled so it does not make the drawer unusable.
Selections, intents, requests, failures, and mapping results are retained for
the page session. The drawer sanitizes all rendered text and does not render raw
HTML from payloads.

Retention is bounded: keep only the latest hover per source/target pair and at
most 2,000 non-hover messages per page, evicting oldest first. Full sequence and
structure payloads are represented by IDs, digests, sizes, and explicit
on-demand inspection rather than duplicated into every log row. Config and
payload fields matching credential/token patterns are redacted.

## 6. Fixture layout

```text
prototype/fixtures/<case-id>/
  metadata.json
  input/
  mappings/
  expected/
```

`metadata.json` records:

- case ID and title;
- origin URLs and retrieval dates;
- source licenses or usage terms;
- upstream identifiers and versions;
- transformations applied;
- file checksums;
- whether values are real, transformed, or synthetic.

`expected/` may contain validated SeqViewSpec, generated-MVS, mapping-summary,
or algorithm snapshots. Binary structure files remain small enough for local
browser tests and retain required attribution.

## 7. Case-specific UI

### 7.1 Renderer portability

Show the reference viewer and Nightingale side by side with one shared document
summary. A capability comparison identifies exact and fallback layers. User
instructions call out bidirectional hover and selection.

### 7.2 UniProt and structure

Show Nightingale and Mol* plus an annotation-track explanation. Track-header
activation is the primary action. The generated MVS inspector and mapping
summary remain available without opening developer tools.

### 7.3 Complex

Show the multi-polymer reference view and Mol*. Clearly identify polymer/chain
colors, confidence provenance, interface roles, and any synthetic contacts.

### 7.4 Alignment and structure

Give the alignment panel enough vertical space to demonstrate row
virtualization. Identify the structure-linked member. Diagnostics expose the
alignment-column to sequence to structure mapping path.

### 7.5 Nucleotide/protein

When implemented, show independent nucleotide and protein visualizer instances
and expose strand/phase/offset in diagnostics. When not implemented, omit the
route from navigation rather than displaying a nonfunctional mock.

## 8. Accessibility and usability

- Route navigation and track-header actions are keyboard accessible.
- Visualizer panels have accessible names and visible focus treatment.
- Color is not the sole carrier of mapping or error status.
- Diagnostics tables support keyboard scrolling and copyable text.
- Loading does not cause large layout shifts.
- Reduced-motion preference disables nonessential transitions.
- Errors say which component/request failed and offer a retry when meaningful.

The prototype is desktop-first; full mobile optimization is not required.

## 9. Browser-test contract

Playwright tests use stable `data-testid` attributes only for application and
wrapper interaction boundaries. They do not depend on incidental Tailwind
classes or generated DOM structure inside vendored components.

Required tests:

1. each required route loads offline from checked-in fixtures;
2. visualizer lifecycle reaches rendered or declared degraded state;
3. hover/selection synchronization works in both directions;
4. clear events remove reflected highlights;
5. rapid visualization requests leave only the last request visible;
6. UniProt track activation emits intent, mapping summary, MVS request, and Mol*
   rendered lifecycle with one correlation chain;
7. alignment gaps never fabricate member sequence positions;
8. route navigation disposes subscriptions and remounting does not duplicate
   messages;
9. generated SeqViewSpec/MVS downloads parse and validate;
10. diagnostics never expose unserializable native objects.

Tests use screenshots only for coarse layout/regression checks. Biological
correctness is asserted through IDs, loci, mapping summaries, and lifecycle
messages rather than fragile pixel comparison.

Required offline tests abort on any non-loopback network request. Structure,
worker, font, and other visualizer assets are served from the built app origin.

## 10. Build and offline behavior

`pnpm --filter @seq-star/prototype-web build` produces a static application. Required
case-study behavior works without runtime network access. Large optional remote
variants must be visibly separate and cannot determine test success.

Production bundles MUST resolve Nightingale from `prototype/vendor/nightingale`
and Mol* from the pinned workspace dependency. Source maps may be emitted for
prototype diagnostics but must not embed private data.

## 11. Acceptance criteria

The app conforms when all required routes implement their case-study acceptance
criteria, architecture-relevant message chains are inspectable, no page owns
cross-view glue logic, offline Playwright tests pass, and repeated navigation
does not leak or duplicate component behavior.
