# Seq* Base Library Specification

Status: prototype specification draft

Seq* is the renderer-independent sequence-domain foundation plus a reference
viewer. It can be used without the application harness. This specification
defines the prototype subset; it is not the complete publication roadmap.

## 1. Package responsibilities

The names below are dependency boundaries. The prototype MAY initially combine
closely related boundaries into fewer workspace packages if their public entry
points and import directions remain explicit.

| Boundary | Prototype responsibility |
| --- | --- |
| `seq-data` | Immutable collection helpers, result/diagnostic types, stable ID utilities |
| `seq-model` | Normalized sequences, assemblies, alignments, annotations, provenance |
| `seq-io` | FASTA/aligned-FASTA/A3M and checked-in fixture adapters |
| `seq-coords` | Coordinate spaces, loci, mappings, mapping-result composition |
| `seq-algorithm` | Consensus, conservation, and alignment-derived helpers used by the cases |
| `seq-view-spec` | TypeBox schemas, builders, validation, normalization, JSON Schema export |
| `seq-viewer` | Portable representation registry and the reference canvas viewer |

Not required as public prototype packages: SeqQL, binary encodings, servers,
collaboration, a general task system, or a global Seq* plugin context.

## 2. General library conventions

- Packages are ESM-only and expose supported entry points through `exports`.
- Public APIs are strict TypeScript and do not expose mutable internal arrays.
- Runtime operations that can fail return typed results or diagnostics; invalid
  biological data is not repaired silently.
- Domain models contain no React elements, DOM nodes, RxJS subjects, Mol*
  objects, or Nightingale elements.
- Algorithms are deterministic for the same inputs.
- Serialized contracts contain no functions or class instances.
- Public objects use `readonly` properties unless mutation is the API's stated
  purpose.

## 3. Diagnostics and results

```typescript
interface Diagnostic {
  code: string
  severity: "info" | "warning" | "error"
  message: string
  path?: string
  details?: Record<string, unknown>
}

type Result<T> =
  | { ok: true; value: T; diagnostics: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] }
```

Diagnostic codes are stable public API. Paths use JSON Pointer for serialized
input and a documented domain path for runtime-only values.

## 4. Normalized model

`seq-model` owns runtime equivalents of SeqViewSpec's sequences, assemblies,
alignments, and annotations. The SeqViewSpec schema imports or mechanically
derives the same primitive definitions; it MUST NOT maintain a semantically
different copy.

The normalized alignment model stores an explicit column-to-sequence position
mapping. Gapped strings are input syntax only. Annotation geometry remains
separate from visual representation.

Model constructors MUST validate:

- residue syntax and declared alphabets;
- stable and unique IDs within the constructed collection;
- assembly references;
- alignment mapping length, order, gaps, and bounds;
- annotation locus bounds and value types.

Models MAY retain source-specific fields only under namespaced extensions and
with provenance. They MUST preserve stable authority-qualified identifiers.

## 5. Coordinate library

`seq-coords` provides a generalized coordinate contract used by the harness.
SeqViewSpec loci are the numeric sequence/alignment subset of this model.

```typescript
interface CoordinateSpace {
  id: string
  kind: string
  length?: number
  authority?: string
  context?: Record<string, string>
}

type CoordinatePosition =
  | { kind: "index"; value: number }
  | { kind: "label"; value: string | number; insertionCode?: string }

type CoordinateLocus =
  | {
      kind: "point"
      space: CoordinateSpace
      position: CoordinatePosition
    }
  | {
      kind: "interval"
      space: CoordinateSpace
      start: number
      end: number
    }
  | {
      kind: "boundary"
      space: CoordinateSpace
      position: number
    }

interface LocusSet {
  loci: CoordinateLocus[]
}
```

Numeric intervals are zero-based and half-open. Label positions support
external residue schemes without pretending insertion codes are array indexes.
A coordinate-space `context` carries identity such as accession, chain, model,
alignment, transcript, or assembly IDs. Context values are data, not an
instruction to fetch or infer mappings.

### 5.1 Translator contract

```typescript
interface CoordinateSpacePattern {
  kind: string
  authority?: string
  context?: Record<string, string | "*">
}

interface CoordinateTranslator {
  id: string
  source: CoordinateSpacePattern
  target: CoordinateSpacePattern
  cost?: number
  map(
    request: MappingRequest,
    signal: AbortSignal,
  ): Promise<MappingResult>
}

interface MappingRequest {
  loci: CoordinateLocus[]
  target?: CoordinateSpace
}

interface MappingAssociation {
  source: CoordinateLocus
  targets: CoordinateLocus[]
  status: "exact" | "partial" | "ambiguous" | "unmapped"
  confidence?: number
  details?: Record<string, unknown>
}

interface MappingResult {
  translatorIds: string[]
  associations: MappingAssociation[]
  diagnostics: Diagnostic[]
}
```

A translator has one declared direction. Reverse translation is a separate
translator capability. Results preserve an association per source locus,
including explicit unmapped results. They MAY be partial, discontinuous,
one-to-many, or many-to-one.

`seq-coords` provides pure helpers to compose mapping results while retaining
source associations and path provenance. Registry ownership, path choice,
caching, cancellation policy, and plugin registration belong to the harness.

### 5.2 Required prototype translators

The library or integration packages provide algorithms for:

- identity mapping within the same named space;
- alignment column to member-sequence position and its explicit reverse;
- table-driven sequence-to-structure residue mapping and reverse mapping;
- table-driven multi-polymer/chain mapping;
- optional CDS nucleotide/protein mapping for the stretch case.

All use deterministic checked-in mapping data. Remote SIFTS resolution is not
required.

## 6. IO and normalization

Prototype adapters expose functions conceptually equivalent to:

```typescript
parseFasta(text: string, options?: FastaOptions): Result<Sequence[]>
parseAlignedFasta(text: string, options?: AlignmentOptions): Result<AlignmentInput>
parseA3m(text: string, options?: AlignmentOptions): Result<AlignmentInput>
normalizeAlignment(input: AlignmentInput): Result<Alignment>
```

Adapters accept source-specific indexing only through explicit options and
normalize to zero-based internal positions. Every fixture-derived document
records its source and transformations in provenance.

Network fetching, retries, authentication, caching, and resource-specific API
clients do not belong to `seq-io` core. An integration plugin may perform those
tasks before calling an adapter.

## 7. Algorithms

The prototype algorithm surface is deliberately small:

```typescript
consensus(alignment: Alignment, options?: ConsensusOptions): ValuesAnnotation
conservation(alignment: Alignment, options?: ConservationOptions): ValuesAnnotation
findOverlaps(loci: readonly Locus[]): readonly Overlap[]
```

Consensus and conservation define their gap, ambiguity, and missing-data
policies in explicit options and attach those options to output provenance.
The prototype does not promise a comprehensive bioinformatics toolkit.

## 8. SeqViewSpec implementation

`seq-view-spec` exports:

```typescript
const SeqViewSpecSchema: TSchema
type SeqViewSpec = Static<typeof SeqViewSpecSchema>

validateSeqViewSpec(input: unknown): Result<SeqViewSpec>
createSeqViewSpec(input: SeqViewSpecInput): Result<SeqViewSpec>
exportSeqViewSpecJsonSchema(): object
digestSeqViewSpec(document: SeqViewSpec): Promise<string>
```

The package implements every semantic check listed in `seq-view-spec.md`, not
only TypeBox structural validation. The builder is thin: its output is exactly
the serialized schema, without a hidden alternate tree.

Optional fluent helpers MAY be provided for repetitive authoring. They must
compile to explicit resolved objects and must not be required to consume JSON.

## 9. Reference viewer

The reference viewer consumes SeqViewSpec directly and has no harness
dependency.

```typescript
interface SeqViewer {
  readonly capabilities: SeqViewerCapabilities
  readonly interactions: Observable<SeqViewerInteraction>

  load(document: SeqViewSpec, viewId: string, signal?: AbortSignal): Promise<LoadResult>
  setHighlight(command: SequenceHighlight): void
  setSelection(command: SequenceSelection): void
  clearHighlight(owner?: InteractionOwner): void
  clearSelection(owner?: InteractionOwner): void
  resize(): void
  dispose(): void
}

interface InteractionOwner { id: string }

function createSeqViewer(options: {
  target: HTMLElement
  spec?: SeqViewerPluginSpec
}): SeqViewer
```

The viewer owns viewport, rendering caches, pointer state, and subscriptions.
`dispose` is idempotent and releases DOM listeners, observers, animation-frame
callbacks, and RxJS subscriptions.

### 9.1 Composable viewer specification

Representations and behaviors are installed explicitly:

```typescript
interface SeqViewerPluginSpec {
  representations: RepresentationProvider[]
  behaviors?: ViewerBehaviorProvider[]
}

interface RepresentationProvider {
  id: string
  representation: string
  create(context: RepresentationContext): RepresentationInstance
}
```

Providers are composable in the same spirit as Mol* plugin specifications:
the default viewer is an exported specification, applications may append or
replace providers, and providers depend on declared public capabilities rather
than importing each other's private state.

The prototype default installs sequence, alignment, blocks, markers, bars,
heatmap, swatch, and links providers. A provider reports whether it rendered
exactly or degraded to a fallback.

### 9.2 Native interaction model

Viewer interactions preserve the SeqViewSpec identity surface:

```typescript
interface SeqViewerInteraction {
  kind: "hover" | "select" | "track-activate" | "viewport-change"
  phase?: "set" | "clear"
  documentId: string
  viewId: string
  sectionId?: string
  trackId?: string
  layerId?: string
  sequenceId?: string
  alignmentId?: string
  alignmentMemberId?: string
  annotationId?: string
  itemId?: string
  loci: CoordinateLocus[]
  nativeEvent?: Event
}
```

`nativeEvent` is local-only and MUST be removed by a wrapper before publishing
a serializable harness event. Applying an external highlight or selection must
not emit a new user-originated interaction.

The viewer stores applied highlights and selections by interaction owner. An
owner-scoped clear does not erase another owner or native selection. Omitting
the owner is reserved for local reset/disposal and is not used for reflected
harness clears.

## 10. Rendering requirements

- Horizontal zoom and pan preserve exact biological coordinate hit-testing.
- Rendering is virtualized or clipped so off-screen tracks/rows do not perform
  unbounded work.
- Pointer hit-testing returns named coordinate spaces and stable object IDs.
- Alignment gaps produce an alignment-column locus and no sequence point.
- Multi-segment axis gaps never produce biological loci.
- Renderer-local styling does not mutate the input document.
- Canvas output is device-pixel-ratio aware and remains usable after resize.
- Keyboard/focus accessibility is provided for track headers and other
  application-relevant controls even when residues render on canvas.

## 11. Acceptance criteria

The base library is conforming when:

1. SeqViewSpec examples validate and invalid references/bounds return stable
   diagnostics.
2. FASTA and alignment fixtures normalize deterministically.
3. Identity, alignment, sequence/structure, and multi-chain mapping tests cover
   exact, partial, ambiguous, and unmapped results.
4. Mapping composition preserves original loci and translator path IDs.
5. Consensus and conservation produce fixture snapshots with recorded options.
6. The reference viewer renders every core representation used by required
   case studies.
7. Hover, selection, track activation, gaps, and disposal pass browser tests.
8. No base package imports the harness, React, Mol*, or Nightingale.
