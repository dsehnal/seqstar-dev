# Seq* Prototype Technology Baseline

Status: proposed baseline for specification and planning

This document records the foundational technology choices for the prototype.
Versions are pinned exactly when implementation begins so that `mise install`
and `pnpm install --frozen-lockfile` reproduce the same environment.

## 1. Accepted project choices

| Concern | Choice | Notes |
| --- | --- | --- |
| Runtime management | mise | Owns the Node and pnpm versions and exposes common repository tasks. |
| JavaScript runtime | Latest Node release | Resolve the current release at setup time and record the exact version in `.mise.toml` and `mise.lock`; do not leave `latest` floating. |
| Workspace/package manager | pnpm | One workspace and one lockfile; internal dependencies use `workspace:*`. |
| Formatting and linting | Biome | Replaces ESLint and Prettier for repository-owned TypeScript, JavaScript, JSON, and CSS where supported. |
| Example application | Vite + React | Multi-page behavior is implemented as client-side routes in one prototype app. |
| Styling | Tailwind CSS | Used by the example application and diagnostics UI, not imposed on renderer packages. |
| Routing | TanStack Router | File-based routes, typed navigation, and route-level code splitting for the case-study pages. |

As of 2026-08-19, the latest Node release is v26.7.0. The implementation
should resolve and pin the latest release available when scaffolding starts. If
vendored Nightingale or another required dependency proves incompatible with
that runtime, the exception and the selected fallback must be recorded rather
than silently changing the policy.

## 2. Recommended base libraries

### TypeScript 6 in strict mode

Use TypeScript 6 for all new packages, with strict checking and project
references. TypeScript 7 is available, but its first release intentionally does
not include the programmatic TypeScript API used by some tooling. TypeScript 6
is the lower-risk baseline while vendoring an existing codebase. Re-evaluate
TypeScript 7 after the Nightingale compatibility pass.

Library packages should emit ESM and declarations with `tsc -b`. Vite is the
application builder, not a required build abstraction for every library. Add a
publishing-oriented bundler only if the prototype later needs distributable
single-file artifacts.

### RxJS for the harness event fabric

Use RxJS for typed harness messages, subscriptions, cancellation, and routing
policies:

- wrappers and plugins receive read-only `Observable` streams;
- the harness owns subjects and message publication;
- `switchMap` implements latest-only visualization requests;
- filtering and grouping implement targeted routes;
- throttling or animation-frame scheduling coalesces high-frequency hover
  events;
- subscription ownership gives every component a clear disposal boundary.

The public contract remains the versioned, serializable message envelope—not
RxJS subjects. This preserves the option to bridge the fabric to Web Workers,
iframes, or another transport later. No second event-emitter library is needed.

### TypeBox for schema-first contracts

Use TypeBox 1.x to define SeqViewSpec, harness envelopes, event payloads, and
application composition documents. It produces standard JSON Schema while
also deriving TypeScript types, which makes JSON interchange a first-class
output rather than an afterthought.

Use JSON Schema draft 2020-12 and the TypeBox schema compiler for runtime
validation. Do not add Zod or Ajv initially. Reconsider Ajv only if
interoperability or validation-performance measurements expose a concrete need.

Schema packages must remain free of React, RxJS, renderers, and harness runtime
imports.

### Vitest and Playwright for verification

Use Vitest for schema, algorithm, mapping, translator-composition, event-route,
and wrapper-contract unit tests. Use Playwright for the cross-viewer case
studies in a real browser, especially canvas interactions, Web Components,
Mol*, navigation, disposal, and feedback-loop checks.

Avoid making DOM emulation the primary integration-test environment. A real
browser is the useful boundary for Nightingale and Mol* behavior. Small React
component tests can be added only where they provide value beyond the
Playwright cases.

## 3. Example application conventions

The prototype app uses:

- React 19;
- Vite;
- Tailwind CSS through its Vite plugin;
- TanStack Router with file-based routing;
- one lazy route for each case study;
- React context only to expose the current harness instance and page-scoped
  services to React components.

The TanStack Router Vite plugin must run before the React plugin. Generated
`routeTree.gen.ts` is ignored by Biome and is not manually edited.

The example app owns layout, navigation, fixture selection, and the optional
event diagnostics drawer. It must not implement coordinate translation,
cross-view synchronization, or direct viewer-to-viewer event wiring.

Do not add a global React state library. Visualizers own their local state and
the harness owns cross-component messages. Do not add TanStack Query until a
case study actually requires remote caching or request lifecycle management;
the accepted prototype cases use deterministic checked-in fixtures.

## 4. Workspace and package conventions

The new implementation is a self-contained workspace rooted at `prototype/`.
The repository-level `legacy/` directory is reference material and is not part
of this pnpm workspace:

```text
prototype/
  .mise.toml
  mise.lock
  biome.jsonc
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  tsconfig.json
  apps/
    web/
  packages/
    seq-core/
    seq-coords/
    seq-view-spec/
    seq-viewer/
    harness-core/
    harness-react/
    wrapper-seq-viewer/
    wrapper-nightingale/
    wrapper-molstar/
    integration-plugins/
  vendor/
    nightingale/
  fixtures/
  tests/
    e2e/
  spec/
```

The web application package is named `@seq-star/prototype-web`.
The `seq-core` package keeps `data`, `model`, `io`, and `algorithm` as explicit
source modules and public subpath exports for the prototype; they can split into
physical packages later without changing their architectural boundaries.

This is a planning baseline, not a requirement to create a package for every
concept on day one. Closely related lower-level Seq* modules may start together
and split only when their dependency boundaries are demonstrated.

Workspace rules:

- packages are ESM-only;
- `exports` explicitly expose supported entry points;
- package dependencies are declared at the package that imports them;
- internal package versions use `workspace:*`;
- TypeScript project references express build order;
- pnpm recursive commands and filters are sufficient for the prototype—do not
  add Turborepo or Nx;
- the vendored Nightingale source is an ordinary workspace package, isolated
  behind its wrapper and tracked in this repository.

## 5. Tooling policy

`mise` is the human-facing entry point, while package scripts remain the
composable workspace primitives. The `prototype/` workspace root should expose
these operations:

| Operation | Purpose |
| --- | --- |
| `mise run install` | Install the pinned Node/pnpm toolchain and workspace dependencies. |
| `mise run dev` | Start the prototype application. |
| `mise run build` | Build referenced libraries and the example app. |
| `mise run check` | Run Biome, TypeScript checks, and schema checks. |
| `mise run test` | Run Vitest across the workspace. |
| `mise run test:e2e` | Run Playwright case-study tests. |

Pin Biome exactly, as its own installation guidance recommends, and commit its
configuration. The repository should have one canonical formatting and linting
configuration; vendored source may receive narrowly documented overrides where
an immediate bulk rewrite would obscure its provenance.

## 6. Deliberately omitted dependencies

Do not add these without a demonstrated need:

- Redux, Zustand, or another application-wide state store;
- a second event emitter alongside RxJS;
- a generic graph library for coordinate-translator path resolution;
- Lodash for new implementation code;
- UUID libraries where `crypto.randomUUID()` is sufficient;
- a monorepo task orchestrator on top of pnpm and mise;
- a package bundler for libraries before publication requirements exist;
- a component system that dictates visualizer internals.

Small domain-specific capabilities—translator registration, weighted path
selection, correlation tracking, echo suppression, and lifecycle bookkeeping—
belong in the harness. Keeping them explicit is important because these are the
prototype's architectural subject, not incidental application utilities.

## 7. Primary references

- [Node.js releases](https://nodejs.org/en/about/previous-releases)
- [mise Node guide](https://mise.jdx.dev/lang/node.html)
- [pnpm installation](https://pnpm.io/installation)
- [Biome getting started](https://biomejs.dev/guides/getting-started/)
- [Vite integration for TanStack Router](https://tanstack.com/router/latest/docs/installation/with-vite)
- [Tailwind CSS with Vite](https://tailwindcss.com/docs/installation/using-vite)
- [RxJS overview](https://rxjs.dev/guide/overview)
- [TypeBox](https://github.com/sinclairzx81/typebox)
- [JSON Schema draft 2020-12](https://json-schema.org/draft/2020-12)
- [TypeScript 6.0](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/)
- [TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- [Vitest guide](https://vitest.dev/guide/)
- [Playwright installation](https://playwright.dev/docs/intro)
