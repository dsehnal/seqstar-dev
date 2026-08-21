# Seq* prototype

Seq* is an offline, browser-hosted exploration of portable sequence views, an
event-driven integration harness, and native visualizer wrappers. It is not a
published library or deployment target. The application uses hash routes so a
future static deployment (including GitHub Pages) can serve deep links without
server rewrites; this repository does not deploy it.

## Quick start

Prerequisites are [mise](https://mise.jdx.dev/), a network connection only for
the first tool/dependency/browser installation, and a Chromium browser supplied
by Playwright. The pinned runtime is Node `26.7.0`, pnpm `11.22.0`, TypeScript
`6.0.3`, and Biome `2.5.9`.

```sh
cd prototype
mise install --locked
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm run install:browser
mise run check
mise run test
mise run build
mise run test:e2e
```

After the first install, a clean machine with an already populated pnpm store
can verify without registry access:

```sh
cd prototype
mise install --locked
mise exec -- pnpm install --offline --frozen-lockfile
mise run check:p80
mise run check
mise run test
mise run build
mise run test:e2e
```

Run the app with `mise run dev`, then open `http://localhost:5173/#/`.
Implemented routes are `#/renderer-portability`, `#/uniprot-structure`,
`#/complex`, `#/alignment-structure`, `#/cds-protein` (stretch), and the
diagnostic routes linked in the app header. All required case data is checked
in. The browser tests reject non-loopback requests, so cases must not depend on
runtime network access.

Useful focused commands are `mise run check:p80` for the final inventory and
boundary audit, and `mise run test:e2e:hardening` for the repeated-navigation
offline check. Every `mise run test:e2e` invocation includes the application
suite plus the focused P01B, P20, P30, and P40 browser harnesses.

## Ownership

`packages/seq-*` owns normalized sequence models, coordinate algorithms,
SeqViewSpec, and the reference viewer. `packages/harness-*` owns typed messages,
routing, translator registration, lifecycle, and interaction synchronization.
`packages/wrapper-*` retain native visualizer state behind a common contract.
`packages/integration-plugins` translates domain fixture data into complete
SeqViewSpec or MolViewSpec requests. `apps/web` composes routes and panel layout
only; it does not perform biological mapping or direct visualizer wiring.

Mol* and MolViewSpec APIs come from one pinned `molstar@5.11.0` dependency.
Nightingale is an editable local workspace subtree under `vendor/nightingale`;
its wrapper is the only application-facing integration boundary. See
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md),
[fixtures/README.md](fixtures/README.md), and
[TRACEABILITY.md](TRACEABILITY.md) for the evidence records.

## Notes

Vite emits standard large-chunk warnings because the production bundle contains
Mol*. They are expected for this self-contained prototype and are tracked as a
known build warning, not suppressed. `legacy/seq-star-workspace` is read-only
reference material and must not be imported by the prototype.
