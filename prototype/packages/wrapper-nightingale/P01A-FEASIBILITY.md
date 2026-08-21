# P01a Nightingale feasibility handoff

`mountNightingaleFeasibilitySpike` is an executable browser probe, not the P30
production wrapper. It imports only the selected local workspace packages and
renders a sequence, two block/marker features, and a deterministic numeric line
track. Its `ready` promise checks actual D3-created SVG nodes after Lit updates
and animation-frame work rather than treating module import as success.

The probe also exposes the existing generic highlight/clear surface and removes
the mounted elements for disconnect inspection. Native `change` events bubble
from the mounted root for event-shape inspection.

## Verified evidence

An isolated workspace using pnpm 11.22.0, TypeScript 6.0.3, and Vite 8.2.1
successfully built all four local packages and a production browser bundle. The
bundle was 137.86 kB (43.20 kB gzip) in this unintegrated probe.

Headless Chromium verified:

- all three custom element registrations were present;
- three SVG tracks reached a usable frame with 60 sequence cells, two feature
  groups, one diamond marker, and one value graph;
- the rendered block carries stable local ID `g_p01a-block-domain`;
- `fixedHighlight = "10:12"` rendered one highlight in every track and `null`
  cleared all three;
- disposal removed the three elements, and a fresh remount produced the same
  first-frame counts.

This proves renderer output and imperative highlight feasibility, not the missing production
semantics listed in `vendor/nightingale/PATCHES.md`.

## Root integration required

The workspace already includes `vendor/nightingale/*`. The orchestrator must:

1. regenerate the shared lockfile after accepting the exact dependencies in the
   selected package manifests;
2. run `pnpm --filter '@nightingale-elements/*' --workspace-concurrency=1 run build`
   before the root TypeScript/Vite build so each package's public runtime entry
   exists on a clean checkout; vendor packages expose editable source types and
   therefore do not need root project references;
3. mount this exported function from an orchestrator-owned web route or test;
4. run it in Playwright, await `ready`, exercise highlight/clear, remove it,
   and remount to audit listener counts. Real browser pointer/click
   normalization is deferred to P30/P80.

No application route, Vite config, generated route tree, shared root script, or
lockfile is changed by P01a.

## Dependency checks after root integration

Run these from `prototype/` after the orchestrator regenerates the lockfile:

```text
pnpm list --recursive --depth Infinity
pnpm why --recursive @nightingale-elements/nightingale-new-core
rg '/@nightingale-elements/' pnpm-lock.yaml
```

Every Nightingale package shown by pnpm must be a workspace link under
`vendor/nightingale/`. The lockfile may name workspace importers but must not
contain a registry package snapshot for `@nightingale-elements/*`.
