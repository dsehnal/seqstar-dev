# Visualizer Wrapper Specification

Status: prototype specification draft

Wrappers are bidirectional boundaries between autonomous visualizers and the
application harness. The prototype has wrappers for the Seq* reference viewer,
vendored Nightingale, and Mol*.

## 1. Common contract

```typescript
interface VisualizerWrapper extends HarnessComponent {
  readonly element: HTMLElement
  readonly capabilities: string[]
}

interface VisualizerWrapperFactory<TConfig = unknown> {
  type: string
  create(options: {
    id: string
    target: HTMLElement
    config: TConfig
  }): VisualizerWrapper
}
```

A wrapper:

- owns exactly one visualizer instance;
- subscribes only while started;
- validates applicable requests before passing them to the visualizer;
- converts portable requests into native calls;
- converts native interactions into serializable `interaction.native` messages;
- applies targeted highlight, selection, focus, and clear commands;
- publishes lifecycle results and diagnostics;
- handles resize and deterministic, idempotent disposal;
- never translates between biological coordinate systems itself.

Wrappers MUST ignore messages targeted to another component. They MUST NOT
access another wrapper or publish native library objects.

Wrappers track applied interactions by `interactionId` and owner. Replace,
add, remove, toggle, and clear affect only that owner's state. A synchronized
clear MUST NOT erase unrelated native selection or another plugin's applied
interaction.

## 2. Request lifecycle

For an applicable visualization request:

1. validate envelope and document;
2. publish `accepted`, or `failed` with diagnostics;
3. abort/supersede the preceding in-flight request for this instance;
4. load the request into the visualizer;
5. publish `rendered`, `degraded`, `superseded`, or `failed`;
6. retain the active request/document IDs for interaction attribution.

Only the most recently accepted request may become visible. A request is
`rendered` after the visualizer has produced a usable first frame, not merely
after a native API promise resolves.

Each wrapper defines a deterministic readiness hook verified by its feasibility
spike: reference viewer render-generation callback, a Nightingale update/render
signal (adding a generic vendored signal if necessary), and a Mol* post-MVS
canvas/state signal from the pinned package. Fixed timeouts are not readiness
signals. A late hook carries its request generation and cannot render an older
generation as current.

## 3. Capabilities

Every wrapper declares:

- accepted visualization formats;
- supported representations or MVS features;
- native interaction kinds it can publish;
- external interaction commands it can apply;
- coordinate-space patterns it can accept for commands.

Capabilities are stable strings. Component-instance coordinate spaces may be
reported after a document loads. A capability declaration is a promise: failure
to perform it is a runtime error, not normal fallback.

## 4. Seq* reference-viewer wrapper

Type: `seqstar.reference-viewer`

Consumes:

- `visualization.seqviewspec.request`;
- sequence/alignment highlight, selection, and clear commands.

Publishes:

- hover, selection, track activation, and viewport native interactions;
- SeqViewSpec lifecycle results;
- renderer fallback diagnostics.

The wrapper passes valid documents to the public `SeqViewer` API. It removes
the local `nativeEvent` field, retains all stable SeqViewSpec IDs, and converts
viewer loci to `seq-coords` loci without changing coordinate meaning.

Applied commands call the viewer's imperative interaction API and MUST NOT be
re-emitted as native interactions.

## 5. Nightingale wrapper

Type: `seqstar.nightingale`

The wrapper consumes the same SeqViewSpec requests and normalized commands as
the reference-viewer wrapper. It maps core layers to vendored Nightingale
components.

### 5.1 Representation mapping

| SeqViewSpec representation | Nightingale strategy |
| --- | --- |
| `sequence` | sequence/navigation component combination |
| `blocks` | feature/track component |
| `markers` | feature component or vendored marker support |
| `bars` | data/graph track |
| `heatmap` | heatmap/data track or declared fallback |
| `swatch` | colored residue/strip track or declared fallback |
| `alignment` | vendored alignment support if implemented; otherwise reject/fallback as declared |
| `links` | vendored relationship support if implemented; otherwise declared endpoint fallback |

The implementation plan must verify exact upstream component names and APIs;
this table specifies behavior rather than guessing their exported symbols.

The wrapper maintains an explicit mapping from SeqViewSpec document/view/track/
layer/item IDs to Nightingale elements and feature objects. It MUST NOT recover
identity from labels or DOM order.

### 5.2 Required local Nightingale capabilities

The vendored source may be patched to provide:

- stable external track and feature IDs;
- imperative external highlight and selection with clear operations;
- normalized pointer and activation notifications;
- deterministic readiness/first-render notification;
- complete listener and observer cleanup;
- capabilities needed to render declared prototype fallbacks.

Generic visualizer capability belongs in the vendored package. Harness routing,
coordinate translation, MVS generation, and UniProt-specific behavior do not.

### 5.3 Vendoring rules

`prototype/vendor/nightingale/` contains ordinary tracked source, not a
submodule or generated bundle. It MUST include:

- upstream repository URL and exact commit in `UPSTREAM.md`;
- retained licenses and notices;
- `PATCHES.md` describing each local behavioral change and affected package;
- only the packages and shared build sources required by the prototype;
- package names adjusted only as necessary to avoid accidentally resolving a
  registry copy.

The workspace and wrapper MUST consume the local packages. CI verifies that no
second registry-installed Nightingale implementation enters the dependency
graph.

## 6. Mol* wrapper

Type: `seqstar.molstar-mvs`

Consumes:

- `visualization.mvs.request`;
- structure-residue highlight, selection, focus, and clear commands.

Publishes:

- structure hover and selection native interactions;
- focus/viewport interactions when supported;
- MVS lifecycle results and diagnostics.

The wrapper validates the MVS payload using the MolViewSpec implementation,
then loads it through the supported Mol* MVS API. It contains no UniProt,
AlphaFold, SIFTS, alignment, or SeqViewSpec-to-MVS generation logic.

### 6.1 Structure coordinate identity

Native Mol* loci are normalized to `seq-coords` structure spaces containing
enough context to distinguish structure/model, entity, chain, and residue
numbering scheme. Residue labels or indexes are never published without their
space.

The wrapper maintains mappings between normalized structure loci and active
Mol* loci/selectors for the currently rendered request. Incoming commands for
an unrelated structure space produce an explicit unsupported/unmapped
diagnostic rather than a positional guess.

### 6.2 Replacement and interaction behavior

- A new MVS request replaces the previous requested visualization.
- Camera policy comes from MVS or wrapper configuration, not a SeqViewSpec event.
- Applying an external hover uses Mol* highlight APIs and is ephemeral.
- Applying a selection uses Mol* selection APIs and persists until replaced or
  cleared according to the command.
- Native hover/selection subscriptions are detached on replacement and dispose.
- Clearing one owner-scoped external highlight does not erase unrelated native
  or application-owned highlights or selections.

## 7. Host and error behavior

Wrappers render fatal request errors into lifecycle messages. The web host may
show those diagnostics, but the wrapper MUST leave the previous successfully
rendered view intact until a replacement has been accepted. After acceptance,
failure policy is wrapper-configurable: retain previous view or show an empty
error state, with the choice reported.

Resize observation is wrapper-owned. A hidden or zero-sized host does not cause
invalid coordinate calculations; rendering resumes when measurable.

## 8. Acceptance matrix

| Behavior | Reference | Nightingale | Mol* |
| --- | :---: | :---: | :---: |
| Latest request wins | ✓ | ✓ | ✓ |
| First-frame lifecycle | ✓ | ✓ | ✓ |
| Native hover publication | ✓ | ✓ | ✓ |
| Native selection publication | ✓ | ✓ | ✓ |
| External highlight/clear | ✓ | ✓ | ✓ |
| External selection/clear | ✓ | ✓ | ✓ |
| Stable document/object attribution | ✓ | ✓ | MVS/structure equivalents |
| No echo from applied commands | ✓ | ✓ | ✓ |
| Resize and disposal | ✓ | ✓ | ✓ |
| Capability/fallback diagnostics | ✓ | ✓ | MVS diagnostics |

Browser tests MUST exercise both directions of interaction, rapid request
replacement, resize, navigation disposal, unmapped commands, and repeated
mount/unmount without leaked listeners.
