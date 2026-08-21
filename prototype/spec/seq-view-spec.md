# SeqViewSpec 0.1

Status: prototype specification draft

SeqViewSpec is a portable, declarative JSON document describing a resolved
sequence visualization. It occupies the same architectural role for sequence
views that MolViewSpec occupies for molecular views: it says what compatible
visualizers should display, without defining the application that hosts them.

The normative words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and
**MAY** are interpreted as described by RFC 2119.

## 1. Scope

SeqViewSpec 0.1 supports the prototype's required sequence visualizations:

- a single protein with range, point, categorical, and numeric annotations;
- the same document rendered by the Seq* reference viewer and Nightingale;
- a multi-polymer assembly with per-polymer and pairwise annotations;
- a multiple-sequence alignment with explicit column-to-sequence mappings;
- stable visual-object identities that wrappers can report when users hover,
  select, or activate a track header.

A SeqViewSpec document contains fully resolved visualization data. It does not
fetch, parse, filter, transform, or compute biological data.

SeqViewSpec does not define the application harness, plugins, event streams,
cross-view synchronization, coordinate translators, MolViewSpec generation,
renderer-local state, or executable expressions and callbacks.

These boundaries are normative. A wrapper may use document identities when it
publishes harness events, but harness behavior is not serialized here.

## 2. Design principles

1. **Declarative**: describe visual content and intent, not procedures.
2. **Resolved**: adapters run before serialization; the document contains the
   normalized data needed by the view.
3. **Renderer-independent**: no core field names an implementation.
4. **Coordinate-explicit**: every biological location names its space.
5. **Identity-stable**: data and visual objects have stable IDs.
6. **Data/view separation**: annotations contain biological information;
   layers decide how it is rendered.
7. **Honest degradation**: render, use a declared fallback, or report an
   unsupported representation—never silently discard it.
8. **Strict core**: unknown core fields are rejected; experiments use
   namespaced extensions.

## 3. Serialization conventions

### 3.1 JSON and versioning

The interchange format is JSON. The implementation will publish JSON Schema
draft 2020-12 generated from TypeBox definitions.

Every document contains:

```json
{ "kind": "seq-view-spec", "version": "0.1.0", "id": "example" }
```

Consumers MUST reject unsupported major versions. They MAY accept a newer
minor or patch version when all required capabilities are supported.

### 3.2 IDs and references

IDs MUST match `^[A-Za-z][A-Za-z0-9._:-]*$`, be unique across the document,
remain stable for the lifetime of the logical document, and be treated as
opaque and case-sensitive. References MUST resolve to the required object
kind. Display labels MUST NOT be used as references.

### 3.3 Coordinates

Internal positions are zero-based integers and intervals are half-open:
`[start, end)`. A point at position `4` addresses the fifth element, and the
interval `{ "start": 4, "end": 5 }` covers that element.

External labels such as PDB author numbering are not internal positions and
are outside this specification. Harness translators can associate declared
sequence spaces with external spaces using sequence identifiers.

### 3.4 Portable values

Colors MUST be sRGB hexadecimal strings in `#RRGGBB` or `#RRGGBBAA` form.
Numbers MUST be finite. Links are materialized HTTP or HTTPS URLs and MUST be
treated as untrusted content.

### 3.5 Extensions

Objects that declare `extensions` MAY carry `Record<string, unknown>` values.
Keys MUST use a collision-resistant namespace such as
`org.example.my-feature`. Extensions MUST NOT alter core-field meaning. A
document that needs an extension for correct interpretation MUST name its
capability in `requires`.

### 3.6 Content digest

When a stable content digest is required, implementations canonicalize the
entire JSON document using RFC 8785 JSON Canonicalization Scheme, encode it as
UTF-8, and compute SHA-256. The serialized form is
`sha256-<lowercase hexadecimal>`. Renderers receiving the same portable
document therefore report the same digest without relying on object identity
or property insertion order.

## 4. Document model

The TypeScript below is explanatory. The generated JSON Schema will be the
normative machine-readable definition.

```typescript
type Id = string
type HexColor = string
type Extensions = Record<string, unknown>

interface SeqViewSpec {
  kind: "seq-view-spec"
  version: "0.1.0"
  id: Id
  metadata?: Metadata
  requires?: string[]
  sequences: Sequence[]
  assemblies?: Assembly[]
  alignments?: Alignment[]
  annotations?: Annotation[]
  views: View[]
  provenance?: Provenance
  extensions?: Extensions
}

interface Metadata {
  label?: string
  description?: string
  tags?: string[]
  links?: Array<{ label: string; href: string }>
}

interface Provenance {
  label: string
  description?: string
  uri?: string
  citation?: string
  generatedBy?: string
}
```

`views` MUST contain at least one view. Prototype documents MUST contain at
least one sequence.

## 5. Biological data

### 5.1 Sequences

```typescript
interface Sequence {
  id: Id
  coordinateSpace: Id
  alphabet: "protein" | "dna" | "rna" | "custom"
  residues: string
  metadata?: Metadata
  identifiers?: Identifier[]
  provenance?: Provenance
  extensions?: Extensions
}

interface Identifier {
  namespace: string
  value: string
  version?: string
}
```

`residues` is ungapped and contains no whitespace. Alignment gaps belong to
alignment mappings. The schema permits custom residue codes; Seq* performs
semantic alphabet validation separately. `coordinateSpace` declares a
sequence position space whose length is `residues.length` in Unicode code
points. Prototype builders SHOULD normalize residues to single uppercase ASCII
characters.

Identifiers do not imply a coordinate mapping. For example, a UniProt
identifier may allow a registered translator to find a mapping, but that
mapping is not part of SeqViewSpec.

### 5.2 Assemblies

An assembly gives biological meaning to a group of sequences. It is neither a
coordinate system nor an alignment.

```typescript
interface Assembly {
  id: Id
  members: AssemblyMember[]
  metadata?: Metadata
  identifiers?: Identifier[]
  provenance?: Provenance
  extensions?: Extensions
}

interface AssemblyMember {
  id: Id
  sequence: Id
  role?: string
  label?: string
}
```

Multiple members MAY reference the same sequence to represent repeated copies,
but each has a distinct ID. Polymer identity MUST NOT be inferred from order.

### 5.3 Alignments

An alignment is first-class data with its own column coordinate space.

```typescript
interface Alignment {
  id: Id
  coordinateSpace: Id
  length: number
  members: AlignmentMember[]
  metadata?: Metadata
  provenance?: Provenance
  extensions?: Extensions
}

interface AlignmentMember {
  id: Id
  sequence: Id
  positions: Array<number | null>
  metadata?: Metadata
}
```

For every member, `positions.length` MUST equal alignment `length`. `null`
means a gap; a number is a position in the referenced sequence. Non-null
positions MUST be in bounds, unique, and increasing.

Parsers MAY accept aligned FASTA, A3M, CIGAR, or other compact syntax, but a
builder MUST serialize this explicit mapping.

## 6. Loci

```typescript
type Locus = PointLocus | IntervalLocus | BoundaryLocus

interface PointLocus {
  kind: "point"
  space: Id
  position: number
}

interface IntervalLocus {
  kind: "interval"
  space: Id
  start: number
  end: number
}

interface BoundaryLocus {
  kind: "boundary"
  space: Id
  position: number
}
```

A locus names a declared sequence or alignment coordinate space. Points obey
`0 <= position < length`; intervals obey `0 <= start < end <= length`; and
boundaries obey `0 <= position <= length`. Boundary `0` is before the first
element and boundary `length` is after the last.

Discontinuous annotations use multiple loci. Set-valued mappings are not
represented by array-valued interval endpoints.

## 7. Annotations

Annotations contain normalized biological data and do not prescribe pixels.
`semanticType` is open and SHOULD be authority-qualified when not broadly
understood, for example `uniprot:active-site`.

```typescript
type Annotation =
  | LociAnnotation
  | ValuesAnnotation
  | RelationshipsAnnotation

interface AnnotationBase {
  id: Id
  semanticType: string
  metadata?: Metadata
  provenance?: Provenance
  extensions?: Extensions
}

type Scalar = string | number | boolean
```

### 7.1 Point, range, boundary, and discontinuous annotations

```typescript
interface LociAnnotation extends AnnotationBase {
  kind: "loci"
  items: Array<{
    id: Id
    loci: Locus[]
    label?: string
    description?: string
    value?: Scalar
    properties?: Record<string, Scalar | null>
    links?: Array<{ label: string; href: string }>
  }>
}
```

Each item has at least one locus. Multiple loci mean that one semantic item
occupies discontinuous locations. Examples include domains, variants, active
sites, modifications, boundaries, and discontinuous motifs.

### 7.2 Per-position values

```typescript
interface ValuesAnnotation extends AnnotationBase {
  kind: "values"
  space: Id
  valueType: "number" | "category" | "boolean"
  values:
    | { encoding: "dense"; data: Array<Scalar | null> }
    | {
        encoding: "sparse"
        data: Array<{ position: number; value: Scalar | null }>
      }
}
```

Dense data length MUST equal coordinate-space length. Sparse positions MUST be
unique and in bounds. Non-null values MUST match `valueType`; `null` means
missing, not zero. This covers confidence, conservation, missense scores,
categorical residue classes, and boolean interface flags.

### 7.3 Pairwise relationships

```typescript
interface RelationshipsAnnotation extends AnnotationBase {
  kind: "relationships"
  directed?: boolean
  items: Array<{
    id: Id
    endpoints: Array<{ role: string; loci: Locus[] }>
    label?: string
    description?: string
    value?: Scalar
    properties?: Record<string, Scalar | null>
  }>
}
```

A relationship has at least two endpoints. Endpoint roles MUST be unique
within it. Consumers MUST NOT infer semantics from array order. This supports
cross-chain contacts and disulfides while retaining relationship identity.

Dense matrices, vectors, and structured per-position values are deferred. A
prototype matrix MUST be normalized to sparse relationships or a namespaced
extension with an explicit visual fallback.

## 8. Views and layout

```typescript
interface View {
  id: Id
  context?: { assembly?: Id; alignment?: Id }
  axis: Axis
  sections: Section[]
  initialViewport?:
    | { kind: "fit" }
    | { kind: "locus"; locus: PointLocus | IntervalLocus }
  metadata?: Metadata
  extensions?: Extensions
}

interface Axis {
  segments: Array<{
    id: Id
    space: Id
    start: number
    end: number
    label?: string
  }>
  gap?: number
  ruler?: { visible?: boolean; numbering?: "zero-based" | "one-based" }
}

interface Section {
  id: Id
  tracks: Track[]
  label?: string
  description?: string
  initiallyCollapsed?: boolean
  extensions?: Extensions
}

interface Track {
  id: Id
  layers: Layer[]
  label?: string
  description?: string
  height?: number
  extensions?: Extensions
}
```

The optional context records the biological assembly or alignment represented
by the view; it does not replace explicit axis and layer references. The
portable layout is a horizontal axis with vertically stacked sections and
tracks. Axis segments reference non-empty intervals in sequence or alignment
spaces. `gap` is non-negative display separation, not biological positions.
Selecting across one produces separate biological loci. The ruler is visible
and one-based by default for biological display, while all serialized loci
remain zero-based. Adapters may provide richer human-facing labels as
annotations until reference-coordinate rulers are specified.

`height` is a preferred CSS-pixel height. A renderer MAY adjust it for
accessibility or implementation limits and SHOULD report material deviations.
Layer order is back-to-front compositing order.

## 9. Core visual representations

```typescript
type Layer =
  | SequenceLayer
  | AlignmentLayer
  | BlocksLayer
  | MarkersLayer
  | BarsLayer
  | HeatmapLayer
  | SwatchLayer
  | LinksLayer

interface LayerBase {
  id: Id
  opacity?: number
  tooltip?: { fields: string[] }
  extensions?: Extensions
}

interface AnnotationLayerBase extends LayerBase {
  annotation: Id
  fallback?: {
    representation: "blocks" | "markers" | "bars" | "heatmap" | "swatch"
    color?: ColorEncoding
  }
}
```

Opacity is between 0 and 1. Fallbacks apply only to annotation-backed layers,
reuse the primary layer's annotation, and cannot nest. Tooltip entries select
`id`, `label`, `description`, `value`, or `properties.<key>`; they are not
templates or expressions.

### 9.1 Sequence and alignment

```typescript
interface SequenceLayer extends LayerBase {
  representation: "sequence"
  sequence: Id
  showLetters?: boolean
  color?: { kind: "fixed"; color: HexColor }
}

interface AlignmentLayer extends LayerBase {
  representation: "alignment"
  alignment: Id
  members?: Id[]
  showLetters?: boolean
  color?: { kind: "fixed"; color: HexColor }
}
```

Alignment `members` are alignment-member IDs controlling visible row order. If
omitted, declaration order is used. Virtualization is renderer-local and must
preserve member IDs at the interaction boundary.

### 9.2 Loci annotations

```typescript
interface BlocksLayer extends AnnotationLayerBase {
  representation: "blocks"
  laneMode?: "overlay" | "stack"
  color?: ColorEncoding
}

interface MarkersLayer extends AnnotationLayerBase {
  representation: "markers"
  shape?: "circle" | "diamond" | "line"
  color?: ColorEncoding
}
```

Blocks accept point and interval loci; a point occupies one position. Markers
accept point and boundary loci. `laneMode: "stack"` places overlaps in separate
lanes; it is distinct from ordered layer compositing.

### 9.3 Value annotations

```typescript
interface BarsLayer extends AnnotationLayerBase {
  representation: "bars"
  scale?: { domain?: [number, number]; baseline?: number; clamp?: boolean }
  color?: ColorEncoding
}

interface HeatmapLayer extends AnnotationLayerBase {
  representation: "heatmap"
  color: ColorEncoding
}

interface SwatchLayer extends AnnotationLayerBase {
  representation: "swatch"
  color: ColorEncoding
}
```

Bars require numeric values. Heatmaps accept numeric, categorical, or boolean
values. Swatches require categorical or boolean values.

### 9.4 Pairwise relationships

```typescript
interface LinksLayer extends AnnotationLayerBase {
  representation: "links"
  color?: ColorEncoding
}
```

Links preserve relationship and endpoint identities. Curve and collision
layout are renderer-specific. A marker or block fallback may show endpoints,
but the renderer MUST report loss of relationship geometry.

### 9.5 Color encoding

```typescript
type ColorEncoding =
  | { kind: "fixed"; color: HexColor }
  | {
      kind: "categorical"
      field: "id" | "value" | `properties.${string}`
      colors: Record<string, HexColor>
      fallback: HexColor
    }
  | {
      kind: "continuous"
      field: "value"
      domain: [number, number]
      range: [HexColor, HexColor]
      clamp?: boolean
      missing: HexColor
    }
```

Continuous colors use linear interpolation in sRGB. The first domain number is
smaller than the second. Categorical keys use the JSON string form of the
selected scalar. Deterministic encodings let a harness plugin apply the same
annotation colors when creating MolViewSpec.

## 10. Renderer conformance and fallback

A renderer conforms to 0.1 when it:

1. validates before rendering;
2. resolves references and bounds according to this specification;
3. implements at least `sequence`, `blocks`, and `markers`;
4. preserves all applicable document, view, layout, data, and item IDs at its
   interaction boundary;
5. reports accepted, rendered-with-degradation, or rejected through its wrapper;
6. never silently ignores an unsupported required capability or layer.

For each layer, use the primary representation when supported, otherwise its
declared fallback while reporting degradation, otherwise reject the view with
an unsupported-capability result. Partial rendering requires explicit
application opt-in; rejection is the default.

Pixel-identical output is not required. Renderers preserve biological targets,
ordering, declared colors, labels, and item distinctions to the extent allowed
by the selected representation.

## 11. Interaction identity surface

SeqViewSpec does not define events. It defines identities a renderer exposes to
its wrapper: document and view; section, track, and layer; sequence, assembly
member, alignment, and alignment member; annotation and item or relationship;
and the exact source loci.

Hovering an alignment gap identifies the alignment member and column but does
not invent a sequence locus. Activating a track header identifies the track and
layers; it does not encode “show in structure.” A harness plugin interprets the
intrinsic event.

## 12. Semantic validation

Beyond JSON Schema shape, the Seq* validator MUST enforce:

- document-wide ID uniqueness and typed reference resolution;
- unique sequence/alignment coordinate-space IDs;
- locus, axis, sparse-value, and viewport bounds;
- valid assembly membership and alignment mappings;
- annotation value types and dense-array lengths;
- layer/annotation compatibility and axis coverage;
- color, scale, opacity, and height constraints;
- required capability and extension declarations.

Diagnostics use stable codes and JSON Pointer paths. Validation SHOULD return
all independent errors found in one pass. Normalization MUST NOT silently
repair ambiguous biological data.

## 13. Minimal example

```json
{
  "kind": "seq-view-spec",
  "version": "0.1.0",
  "id": "uniprot-example",
  "sequences": [{
    "id": "protein",
    "coordinateSpace": "protein-seq",
    "alphabet": "protein",
    "residues": "MKTAYIAKQRQISFVKSHFSRQ",
    "identifiers": [{ "namespace": "uniprot", "value": "P00000" }]
  }],
  "annotations": [
    {
      "id": "domains",
      "kind": "loci",
      "semanticType": "protein-domain",
      "items": [{
        "id": "domain-a",
        "loci": [{ "kind": "interval", "space": "protein-seq", "start": 2, "end": 12 }],
        "label": "Domain A",
        "value": "domain-a"
      }]
    },
    {
      "id": "scores",
      "kind": "values",
      "semanticType": "example:score",
      "space": "protein-seq",
      "valueType": "number",
      "values": {
        "encoding": "sparse",
        "data": [{ "position": 2, "value": 0.1 }, { "position": 7, "value": 0.95 }]
      }
    }
  ],
  "views": [{
    "id": "main-view",
    "axis": { "segments": [{
      "id": "protein-axis",
      "space": "protein-seq",
      "start": 0,
      "end": 22
    }] },
    "initialViewport": { "kind": "fit" },
    "sections": [{
      "id": "main-section",
      "tracks": [
        {
          "id": "sequence-track",
          "label": "Sequence",
          "layers": [{
            "id": "sequence-layer",
            "representation": "sequence",
            "sequence": "protein"
          }]
        },
        {
          "id": "domain-track",
          "label": "Domains",
          "layers": [{
            "id": "domain-layer",
            "representation": "blocks",
            "annotation": "domains",
            "laneMode": "stack",
            "color": {
              "kind": "categorical",
              "field": "value",
              "colors": { "domain-a": "#3B82F6" },
              "fallback": "#64748B"
            }
          }]
        },
        {
          "id": "score-track",
          "label": "Score",
          "layers": [{
            "id": "score-layer",
            "representation": "heatmap",
            "annotation": "scores",
            "color": {
              "kind": "continuous",
              "field": "value",
              "domain": [0, 1],
              "range": ["#FFF7ED", "#C2410C"],
              "missing": "#E5E7EB",
              "clamp": true
            }
          }]
        }
      ]
    }]
  }]
}
```

## 14. Builder and adapters

The TypeScript builder is an authoring convenience, not a second model. It MUST
emit this serialized shape and validate before returning it.

Seq* adapters may parse source formats, normalize coordinate conventions,
convert gapped alignments to explicit positions, normalize relationships,
resolve remote data before construction, and attach provenance. They MUST NOT
add executable instructions to the document. Batch helpers may reduce author
repetition, but their output contains explicit resolved objects.

## 15. Prototype capabilities

```text
seqviewspec:representation/sequence
seqviewspec:representation/alignment
seqviewspec:representation/blocks
seqviewspec:representation/markers
seqviewspec:representation/bars
seqviewspec:representation/heatmap
seqviewspec:representation/swatch
seqviewspec:representation/links
```

Documents normally use layer fallbacks instead of listing every core
representation in `requires`. `requires` is for capabilities without which the
whole document loses its intended meaning. Negotiation, targeting, and
lifecycle messages belong to the wrapper/harness specification.

## 16. Explicitly deferred

- source declarations, selectors, lazy loading, lenses, SeqQL, and transforms;
- generalized two-dimensional or opposed-axis layouts;
- dense matrices and structured/vector value encodings;
- external reference loci and embedded mapping graphs;
- strand, CDS phase, and codon-mapping semantics;
- renderer-specific actions or event declarations;
- animation, collaborative state, snapshots, and patch protocols;
- binary serialization and large-dataset streaming;
- embedded MolViewSpec or harness documents.

The nucleotide-to-protein case can add a coordinate-mapping contract without
changing SeqViewSpec. Future work should extend the smallest appropriate layer
instead of turning this visualization document into an application spec.

## 17. Prototype acceptance coverage

| Requirement | SeqViewSpec construct |
| --- | --- |
| Renderer portability | One document, stable IDs, core layers, explicit fallbacks |
| UniProt tracks | Loci/value annotations and deterministic colors |
| Track-to-MVS intent | Stable track/layer/annotation IDs; orchestration is external |
| Multi-polymer complex | Assembly members and multi-segment axes |
| Cross-chain contacts | Relationships with named endpoints |
| MSA | First-class alignment and explicit column mappings |
| Gap hover | Alignment column plus `null` member mapping |
| Structure synchronization | Sequence identifiers and loci used by translators |
| Nightingale | Maps core representations or reports fallback |

This is a scope check, not an assertion that SeqViewSpec implements the harness
behavior named in a requirement.
