# SeqViewSpec (SVS) — Draft v0.6

A declarative specification for multi-track sequence views of multi-polymer assemblies. Inspired by [MolViewSpec](https://molstar.org/mol-view-spec).

SeqViewSpec (SVS) is a declarative, JSON-based specification for describing multi-track sequence views of multi-polymer assemblies — proteins, nucleic acids, antibodies, and engineered constructs. It defines a standardized data model (the "assembly") that packages polymer sequences, annotations, identity metadata, and reference numbering systems into a single referenceable unit. Features in the view layer reference assemblies by name, creating a clean separation between data and presentation that supports multiple renderers — from high-performance canvas viewers to Nightingale web components.

The spec is designed to work standalone, with optional integration with [MolViewSpec](https://molstar.org/mol-view-spec) for synchronized 1D+3D views. Each polymer carries optional identity and reference metadata, and viewers emit events with full coordinate context across three spaces: alignment columns, gap-free sequence positions, and positions in external reference systems. Any consumer — another SVS viewer, a Mol* 3D view, or an external tool — can resolve events in its own coordinate space without shared state or a coordination layer.

SVS is builder-first: the primary authoring interface is a fluent TypeScript API that serializes to an SVS state (JSON). The specification is being developed as an open standard in collaboration with the UniProt team, with immediate applications in antibody engineering and structural biology workflows.

## 1. Principles

- **Declarative**: Describe *what* to show, not *how* to render it.
- **View-only**: No domain computation. Lightweight derivations (coordinate mapping from gap symbols, identity, and references) are expected of runtimes.
- **Assembly-centric**: The assembly is the standardized data model bridging raw data and views.
- **Identity-aware**: Polymers carry optional provenance and reference metadata enabling cross-view coordination.
- **Renderer-agnostic**: Any conforming viewer can consume an SVS state.
- **Reactive runtime**: Runtimes reconcile state and re-render only what changed.
- **Builder-first**: The builder API is the primary authoring interface. The SVS state (JSON) is the serialization target.
- **Extensible**: Every node supports `custom: any` for renderer/runtime-specific extensions.

## 2. Terminology

| Term | Definition |
|------|-----------|
| **SVS state** | A serialized JSON object describing assemblies and views. The output of the builder, the input to a viewer. |
| **Assembly** | A named collection of polymer sequences, annotations, identity, references, and values. The standardized data model that tracks and features reference. |
| **Polymer** | A single named sequence — a protein chain, nucleic acid strand, or engineered construct. Represented as a string or array of residue codes. |
| **Identity** | Provenance metadata on a polymer — where it comes from (UniProt accession, PDB entity, composite origins). Answers "what is this polymer." |
| **Reference** | A parallel numbering system on a polymer (Kabat, IMGT, PDB auth). Answers "how else can positions be addressed." Unlike identity, references are coordinate overlays, not provenance. |
| **Annotation** | Named data attached to an assembly. Has an explicit `kind`: `range` (regions), `per-residue` (per-position values, dense or sparse), or `pairwise` (residue-residue relationships). |
| **Source** | A data origin — a URL or inline string with a format hint. Sources are global and referenced by name. |
| **Selector** | A declarative pointer into parsed source data. Navigates to a location (mmCIF field, FASTA entry, JSON path) without filtering or transforming. |
| **Lens** | Informal design principle: describe where data lives, not how to process it. Selectors and batch expansion both follow this principle. This seems to be redundant as presently described. I would strengthen this instead - perhaps as a distinct spec, since typically people think of Lens as the 'analytics' between data and view - this might be some sort of extension point perhaps ? |
| **View** | A rendering context with a coordinate system, layout, sections, tracks, and features. A single SVS state can contain multiple views. |
| **Section** | A layout region within a view that groups tracks. Controls scrolling, collapsing, and display behavior. |
| **Track** | A horizontal lane within a section. References an assembly, contains features layered in declaration order, and can contain child tracks for hierarchical grouping. |
| **Feature** | A leaf rendering primitive on a track. Has a `type` (from the core vocabulary or custom), inherits or references an assembly, and can reference a tooltip annotation for hover content. |
| **Coordinate system** | The horizontal axis of a view, defined by an ordered list of polymer ranges with optional gaps between them. Derived from assemblies or explicitly specified. |
| **Coordinate space** | One of three systems for addressing positions: *alignment* (column index including gaps), *sequence* (gap-free position), or *reference* (position in an external numbering system). |
| **Gap symbols** | Characters in polymer sequences that represent alignment gaps (default: `["-"]`). Used by the runtime to derive alignment ↔ sequence mapping. Enhancement: propose standard for compact gap representations - CiGAR or similar - a3m is also now widely used, which is more complex to parse into a regular MSA, but preferred because it produces smaller files. |

Enhancements:
Machine & human readable mechanisms for describing origin of data that SVS consumer might present to user.
- Labels/etc. Frequently the text associated with annotations requires additional explanation - e.g. conservation -> what type of conservation -> methods, dois, etc.
- program used to generate msa, parameters used, etc.
Simile: In jalview we discovered people wanted to customise text shown to users, include URLs to additional info, etc. SOmetimes these were hardwired, sometimes they were data dependent - e.g. a template for generating concrete URLs via identifiers.org for instance.


## 3. State Structure

```
sources     →  where to get raw data (optional)
assemblies  →  polymers + annotations + identity + references + values (the data)
views       →  coordinate systems, layouts, sections, tracks, features (the presentation)
```

All three sections are part of the same spec. Sources are optional — assemblies can be provided with fully resolved inline data, constructed from sources, or a mix of both. The serialized JSON is referred to as an **SVS state**.

## 4. Builder API

```typescript
const builder = SVS.create({ version: "0.1.0" })
```

### 4.1 Sources

Sources declare where to get raw data. They are global and referenced by name.

```typescript
builder.source("structure", { url: "https://files.rcsb.org/download/7FAB.cif", format: "cif" })
builder.source("alignment", { url: "https://example.com/msa.fasta", format: "fasta" })
builder.source("features",  { url: "https://example.com/annotations.json", format: "json" })

// Inline data
builder.source("custom-fasta", {
  data: ">VL\nCTVPQQ...\n>VH\nHIKEIT...",
  format: "fasta"
})

// Lazy — fetched only when a referencing feature becomes visible
builder.source("large-msa", { url: "https://example.com/large-msa.fasta", format: "fasta", lazy: true })
```

### 4.2 Assemblies

An assembly is a named collection of **polymers**, **annotations**, and **values**. Polymers and annotations can be provided inline or constructed from sources via selectors.

```typescript
builder.assembly("antibody", {
  gap_symbols: ["-", "."],  // default: ["-"]

  polymers: {
    light: {
      sequence: "CTVPQQTYLRDTGSASD...",
      identity: { kind: "uniprot", id: "P01234", start: 21, end: 220 },
      references: {
        kabat: { kind: "numbering-scheme", scheme: "kabat", mapping: [1, 2, 3, "27A", "27B", 28] },
      }
    },
    heavy: {
      source: "structure",
      selector: { kind: "cif-field", category: "entity_poly", field: "pdbx_seq_one_letter_code_can", row: 1 },
      identity: { kind: "pdb", entity_id: "2", auth_asym_id: "H", resolve: "sifts" },
      references: {
        auth: { source: "structure", selector: { kind: "cif-field", category: "atom_site", field: "auth_seq_id" } },
        imgt: { source: "features", selector: { kind: "json-field", path: ["imgt_numbering"] } },
      }
    },
  },

  annotations: {
    cdrs: {
      kind: "range",
      group_by: "name",
      data: [
        { name: "CDR1", range: { polymer: "light", start: 24, end: 40 } },
        { name: "CDR2", range: { polymer: "light", start: 56, end: 70 } },
        { name: "CDR1", range: { polymer: "heavy", start: 26, end: 38 } },
        { name: "CDR2", range: { polymer: "heavy", start: 56, end: 65 } },
      ],
    },
    conservation: {
      kind: "per-residue",
      data: {
        light: [0.9, 0.85, 0.3, 0.1],
        heavy: [0.4, 0.72, 0.15, 0.88],
      },
    },
    contacts: {
      kind: "pairwise",
      data: [
        { polymer_a: "light", position_a: 23, polymer_b: "heavy", position_b: 105 },
      ],
    },
  },

  // Assembly-level values — available to layout columns for any track referencing this assembly
  values: {
    organism: "H. sapiens",
    expression_yield: 0.85,
  }
})
```

#### Polymer Sequences

Strings (one character per position) or arrays (for non-standard residues, ligands):

```typescript
light: { sequence: "CTVPQQTYLRDT..." }
chain: { sequence: ["ALA", "CYS", "MSE", "LYS", "NAG", "FUC"] }
```
Clarification: Ligands may be part of a chain, but are often considered independently or as modifications. Ideally links to chembl/authoritative chemical/ligand db is needed.

Sequences can be inline or from a source:

```typescript
chain: { source: "structure", selector: { kind: "cif-field", category: "entity_poly", field: "pdbx_seq_one_letter_code_can", row: 0 } }
```

#### Polymer Identity

Optional. Describes **provenance** — where this polymer comes from.
This needs a bit more definition: identity mapping is not always clear - one/many segments to one coord system. Versions are required and a true uniform identifier required for authority (ie 'custom' seems to be a type of authority. ). 
```typescript
type PolymerIdentity =
  | { kind: "uniprot"; id: string; start: number; end: number }
  | { kind: "pdb"; entity_id: string; auth_asym_id?: string; resolve?: "sifts" }
  | { kind: "composite"; segments: CompositeSegment[] }
  | { kind: "custom"; name: string; reference_start?: number }

type CompositeSegment = {
  identity: PolymerIdentity  // non-composite
  polymer_start: number
  polymer_end: number
}
```

- **`uniprot`** — UniProt coordinates. `start`/`end` map polymer positions to UniProt residue numbers.
- **`pdb`** — PDB entity. `resolve: "sifts"` tells the runtime to derive reference coordinates from mmCIF `atom_site.pdbx_sifts_xref_db_*` fields.
- **`composite`** — chimeric polymer mapping different sequence intervals to different identities.
- **`custom`** — internal/proprietary. `reference_start` offsets numbering.

#### Polymer References

Optional. Describes **parallel numbering systems** — concurrent coordinate overlays on the same positions. Unlike `identity` (segmented provenance), references address how positions map to external systems.

```typescript
type PolymerReferences = Record<string, ReferenceSystem>

type ReferenceSystem =
  | { kind: "numbering-scheme"; scheme: string; mapping: (number | string | null)[] }
  | { kind: "offset"; start: number }
  | { source: string; selector: Selector }
  | { kind: "custom"; data: any }
```

References can be inline or sourced. For large numbering arrays (1000+ residues), sourcing from the original data file avoids bloating the SVS state. Source-selected reference data must resolve to the expected shape for that reference type (e.g. an array of `number | string | null` for `numbering-scheme`). Runtimes should fail clearly on shape mismatches. If a reference mapping array length differs from the polymer sequence length, runtimes should pad missing positions with `null`, truncate excess entries, and emit a warning.

```typescript
references: {
  kabat: { kind: "numbering-scheme", scheme: "kabat", mapping: [1, 2, 3, "27A", "27B", 28] },
  auth: { source: "structure", selector: { kind: "cif-field", category: "atom_site", field: "auth_seq_id" } },
}
```

Identity and references serve different purposes:
- `identity` answers **"what is this polymer"** — provenance, source, segmented origins.
- `references` answers **"how else can positions be numbered"** — parallel coordinate overlays.

Both are optional. When absent, coordination uses assembly name + polymer name.

Clarification: treatment of '0' and directionality.
- some numbering systems include zero, others do not. Do we need an 'includes-zero' option ?
- often, reverse strand sequences are written in fasta in reverse - e.g. as polymer/end-start (excluding zero)


#### Annotation Data

Annotations are named and carry an explicit `kind` discriminator. THis distinguishes range, positional (per-residue), pairwise, or other forms. 

Clarification: data sources differ in the way they express some forms of annotation - e.g. a disulphide is marked as a range annotation but a viewer might recognise that this should be intepreted as a pairwise contact. Similarly for ligand contacts. Thus the *type* field is usually used to determine how any positional specification are interpreted. Simplest is to demand instance generators reify to form concrete kind: specifications.

**Range annotations** (`kind: "range"`) — named regions with optional `group_by` for multi-polymer grouping:

- Annotations may be on a specific atom or bond - atoms are supported but are bonds ? A simpler generalisation of this is on/vs before - ie is a splice site specified as before a position or between two adjacent positions ?

```typescript
cdrs: {
  kind: "range",
  group_by: "name",
  data: [
    { name: "CDR1", range: { polymer: "light", start: 24, end: 40 }, data: { ... } },
    { name: "CDR1", range: { polymer: "heavy", start: 26, end: 38 }, data: { ... } },
  ]
}
```

When `group_by` is omitted, each annotation is independent. The value references a field on the annotation objects — `"name"` is the common case, but any field (e.g. `"group_id"`) can be used. If an annotation object is missing the `group_by` field, it is treated as an independent (ungrouped) annotation.

**Per-residue annotations** (`kind: "per-residue"`) — per-position values, polymer-keyed. Values can be numeric, string (categorical), or null. 
Enhancement: 
 - annotations commonly handled can also include lists, and vectors, and a mixture of numeric and categorical. 
  e.g. a secondary structure symbol can have a probability score associated with it, a conservation-like score (e.g. column consensus, physicochemcial property conservation) can have a string label (resp. the consensus sequence or the physicochemcial conservation symbol) and a vector of string:values (the sequence or property logo).
 - annotations may be dependent on a both an MSA context and one or more sequences. e.g. an msa is divided up into conserved subgroups each with their own conservation tracks.

Supports both dense (array) and sparse (object) representations:

```typescript
// Dense — array indexed by position
conservation: {
  kind: "per-residue",
  data: { light: [0.9, 0.85, 0.3, null, null, 0.1], heavy: [0.4, 0.72, null, 0.88] }
}

// Sparse — only non-null positions, keyed by index
highlights: {
  kind: "per-residue",
  data: { light: { 3: 0.9, 42: "hotspot", 187: 0.1 }, heavy: { 6: 0.85 } }
}
```

The runtime infers the representation: arrays are dense, objects are sparse. Missing positions in sparse format are implicitly `null`.

**Pairwise annotations** (`kind: "pairwise"`) — residue-residue relationships:

```typescript
contacts: {
  kind: "pairwise",
  data: [
    { polymer_a: "light", position_a: 23, polymer_b: "heavy", position_b: 105, data: { distance: 3.2 } },
  ]
}
```
Enhancements:
 Require matrix type pairwise data, and support directional semantics: e.g. PAE matrices are dense and not symmetric. 
Annotations can also be sourced:

```typescript
domains: { kind: "range", source: "features", selector: { kind: "json-field", path: ["domains"] } }
```

**Coordinate space**: All annotation positions default to **sequence coordinates** (gap-free). Override per-annotation:

```typescript
{ name: "conserved-col", range: { polymer: "light", start: 42, end: 42 }, coordinate_space: "alignment" }
```
Enhancements: 
- need to handle more than one alignment, so need to provide a specific identifier.
- Annotations will come from other sources and be mapped directly or indirectly onto a particular chain. These could be baked in (ie recorded already transformed to destination coordinate space), or left associated with their original polymer (for instance, exon boundaries are useful to map on to proteins but are associated with a particular splice origin).

Supported spaces: `"sequence"` (default), `"alignment"`, `"reference"`. When `"reference"` is used, the `reference_system` field specifies which: `{ coordinate_space: "reference", reference_system: "kabat" }`.

#### Assembly Values

Optional key-value metadata on the assembly, available to layout columns:

```typescript
values: { organism: "H. sapiens", expression_yield: 0.85 }
```

#### Gap Symbols

`gap_symbols` (default `["-"," ", "."]`) declares which elements in polymer sequences represent alignment gaps. The runtime uses this to derive the alignment ↔ sequence coordinate mapping.

#### Selectors

Selectors navigate into parsed data — they don't transform or filter.
(suggest the following addition:)
kind: defines the selector as sourcetype-field: where sourcetype is one of the core SVS formats or one provided by the implementation. Additional fields resolve to a stream of parsed data that is the same shape as the context expects.

```typescript
{ kind: "cif-field", category: string, field: string, row?: number }
{ kind: "fasta-field", name: string }
{ kind: "json-field", path: string[] }
```

### 4.3 Views

A view defines a rendering context. The coordinate system is optional — derived from referenced assemblies if omitted.

```typescript
const view = builder.view({
  name: "main",
  description: "Antibody VL/VH view",
  coordinate_system: {
    polymers: [
      { name: "light", start: 0, end: 200 },
      { name: "heavy", start: 0, end: 250 },
    ],
    polymer_gap: 2,
  },
  layout: {
    base_track_height: 36,
    columns: [
      { kind: "header", width: 120 },
      { kind: "canvas" },
      { kind: "value", name: "x", width: 60, label: "X" },
      { kind: "value", name: "y", width: 60, label: "Y" },
    ]
  }
})
```

When derived: polymer order follows the first assembly referenced by an assembly-backed feature in the view (inline-only features do not participate in derivation). Ranges span full sequence length, `polymer_gap` defaults to `0`. When specified: used as-is, no merging.

#### Layout

| Param              | Type              | Description                              |
|--------------------|-------------------|------------------------------------------|
| `base_track_height`| `number`          | Default track height in pixels.          |
| `columns`          | `LayoutColumn[]`  | Column definitions controlling the horizontal structure of the view. |

Recommend supporting rows as well as columns. Rchie is an example of an RNA layout where two alignments are shown above and below, so paired bases are shown in same column. The derefencable MSA 

#### Layout Columns

Columns define the horizontal structure of the entire view — header, canvas, and data columns. Column order in the array defines visual order left to right.

```typescript
type LayoutColumn =
  | { kind: "header"; width: number | string; is_hidden?: boolean }
  | { kind: "canvas" }
  | { kind: "value"; name: string; width: number | string; label?: string; is_hidden?: boolean }
```

- **`header`** — displays `track.header`.
- **`canvas`** — the main sequence/feature rendering area. Takes remaining space. Exactly one per layout.
- **`value`** — displays a named value. Resolved via lookup chain: `track.values[name]` → `assembly.values[name]`. `label` is the column header text (defaults to `name`).

### 4.4 Sections

Sections group tracks into layout regions.

```typescript
const seqSection  = view.section("sequence",  { height: "min-content" })
const annotSect   = view.section("annotations")
const msaSection  = view.section("msa",       { max_height: 400, horizontal_view: "zoomed" })
const consensus   = view.section("consensus",  { height: "min-content" })
```

| Param              | Type                                     | Description                                 |
|--------------------|------------------------------------------|---------------------------------------------|
| `name`             | `string`                                 | Section identifier.                         |
| `height`           | `"min-content"` \| `"auto"` \| `number`  | Height behavior.                            |
| `max_height`       | `number`                                 | Max pixel height before scrolling.          |
| `horizontal_view`  | `"zoomed"` \| `"full"`                    | Default for tracks in this section.         |
| `vertical_view`    | `"default"` \| `"full"`                   | Vertical layout mode.                       |
| `vertical_padding` | `number`                                 | Padding in pixels.                          |
| `is_hidden`        | `boolean`                                | Initially hidden.                           |
| `track_style`      | `TrackStyle`                              | Default track styling.                      |

### 4.5 Tracks

A horizontal lane containing features layered in declaration order. A track references an assembly, which features inherit unless they specify their own.

```typescript
msaSection
  .track({ id: "msa-1", header: "Track 1", assembly: "msa-entry-1", options: { draw_gaps: true } })
  .feature({ type: "swatch", annotation: "colors" })   // inherits assembly from track
  .feature({ type: "sequence" })                        // inherits assembly from track
```

| Param             | Type                    | Description                                          |
|-------------------|-------------------------|------------------------------------------------------|
| `id`              | `string`                | Unique track identifier.                             |
| `header`          | `string`                | Display label.                                       |
| `assembly`        | `string`                | Assembly reference. Features inherit this unless they override. |
| `height_factor`   | `number`                | Multiplier on base track height (default `1.0`).     |
| `horizontal_view` | `"zoomed"` \| `"full"`  | Overrides section-level setting.                      |
| `values`          | `Record<string, any>`   | Per-track metadata, available to layout columns.      |
| `options`         | `TrackOptions`          | Behavior options.                                    |

**TrackOptions**: `draw_gaps` (boolean), `stack_features` (boolean).
Clarification 
 - does stack_features mean features on the track are rendered over eachother magically ? (see below re rendering overlaid annotations)

#### Child Tracks

Tracks can contain child tracks for hierarchical grouping. Child tracks inherit `assembly`, `horizontal_view`, and `options` from their parent unless explicitly overridden. `values` are not inherited — they are per-track metadata.

```typescript
const cdrTrack = annotSect.track({ id: "cdr", header: "CDR", assembly: "antibody" })

cdrTrack
  .track({ id: "cdr1", header: "CDR1" })   // inherits assembly from parent
  .feature({ type: "block", annotation: "cdr1-regions" })

cdrTrack
  .track({ id: "cdr2", header: "CDR2" })
  .feature({ type: "block", annotation: "cdr2-regions" })
```

In the serialized SVS state, child tracks appear as a `children` array:

```jsonc
{
  "id": "cdr",
  "header": "CDR",
  "assembly": "antibody",
  "children": [
    { "id": "cdr1", "header": "CDR1", "features": [{ "type": "block", "annotation": "cdr1-regions" }] },
    { "id": "cdr2", "header": "CDR2", "features": [{ "type": "block", "annotation": "cdr2-regions" }] }
  ]
}
```

Nesting depth is not limited by the spec, but viewers may impose practical limits. A parent track can have both its own features and child tracks — features on the parent render as an overview, children provide the detail.

### 4.6 Features

Features are the leaf rendering primitives. A feature inherits `assembly` from its parent track, or can override it.

```typescript
// Assembly inherited from track
.feature({ type: "sequence" })
.feature({ type: "block", annotation: "cdrs" })
.feature({ type: "bars", annotation: "conservation", data: { threshold: 90, range: [0, 1] } })

// Assembly overridden on feature
.feature({ type: "sequence", assembly: "different-assembly" })

// Inline — no assembly reference
.feature({
  type: "block",
  ranges: { light: [{ start: 10, end: 50 }] },
  data: { label: "My Region", color: "#E5E7EB" }
})
```

| Param        | Type                           | Description                                         |
|--------------|--------------------------------|-----------------------------------------------------|
| `type`       | `string`                       | Feature kind — determines renderer.                 |
| `assembly`   | `string`                       | Assembly reference. Inherited from track if omitted. |
| `annotation` | `string`                       | Named annotation on the assembly.                   |
| `tooltip`    | `string`                       | Named annotation on the assembly for hover content. |
| `ranges`     | `Record<string, Range[]>`      | Explicit ranges. Defaults to full coordinate system. |
| `data`       | `any`                          | Inline data and/or renderer configuration.          |

Enhancement/Clarification:
 1 - How do stackable features - overlaying on a preceeding track work ?
   In jalview:
   - range annotations (what we call features) are overlaid on a sequence in order, where each annotation has a distinct colours+alpha. Other changes to the sequence rendered at that position may also be possible per feature. I would model that as a renderer that takes an ordered list of annotation selectors, which allows the renderer to select for each sequence being rendered any relevant annotation in order according to the selector.
    - filtering and per-value shading (e.g. a domain name string is used to generate a colour for a domain type feature).  
2 - WHat if a renderer needs to modulate an existing rendered feature according to some other data ?
   - Any form of per-residue shading (ie swatch) can be additionally modified by a function dependent on an annotation track proximal to the context. Ie an MSA is a sequence render context with a conservation annotation score, and groups of aligned sequences within the MSA can also have a conservation annotation score which passed to the renderer instead of the msa-context's conservation score. These effects can be combined: ie. one can have one annotation that modulates shading, and another that defines a threshold for display. 


#### Tooltip Behavior

The `tooltip` field references an annotation on the assembly by name. The renderer resolves content based on the hovered position:

- **Range tooltip annotation**: content shown when hovering within a matching range.
- **Per-residue tooltip annotation**: the value at the hovered position is used.
- **Mixed shapes** (e.g. feature displays a range, tooltip is per-residue): renderer uses best-effort lookup at the hovered position.
- **Overlapping tooltip ranges**: resolved by the renderer (e.g. most specific wins).

Tooltip content in annotation `data` fields may contain markdown. Renderers that do not support markdown should render it as plain text.

#### Core Feature Vocabulary

Conforming renderers must recognize these types and either render them faithfully for compatible data or degrade gracefully for unsupported combinations.

| Type        | Description                                    | Typical data                          |
|-------------|------------------------------------------------|---------------------------------------|
| `sequence`  | Render residue letters/codes.                  | Assembly polymer sequence.            |
| `block`     | Colored rectangular region with optional label.| `{ label, color }`                    |
| `bars`      | Per-residue vertical bars.                     | `{ threshold, range }` + per-residue. |
| `heatmap`   | Per-residue color-mapped values.               | Per-residue + color scale.            |
| `swatch`    | Per-residue background color.                  | Per-residue (colors).                 |
| `pairwise`  | Residue-residue relationship visualization.    | Pairwise annotation.                  |

Unknown types are passed through — renderers should ignore them or render a fallback.

### 4.7 Batch Expansion

For MSA-scale data, assemblies can be expanded from a single source. Batch expansion describes how entries in a source map to assemblies. Expansions currently are explicit - ie no expressions, conditionals or other parameterisations (aka templating) are allowed. Complex mappings are resolved prior serialization.

Discussion:
  - making the data composition of the MSA explit at serialization has advantages - e.g. conservation values that depend on the visible set of sequences are recalculated prior to display, and since the -star framework will also ensure efficient differential updates, transitions between different views of the same MSA will be handled smoothly. However, I'm slightly concerned that bloat will happen, since the serializing function will need to manage the superset of msa data to generate a series of transitions. The pathological case is - for instance, transitioning from an msa showing all sequences, to all even, then all odd sequences. 

```typescript
builder.assemblies("msa-entries", {
  source: "msa",
  each: "entry",
  polymers: {
    sequence: { selector: { kind: "fasta-field" } }
  }
})
```

For paired entries (e.g. VL/VH), the source data must be structured so that each logical entry contains both polymers:

```typescript
builder.assemblies("msa-entries", {
  source: "paired-msa",
  each: "entry",
  polymers: {
    light: { selector: { kind: "json-field", path: ["vl_sequence"] } },
    heavy: { selector: { kind: "json-field", path: ["vh_sequence"] } },
  }
})
```

Tracks for batch-expanded assemblies reference the batch:

```typescript
msaSection.tracks("msa-entries", {
  each: "assembly",
  features: [
    { type: "swatch", annotation: "colors" },
    { type: "sequence" },
  ]
})
```

This area of the spec is less mature (not sure if you mean 'mature' ? perhaps less complex ?) than other sections. The approach avoids the complexity of a template language — there are no expressions, no conditionals, no string interpolation. If more complex mapping is needed, it should happen in the builder layer before serialization.

### 4.8 Custom Fields

Every builder call accepts `custom` for renderer-specific extensions:

```typescript
builder.assembly("ab", { polymers: { ... }, custom: { source_organism: "Homo sapiens" } })
view.track({ id: "seq", header: "Sequence", custom: { highlight_on_hover: true } })
.feature({ type: "sequence", custom: { color_scheme: "clustal" } })
```

## 5. Coordinate Spaces

Three coordinate spaces exist for any polymer. The runtime derives mappings between them.

**Alignment coordinates** — column index in an aligned sequence (includes gap positions). Present when sequence data contains gap characters.

**Sequence coordinates** — position in the gap-free sequence. Derived by counting non-gap elements. This is the default coordinate space for annotations and ranges.

**Reference coordinates** — position in an external reference system. Derived from the polymer's `identity` (primary reference) and/or `references` (parallel numbering systems). When multiple reference systems exist, the specific system must be named.

**Resolution chain**:
```
alignment column  →  sequence position  →  reference position(s)
```

The runtime uses `gap_symbols` to map alignment ↔ sequence, `identity` for the primary reference mapping, and `references` for additional parallel systems.

## 6. Recommended Event Model

The spec recommends that viewers emit events carrying full coordinate context. The key principle: **pass the coordinate system with the event, not just the position**.

```typescript
interface SequenceEvent {
  kind: string                         // viewer-defined: "hover", "select", etc.
  assembly?: string
  coordinate_system: CoordinateSystem

  selections: SequenceSelection[]      // one or more, potentially multi-polymer
}

Refinement: Suggest allowing multiple positions per reference, rather than having to repeat the context multiple times. Sometimes a reference may map to several sequence positions and vice-versa (DNA/Protein is one). 

Clarification: I guess we leave it to the viewer to determine whether it is sensitive to the order of the list in selections: ?

interface SequenceSelection {
  polymer: string
  start: SequencePositions
  end: SequencePositions                // same as start for single-residue
  identity?: PolymerIdentity
}

interface SequencePositions {
  alignment_position?: number[]
  sequence_position: number[]
  reference_positions?: ReferencePosition[]
}



interface ReferencePositions {
  system: string                       // "uniprot", "kabat", "imgt", "pdb-auth", etc.
  position: number[] | string[]            // string for insertion codes like "27A"
}
```

A single-residue hover is one selection with `start === end`. A crosslink between VL and VH is two selections. Reference positions are explicit about which system they belong to — a Mol* viewer looks for `system: "uniprot"`, an antibody tool looks for `system: "kabat"`.

Clarification: This suggests an event generator produces the reference position mapping ? Ie if a kabat or uniprot reference is missed, and only the minimum of polymer:position is given, is there an expectation that viewers can interpolate to coordinates they understand ? 
Enhancement: It is important to preserve the semantics of *what* was interacted with - e.g. if a cross-link was interacted with then it should be referenced in the selection too - not least because there could be many cross links (each with different metadata), and a selection message involving a crosslink should be distinct from one that selects the two sites on VL and VH.

Event kinds are viewer-defined — the spec does not enumerate them.

## 7. Multiple Views

The `views` array supports multiple views in a single SVS state. Each view is a self-contained rendering context.

```typescript
const overview = builder.view({ name: "overview", description: "Full sequence with annotations" })
const detail   = builder.view({ name: "msa-detail", description: "MSA alignment view" })
```

Presentation of multiple views (side-by-side, tabs, stacked) and coordination between them (linked hover, shared selection) are viewer concerns.

## 8. MolViewSpec Integration (Optional)

SVS can optionally integrate with [MolViewSpec](https://molstar.org/mol-view-spec) for synchronized 1D+3D views. The primary coordination mechanism is **identity-based**: both specs reference polymers with identity metadata, events carry full coordinate context, and the consumer resolves in its own space. Reference systems provide additional local numbering overlays that viewers may use for display but are not required for cross-spec coordination. No shared state needed. SIFTS resolution (`resolve: "sifts"`) is a runtime concern.

## 9. Serialized Format (SVS State)

```jsonc
{
  "svs_version": "0.1.0",

  "sources": {
    "structure": { "url": "https://files.rcsb.org/download/7FAB.cif", "format": "cif" }
  },

  "assemblies": {
    "antibody": {
      "gap_symbols": ["-"],
      "polymers": {
        "light": {
          "sequence": "CTVPQQTYLRDTGSASD...",
          "identity": { "kind": "uniprot", "id": "P01234", "start": 21, "end": 220 },
          "references": {
            "kabat": { "kind": "numbering-scheme", "scheme": "kabat", "mapping": [1, 2, 3, "27A", "27B", 28] }
          }
        },
        "heavy": {
          "source": "structure",
          "selector": { "kind": "cif-field", "category": "entity_poly", "field": "pdbx_seq_one_letter_code_can", "row": 1 },
          "identity": { "kind": "pdb", "entity_id": "2", "auth_asym_id": "H", "resolve": "sifts" },
          "references": {
            "auth": { "source": "structure", "selector": { "kind": "cif-field", "category": "atom_site", "field": "auth_seq_id" } }
          }
        }
      },
      "annotations": {
        "cdrs": {
          "kind": "range",
          "group_by": "name",
          "data": [
            { "name": "CDR1", "range": { "polymer": "light", "start": 24, "end": 40 } },
            { "name": "CDR2", "range": { "polymer": "light", "start": 56, "end": 70 } },
            { "name": "CDR1", "range": { "polymer": "heavy", "start": 26, "end": 38 } },
            { "name": "CDR2", "range": { "polymer": "heavy", "start": 56, "end": 65 } }
          ]
        },
        "conservation": {
          "kind": "per-residue",
          "data": {
            "light": [0.9, 0.85, 0.3, 0.1],
            "heavy": [0.4, 0.72, 0.15, 0.88]
          }
        }
      },
      "values": {
        "organism": "H. sapiens"
      }
    }
  },

  "views": [{
    "name": "main",
    "layout": {
      "base_track_height": 36,
      "columns": [
        { "kind": "header", "width": 120 },
        { "kind": "canvas" },
        { "kind": "value", "name": "x", "width": 60, "label": "X" },
        { "kind": "value", "name": "y", "width": 60, "label": "Y" }
      ]
    },
    "sections": [
      {
        "name": "sequence",
        "height": "min-content",
        "tracks": [{
          "id": "seq",
          "header": "Sequence",
          "assembly": "antibody",
          "features": [{ "type": "sequence" }]
        }]
      },
      {
        "name": "annotations",
        "tracks": [{
          "id": "cdr",
          "header": "CDR",
          "assembly": "antibody",
          "features": [{ "type": "block", "annotation": "cdrs" }]
        }]
      },
      {
        "name": "consensus",
        "height": "min-content",
        "tracks": [{
          "id": "cons",
          "header": "Conservation",
          "assembly": "antibody",
          "horizontal_view": "full",
          "features": [{
            "type": "bars",
            "annotation": "conservation",
            "data": { "threshold": 90, "range": [0, 1] }
          }]
        }]
      }
    ]
  }]
}
```

## 10. Implementation Notes

SVS can be implemented incrementally. A reasonable progression:

**Start with inline assemblies and views.** Handle SVS states with inline sequence and annotation data. Implement the core feature vocabulary (`sequence`, `block`, `bars`, `heatmap`, `swatch`, `pairwise`). Derive coordinate systems from assemblies. This alone is sufficient for many use cases.

**Add source pipeline.** Implement `download`, `parse`, and selector-based construction. This enables self-contained SVS states that fetch their own data. Selectors navigate — they don't transform. Data must conform to expected shapes, or the runtime provides format-specific adapters.

**Add reference resolution.** Implement `identity`-based coordinate mapping and `references` for parallel numbering systems. This enables cross-view coordination, reference numbering on rulers, and rich event payloads.

**Add batch expansion.** Implement `.assemblies` / `.tracks` lens-based expansion for MSA-scale data. The expansion maps source entries to assembly structure — no templating, no expressions, no string interpolation.

**Add lazy loading.** Sources marked `lazy: true` are fetched only when a referencing feature becomes visible.

Each capability is independently useful. A minimal conforming viewer handles inline assemblies and the core feature vocabulary. Everything else enhances capability without changing the fundamental model.

**Versioning and forward compatibility.** The `svs_version` field follows semver. When a viewer encounters an SVS state with a newer minor version, it should process what it understands and ignore unknown fields outside of `custom`. Unknown annotation `kind` values, unknown feature `type` values, and unrecognized top-level fields should be ignored gracefully — not cause failures. A newer major version may require explicit handling. Viewers should surface a warning when encountering unknown fields, not fail silently.

**Companion adapter libraries.** The spec intentionally keeps selectors minimal (no transforms). In practice, common data sources (mmCIF, UniProt API, FASTA) have well-known shapes that need mapping to SVS's annotation and polymer models. Companion adapter libraries — shipped alongside but outside the spec — should handle these transformations for common formats.

## Appendix A — Design Constraints

Why the spec looks the way it does. Each constraint captures a decision, the reasoning, and what would change it.

### C1: Assembly as the central abstraction

**Decision**: All sequence, annotation, and value data flows through a named "assembly" before reaching the view layer.

**Why not data directly on features?** Supported as a convenience (inline features), but as the primary pattern it leads to duplicated data and no single source of truth.

**Why not a generic data store?** The assembly maps directly to a domain object bioinformatics tools already understand: a collection of named polymer sequences with annotations.

**What would change this**: If the assembly indirection consistently adds ceremony without value in real use cases.

### C2: Identity and references on polymers

**Decision**: Each polymer carries optional `identity` (provenance) and optional `references` (parallel numbering).

**Why separate?** They answer different questions. Identity says "where does this polymer come from" (segmented provenance via `composite`). References say "how else can positions be numbered" (Kabat, IMGT, PDB auth). Conflating them forces provenance to model numbering schemes.

**Why per-polymer?** A single assembly can contain polymers from different sources with different identities and different numbering needs.

**Why optional?** Internal sequences may have no public identity. The spec must work without them.

**What would change this**: If `references` mapping types prove insufficient for real antibody numbering workflows.

### C3: Three coordinate spaces, runtime-resolved

**Decision**: Alignment, sequence, and reference coordinates. Runtime derives mappings from gap symbols, identity, and references.

**Why "reference" not "canonical"?** The third space isn't always a single canonical system — UniProt, Kabat, IMGT, PDB auth are all valid. "Reference" is accurate without implying uniqueness.

**Why derivable?** Gap symbols + identity + references fully determine all mappings. Pre-computed tables would be redundant.

**What would change this**: Edge cases where derivation is too expensive or the gap-counting heuristic is insufficient.

### C4: Coordinate system derived by default

**Decision**: Views derive their coordinate system from referenced assemblies. Explicit specification overrides completely — no merging.

**Why?** The common case is obvious — polymer lengths in order. Requiring it would be boilerplate.

**What would change this**: If the derivation rule (first assembly-backed feature in the view) proves ambiguous for complex multi-assembly views.

### C5: Explicit annotation `kind` discriminators

**Decision**: Annotations carry `kind: "range" | "per-residue" | "pairwise"`.

**Why not shape inference?** Pushes defensive parsing to renderers, produces unclear errors, creates ambiguity. One extra field eliminates an entire class of bugs.

**What would change this**: Nothing. Resolved based on convergent feedback.

### C6: Explicit `group_by` for multi-polymer annotations

**Decision**: Range annotations support `group_by` — a field reference declaring how annotations are logically grouped.

**Why not implicit name-matching?** Brittle for complex assemblies where names might collide. Explicit grouping is intentional and configurable.

**Why a field reference, not group objects?** The common case (`group_by: "name"`) is one field. Group objects add structure most annotations don't need.

**What would change this**: If renderers need richer group metadata.

### C7: Builder-first, SVS state as serialization target

**Decision**: TypeScript builder for authoring, JSON SVS state for interchange.

**Why?** JSON is verbose for authoring. Builder provides type safety, loops, composability. Same approach as MolViewSpec.

**What would change this**: Nothing for JSON as interchange. Builder API will evolve.

### C8: Selectors are declarative pointers

**Decision**: Selectors navigate into parsed data. They don't filter, transform, or query.

**Why?** Filtering/transformation requires a query language (scope creep) or rigid matchers (too limited). The spec defines target shapes; getting there is the user's or adapter's problem.

**What would change this**: If adoption friction proves too high. The answer would be a companion adapter library, not spec complexity.

### C9: Gap symbols at assembly level

**Decision**: Assembly declares gap characters. Runtime derives alignment ↔ sequence mapping.

**Why assembly-level?** Different assemblies may use different conventions, but within one assembly they should be consistent.

**What would change this**: Unlikely edge cases with per-polymer gap conventions.

### C10: Events carry typed reference positions

**Decision**: Events carry `{ system: string, position: number | string }` for each resolvable reference system.

**Why typed?** A bare number doesn't say which reference system. Typed positions are unambiguous and forward-compatible with any number of reference systems.

**Why `number | string`?** Antibody numbering systems use insertion codes like `"27A"`.

**What would change this**: Nothing. One of the most grounded decisions.

### C11: `custom` on every node

**Decision**: Every node supports `custom: any` for renderer-specific extensions.

**Why?** Pressure valve preventing spec bloat. Same pattern as MolViewSpec.

**Discipline**: If the same `custom` fields appear across multiple renderers, promote them into the spec.

**What would change this**: Nothing.

### C12: Core feature vocabulary

**Decision**: Six feature types that conforming renderers must recognize: `sequence`, `block`, `bars`, `heatmap`, `swatch`, `pairwise`.

**Why?** Without a minimum vocabulary, "SVS-compliant" means nothing operationally. With it, renderers have a concrete behavioral contract.

**What does "must recognize" mean?** Renderers must either render the feature faithfully for compatible data, or degrade gracefully. Silently dropping a core feature type without any indication is non-conforming.

**What would change this**: The vocabulary may grow as the spec matures. It should remain small and boring.

### C13: Track-level assembly reference with feature inheritance

**Decision**: Tracks carry an `assembly` reference. Features inherit it unless they override.

**Why?** In the MSA case, every feature on a track references the same assembly. Repeating `assembly: "msa-entry-42"` on every feature is boilerplate. Putting it on the track and letting features inherit reduces noise.

**Why allow feature-level override?** A track might display data from multiple assemblies — e.g. a comparison track with features from two different constructs.

**What would change this**: Nothing. Simple inheritance with explicit override is the right pattern.

### C14: Layout columns with typed kinds

**Decision**: Layout columns have `kind: "header" | "canvas" | "value"` rather than relying on reserved name strings.

**Why typed?** Each kind has different behavior and properties. A discriminated union makes this explicit and extensible.

**Why a value lookup chain?** `track.values[name]` → `assembly.values[name]` covers the common cases (per-track metrics, assembly-level metadata) without requiring explicit path syntax.

**What would change this**: If the lookup chain proves insufficient or ambiguous. Explicit path references could be added later.

## Appendix B — Active Residuals

### R1: Annotation Semantic Richness

```
[annotations as geometry + payload ‖ annotations as typed semantic objects]
```

The core spec stays geometric — `kind` describes shape, `data` carries payload. Semantic richness (evidence, provenance, confidence, display metadata) belongs in companion profiles, not the core.

**Constraint**: core stays geometric. Semantic vocabularies live in profiles and `data`/`custom` conventions.

### R2: MSA Scale / Batch Expansion

```
[each assembly individually defined ‖ batch expansion from single source]
```

The lens-based approach maps source entries to assemblies without templating. The boundary is firm: batch expansion describes data mapping, not computation. Complex logic belongs in the builder layer.

**Constraint**: simple cases (one source, one polymer per assembly) must be trivial. If the lens approach shows pressure to grow into a template language, that pressure should be redirected to the builder API.

### R3: Selector Simplicity vs Data Reality

```
[selectors as declarative pointers ‖ real-world data requires transformation]
```

Selectors navigate, they don't transform. The gap between raw data and SVS-shaped data is the user's problem. If painful, the answer is a companion adapter library.

**Constraint**: the spec must not grow a query/transform language.

### R4: Reference Mapping Efficiency

```
[dense per-position arrays ‖ sparse/rule-based numbering schemes]
```

The `numbering-scheme` type uses dense arrays. For large proteins with few insertions, this is wasteful. Source-backed references mitigate this (the data lives in the source file, not the SVS state), but a sparse mapping type may eventually be needed for inline cases.

The sparse object pattern introduced for per-residue annotations (`Record<number, value>` instead of arrays) could be applied to numbering scheme mappings as well — only non-default positions would be stored. This is not yet specified but would be a natural extension.

**Constraint**: source-backed references handle the common large-data case. Inline dense arrays are acceptable for small sequences. A sparse format can be added later without breaking existing states.