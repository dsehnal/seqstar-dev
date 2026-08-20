# M01B reproducible audit commands

This directory intentionally contains no executable production import: M01B
must not add Lucide before M02 owns the manifest and lockfile. The audit inputs
and exact expected outcomes are recorded in
[`../../spec/m01-dependency-viewport-audit.md`](../../spec/m01-dependency-viewport-audit.md).

After M02, rerun its two import probes from a clean temporary pnpm 11 store:

```sh
mise exec -- pnpm install --offline --frozen-lockfile
mise exec -- pnpm --filter @seq-star/prototype-web build
mise exec -- pnpm --filter @seq-star/seq-viewer build
mise exec -- pnpm --filter @seq-star/wrapper-nightingale build
```

The future implementation must use static named icon imports. React uses named
components from `lucide-react`; native code uses named `createElement` plus a
named icon node from `lucide`. It must not call `createIcons`, import `icons`
from `lucide`, use `DynamicIcon`, fetch an icon over the network, or add a
registry Nightingale package.
