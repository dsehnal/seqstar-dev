# Seq* Prototype Reconciliation

Status: revised proposed baseline for the prototype specification

This note reconciles:

- the Seq* scope and publication drafts in this directory;
- SeqViewSpec draft v0.6;
- the changes and inline discussion in `dsehnal/seqstar-dev#1`;
- the practical requirement to demonstrate one base sequence viewer, Mol*,
  Nightingale, and a multi-page React application.

It is intentionally narrower than the long-term Seq* vision. The prototype
should test the contracts between data, views, renderers, coordinate mappings,
and interactions. It should not attempt to deliver the complete future
platform.

## 1. Reconciled terminology and boundaries

### Seq*

Seq* is the umbrella project: reusable sequence data, coordinate, state,
interaction, and visualization infrastructure. It is not synonymous with a
single renderer or with SeqViewSpec.

### SeqViewSpec

SeqViewSpec is the portable, versioned JSON description of a sequence view. A
TypeScript builder is the preferred authoring API, but JSON is the interchange
and reproducibility format. A SeqViewSpec document is carried in a visualization
request and consumed by any compatible sequence-viewer wrapper. It is not the
application architecture, shared runtime state, or extension mechanism.

SeqViewSpec is equivalent in architectural role to MolViewSpec: each describes
what a compatible visualizer should display. Neither specification orchestrates
other viewers, routes events, registers coordinate translators, or defines the
hosting application.

SeqViewSpec describes:

- normalized sequence-domain data required by a view;
- named coordinate spaces and mappings;
- annotations and their biological targets;
- view composition and portable visual intent;
- visual properties needed to reproduce the requested sequence view.

It does not perform domain computation, execute arbitrary transformations, or
encode renderer implementation details.

### Runtime and base viewer

The Seq* library is the reusable sequence-domain foundation: data and model
types, IO, coordinate and mapping algorithms, alignment and annotation
algorithms, queries, representations, rendering infrastructure, and the
reference sequence viewer. It can be used without the application harness.

The existing canvas-based sequence viewer is a Seq* rendering component. Like
Nightingale, it is exposed to the wider ecosystem through a
SeqViewSpec-consuming harness wrapper.

### Nightingale and Mol*

Nightingale and Mol* participate as autonomous wrapped components connected by
the harness event fabric:

- the Nightingale wrapper consumes SeqViewSpec visualization requests, maps
  them to existing Nightingale web components, and publishes interaction and
  lifecycle events;
- the Mol* wrapper consumes MVS visualization requests, loads the supplied
  MolViewSpec into Mol*, and publishes structure interaction and lifecycle
  events;
- the application harness composes plugins and routes messages. Application
  page code does not contain biological coordinate-translation or
  view-generation logic.

Calling Nightingale vNext the primary future Seq* implementation remains a
long-term project direction, not a premise the prototype has to prove. For the
prototype, current Nightingale is a second sequence-rendering target.

## 2. Reconciled distributed architecture

The architecture has three principal layers: declarative view specifications,
visualization libraries/components, and an event-driven application harness.
It is not a single Seq* plugin context or shared state tree:

```text
 view specifications       SeqViewSpec       MolViewSpec       future specs
                                |                 |                 |
                                v                 v                 v
 visualizers/libraries     Seq* / Nightingale    Mol*       Neuroglancer, ...
                                \                 |                 /
                                 \---- wrappers --+-- wrappers ----/
                                                   |
                                                   v
 application ecosystem                  typed event fabric
                              translators + synchronization + routing
                                                   |
                                                   v
                                      ApplicationHarnessSpec
                          components + plugins + policies + layout
```

Each wrapped visualizer owns its local state, lifecycle, and rendering. The
harness knows how visualizers are instantiated, how typed messages are routed,
which coordinate translators are registered, and which interactions should be
synchronized. It does not absorb the internal state model of Mol*, Nightingale,
Neuroglancer, or the base viewer.

The resulting system separates:

1. **View specifications**: SeqViewSpec, MolViewSpec, and future equivalents
   describe only what should be visualized.
2. **Domain libraries**: Seq*, Mol*, and future libraries provide algorithms,
   models, representations, and rendering capabilities.
3. **Wrapped visualizers**: independent consumers/producers such as the Seq*
   viewer, Nightingale, Mol*, and Neuroglancer.
4. **Harness events and services**: visualization requests, interactions,
   translator registration, coordinate conversion, synchronization, lifecycle
   notifications, results, and errors.
5. **Application plugins**: UniProt, SIFTS/PDBe, AFDB, Jalview, EMDB, mapping,
   and cross-visualizer view-generation capabilities.
6. **Application composition**: component instances, plugin installation,
   message routes, policies, and layout.

### Library layers

The broader module list in the publication outline remains part of the design.
For the prototype it should be interpreted as dependency layers, not
necessarily one published package per name:

| Layer | Responsibility |
| --- | --- |
| `seq-data` | Efficient immutable/tabular containers, columnar encodings, and generic data utilities. |
| `seq-io` | Parsers, format providers, downloads, and source resolution. |
| `seq-model` | Polymers, assemblies, alignments, annotations, provenance, and normalized domain objects. |
| `seq-coords` | Named coordinate spaces, loci, mappings, mapping composition, and ambiguity handling. |
| `seq-query` / future `seq-ql` | Programmatic selection/query primitives; a serialized query language is deferred. |
| `seq-algorithm` | Alignment, conservation, consensus, comparison, and annotation-transfer algorithms exposed as services or plugin capabilities. |
| `seq-state` | Optional reactive local-state, snapshot, and update utilities for Seq* components; not a mandatory application-wide state tree. |
| `seq-view-spec` | Portable sequence-view schema, builder, validation, and normalization. |
| `seq-representation` / `seq-viewer` | Sequence representations, rendering infrastructure, reusable UI, and the reference canvas viewer. |
| harness packages | Event schemas and streams, application harness, translator registry, synchronization, plugin contracts, lifecycle, routing, and policies. |
| integration packages | Seq* viewer wrapper, Nightingale wrapper, Mol*/MVS wrapper, Neuroglancer wrapper, UniProt, SIFTS/PDBe, EMDB, Jalview, and other plugins. |

The table separates Seq* library modules from the harness and integration
packages above them. Lower Seq* layers must not import the harness, UI, or a
particular renderer. A wrapper may use the native state/plugin system of the
component it hosts, but that implementation does not become a requirement for
other visualizers.

### ApplicationHarnessSpec

The high-level composition document should be an `ApplicationHarnessSpec` (the
final public name can change), conceptually:

```typescript
interface ApplicationHarnessSpec {
  components: ComponentInstanceSpec[]
  plugins?: HarnessPluginSpec[]
  translators?: CoordinateTranslatorRegistration[]
  synchronization?: InteractionSyncRule[]
  routes?: EventRouteSpec[]
  policies?: HarnessPolicies
  layout?: ApplicationLayoutSpec
  config?: Record<string, unknown>
}
```

It answers application-level questions:

- which component instances exist;
- which wrapper or factory creates each instance;
- which plugins contribute producers, consumers, processors, or UI;
- which coordinate translators are initially registered and which plugins may
  register more at runtime;
- which interaction kinds and visualizer instances are synchronized;
- which event topics/capabilities are routed to which instances;
- whether delivery is broadcast, targeted, latest-only, queued, or replayed;
- how errors, unsupported requests, feedback loops, and component disposal are
  handled;
- how components are placed in the host application.

The harness spec does not serialize the local Mol* or Nightingale state. It can
reference initial SeqViewSpec/MolViewSpec requests or fixture sources, while
the payload specifications remain independently portable.

An illustrative composition—not a frozen API—would read like:

```typescript
createApplicationHarness({
  components: [
    { id: "sequence", wrapper: nightingaleSeqViewSpecWrapper() },
    { id: "structure", wrapper: molstarMvsWrapper() },
  ],
  plugins: [uniprotToMvsPlugin()],
  synchronization: [
    synchronize("highlight", { between: ["sequence", "structure"] }),
  ],
  routes: [
    route("seqviewspec.visualization.request").to("sequence"),
    route("annotation.show-in-structure").through("uniprot-to-mvs"),
    route("mvs.visualization.request").to("structure"),
  ],
})
```

Routing the first topic to both a base-viewer instance and a Nightingale
instance would display the same SeqViewSpec in both without changing either
payload or producer.

### Typed event fabric

All messages use a common versioned envelope while retaining payload-specific
schemas:

```typescript
interface HarnessMessage<TType extends string, TPayload> {
  id: string
  type: TType
  version: string
  source: { component: string; plugin?: string }
  target?: { component?: string; capability?: string }
  correlationId?: string
  causationId?: string
  timestamp: string
  payload: TPayload
}
```

The minimum message families are:

- visualization requests, illustratively `seqviewspec.visualization.request`
  and `mvs.visualization.request`;
- domain intents such as `annotation.show-in-structure`;
- normalized interaction events such as hover, select, focus, and viewport;
- translator registration/removal and coordinate-mapping requests/results;
- lifecycle results such as accepted, rendered, superseded, degraded, disposed,
  and failed;
- capability discovery/registration where static harness configuration is not
  sufficient.

`correlationId` connects a request to its results. `causationId` and source
identity prevent feedback cycles when, for example, Mol* selection produces a
sequence selection which is then reflected back to Mol*.

Messages should either be self-contained or carry stable document/object IDs
that consumers can resolve from another declared stream or service. Consumers
must not reach into another wrapper's private state. For example, the
UniProt/MVS processor can consume and retain its own projection of the original
SeqViewSpec request, then resolve a later track-header event using the shared
document, view, and track IDs.

Visualization channels should normally use latest-request-wins semantics per
target instance. Hover events may be coalesced. Durable selection and explicit
user actions must retain ordering. These policies belong to the harness route,
not to the portable view payload.

The prototype event fabric can be in-process and Observable-based. Keeping the
envelope and payloads serializable allows the same contracts to cross a web
worker, iframe, `MessageChannel`, or network boundary later without requiring a
distributed broker in the first implementation.

### Coordinate translator registry

The harness owns a registry of coordinate translators contributed by plugins.
The harness defines the registration, discovery, composition, and invocation
protocol; biological translation implementations can live in Seq*, SIFTS/PDBe,
UniProt, EMDB, or other integration packages.

A translator declares the source and target coordinate-space patterns it can
handle and maps typed loci between them. Translation may be asynchronous,
partial, discontinuous, one-to-many, or many-to-one. Results preserve
provenance, ambiguity, and optional confidence. A reverse translator is an
explicit capability rather than an assumption.

The registry forms a mapping graph. The harness can compose registered steps,
for example:

```text
UniProt sequence -> PDB chain/residue -> structure/volume frame -> tomogram voxel
```

Route policy determines which valid path to prefer. Visualizer wrappers publish
loci in coordinate spaces they understand and consume loci translated into
those spaces; they do not need to know which services produced the mapping.

### Interaction synchronization

Highlight synchronization is a harness responsibility and remains outside
SeqViewSpec and MolViewSpec:

```text
Mol* pointer move
  -> Mol* wrapper publishes highlight(structure loci)
  -> harness matches synchronization rule
  -> translator registry maps structure loci to sequence loci
  -> harness sends highlight command to sequence-viewer wrapper
  -> sequence viewer highlights mapped positions
```

The reverse path uses the same mechanism when the pointer moves over a sequence
residue. The harness preserves the original source and causation chain so the
reflected highlight is not emitted back indefinitely. Highlight is ephemeral,
coalesced, and latest-wins; selection can use a separate ordered/persistent
policy. An unmapped locus produces an explicit empty/clear result rather than an
incorrect positional guess.

### Wrappers and local ownership

A wrapper is a bidirectional boundary around a component:

- it declares the message types and capabilities it consumes and produces;
- it translates portable requests into the component's native API/state;
- it translates native interactions into normalized events;
- it applies targeted normalized interaction commands, such as translated
  highlight or selection loci, through the component's native API;
- it owns subscription cleanup, request cancellation, replacement semantics,
  readiness, and error reporting;
- it does not perform unrelated domain orchestration.

The Mol* wrapper consumes the MVS visualization-request stream. When the next
applicable request arrives, it validates the payload, loads or replaces the
view in its Mol* instance, and emits accepted/rendered/failed lifecycle
messages. It also normalizes Mol* hover and selection loci onto the shared
stream and applies incoming structure-locus highlight/selection commands.

The Nightingale wrapper consumes the SeqViewSpec visualization-request stream,
renders the next applicable request using Nightingale components, and publishes
normalized sequence interactions and lifecycle messages. The base sequence
viewer has the same external contract, which makes the two sequence renderers
substitutable from the harness perspective. Both wrappers also apply incoming
sequence-locus highlight/selection commands.

### Vendored Nightingale prototype

For the prototype, Nightingale is vendored into this repository as editable
source rather than consumed only as published npm packages. The workspace builds
against that local copy, and prototype-driven changes may be made directly to
it where doing so produces a clearer or more capable integration. It should be
committed as ordinary repository source, not hidden behind a Git submodule.

Vendoring does not remove the wrapper boundary:

- the Nightingale wrapper remains the harness-facing consumer/producer of
  visualization requests, interactions, and lifecycle messages;
- generic capabilities missing from Nightingale—such as imperative external
  highlight application, stable track identities, or cleaner event emission—may
  be implemented in the vendored Nightingale source;
- harness routing, coordinate translation, cross-view synchronization, and
  UniProt/MVS-specific orchestration remain outside Nightingale;
- the prototype application imports Nightingale packages from the local
  workspace, never from a second registry-installed copy.

The vendored tree must record its upstream repository and exact commit, retain
the upstream license/notices, and include a short change log for local patches.
The implementation plan should choose a directory and workspace layout that
makes `git diff` against upstream and a later rebase/update straightforward.
Vendoring the required packages plus their necessary shared build sources is
preferred over copying generated bundles; the exact subset will be established
after dependency inspection.

### Plugin composition and intent processing

Plugins extend the harness rather than a mandatory global viewer runtime. A
plugin can contribute:

- message producers, consumers, or processors;
- data/source adapters and coordinate-mapping services;
- SeqViewSpec or MolViewSpec generators;
- routing declarations and capability negotiation;
- application UI that publishes intents instead of calling viewers directly.

The publication outline's intent layer is the semantic boundary between UI and
view-generation logic. A track header can publish “show this annotation in a
structure view.” A UniProt/MVS plugin consumes that intent, resolves annotation
and mapping data, creates a complete MolViewSpec payload, and publishes an MVS
visualization request. The Mol* wrapper only needs to understand the MVS
request; it does not need UniProt-specific knowledge.

### Additional visualizer ecosystems

The harness contracts are not sequence/structure-specific. A new visualizer
joins by providing a wrapper, visualization-request payload contract, normalized
interaction events, and any relevant coordinate translators. Existing viewers
and view specifications do not need to change.

An extended EMDB use case can compose:

- a SeqViewSpec consumer using Seq* or Nightingale;
- a MolViewSpec consumer using Mol*;
- a tomogram consumer using Neuroglancer;
- plugins mapping sequence loci to structure loci and structure/spatial loci to
  tomogram coordinates;
- synchronization rules for highlight, selection, and focus across the three
  visualizers.

For example, hovering a residue in the sequence viewer can highlight it in Mol*
and, when a registered spatial mapping exists, highlight or focus the related
tomogram region in Neuroglancer. Interaction can originate in any of the three
visualizers. This requires new wrappers and translators, not a new central
application architecture.

## 3. Data model decisions

### Assemblies, polymers, and alignments

Retain `assembly` for a named biological grouping of one or more polymers, such
as a protein, antibody, complex, or construct. An assembly is not an MSA and an
MSA row is not a separate assembly merely to make batch rendering convenient.

Introduce named alignment objects as first-class data. An alignment has its
own identity, aligned members, column coordinate space, and mappings from
alignment columns to member sequence positions. Multiple alignments can
reference the same polymer, so any alignment coordinate must name its alignment.

This removes the current ambiguity among assembly, dataset, alignment, and
batch-expanded assembly. Batch APIs may remain as builder conveniences but must
compile to explicit resolved objects.

### Identity, provenance, and coordinate references

Separate three ideas:

- **identity**: stable, authority-qualified identification of a biological
  object, with version where relevant;
- **provenance**: sources, methods, parameters, citations, evidence, labels,
  descriptions, and links;
- **coordinate mapping**: an explicit relation between named coordinate
  spaces.

`custom` is an extension payload, not an identifier authority. Identity alone
must not imply that a mapping can be derived. Runtime adapters may resolve a
mapping through SIFTS or another service, but the resolved state records the
mapping or a resolvable mapping declaration.

Non-polymeric ligands are not residues inserted into a polymer sequence.
Residue modifications can be annotations that reference an authoritative
chemical component; independent ligands belong in structure-linked metadata or
annotations.

### Annotations

An annotation separates geometry, semantics, payload, and provenance:

- **geometry** says what sequence-domain loci are addressed;
- **semantic type** says what the annotation means;
- **payload** carries values and domain-specific fields;
- **provenance** explains origin and interpretation.

The core geometric forms should cover point/range, per-position, pairwise, and
matrix data. A boundary location (before/between residues) must be representable
without pretending it is a residue. Per-position values may be scalar,
categorical, structured, vector, or null. Dense and sparse encodings are both
valid serializations of the same logical data.

Import adapters normalize source-specific conventions. For example, a source
that encodes a disulfide as a range can compile it to pairwise geometry. The
view then chooses how to render that pairwise annotation. Atom- and bond-level
targets are outside the sequence core but may be retained as typed external
loci for a Mol* adapter.

### Sources, selectors, adapters, and lenses

Sources declare origin. Selectors only address data within an already understood
source format. They do not filter, transform, or compute.

Format- and resource-specific adapters perform parsing and normalization before
or during resolution. They are part of the library ecosystem, not the portable
core schema.

The current use of “lens” is too weak to be normative and should be removed
from the first specification. If retained later, a lens should mean a named,
typed projection or derivation extension between normalized data and a view.
SeqQL is likewise deferred until concrete prototype cases show what cannot be
expressed by explicit loci and adapter output.

### Gap encodings

The normalized model uses explicit alignment mappings. Gapped strings are a
convenient input representation, not the only coordinate model.

The parser layer may support FASTA-like gaps, A3M, CIGAR, or other compact
encodings. It normalizes them before rendering. `-` is the safe default gap
symbol; `.` may be enabled by a format adapter. Whitespace is syntax to trim,
not a default biological gap symbol.

## 4. Coordinate model decisions

The draft's three spaces are a useful minimum but must be instances, not global
categories. A position therefore identifies a named coordinate space, such as:

- sequence coordinates for a particular polymer;
- columns in a particular alignment;
- UniProt coordinates for a particular accession and version;
- PDB label/auth coordinates for a particular structure and chain;
- nucleotide/CDS coordinates for a particular transcript and orientation.

Prototype invariants:

- internal sequence and alignment intervals are zero-based and half-open;
- external reference labels are opaque `number | string` values and may include
  zero, insertion codes, missing values, and decreasing/reverse orientation;
- serialization never relies on an unstated one-based/zero-based convention;
- mappings may be partial, discontinuous, one-to-many, or many-to-one;
- direction and strand/orientation are explicit;
- mapping APIs return zero, one, or many results and expose ambiguity rather
  than silently choosing one.

The PR suggestion to turn `start` and `end` into arrays mixes a range boundary
with a set-valued mapping. Instead, use a locus model: a selection contains one
or more typed loci; each locus contains a point, interval, boundary, or
relationship in one coordinate space; the mapping service produces associated
loci in other spaces.

## 5. View and rendering decisions

Tracks contain ordered visual layers. Each layer references normalized data and
declares a portable visual intent. Layer order, opacity, and a small set of data
encodings are explicit. Renderer-specific behavior belongs in a namespaced
extension or renderer profile.

The initial portable vocabulary should remain deliberately small, but its names
must describe visual intent rather than data shape. The current `sequence`,
`block`, `bars`, `heatmap`, `swatch`, and `pairwise` set is an acceptable
prototype starting point.

`stack_features` means collision layout into additional lanes; it does not mean
visual compositing. Overlay/compositing comes from ordered layers. Modulating
one layer with another dataset should use an explicit encoding/scale reference,
not implicit access to a nearby track.

The prototype supports the conventional horizontal sequence axis with stacked
sections and tracks. Bidirectional or opposed layouts such as R-chie are a valid
future requirement, but adding arbitrary row/column layout to the portable spec
before a prototype renderer exists would overfit the first draft.

Labels, explanatory text, citations, methods, and safe outbound links are
portable metadata. Arbitrary URL templates or executable expressions are not
part of the core; builders/adapters materialize concrete links.

SeqViewSpec supplies stable identities and metadata for visual elements but
does not bind them to cross-visualizer application actions. Sequence-viewer
wrappers publish normalized events for intrinsic interaction surfaces such as a
track header or feature. Harness plugins interpret those events and may expose
application actions such as “show this track's annotation in a structure
view.” Unsupported actions are disabled or hidden according to harness
capability policy.

## 6. Interaction and event decisions

Interaction messages represent both **what was interacted with** and **where it
maps**. A message contains:

- a stable event kind from a small core (`hover`, `select`, `focus`,
  `viewport-change`) or a namespaced extension;
- origin/view information and a loop-prevention correlation identifier;
- the semantic target when present (annotation, feature/layer, relationship,
  or structure object identifier);
- one or more typed source loci;
- zero or more mapped loci produced by the coordinate service;
- interaction mode where relevant (`replace`, `add`, `remove`, `toggle`).

Selecting a cross-link is therefore distinct from selecting its two endpoints.
The relationship identifier is preserved while its endpoints are also exposed
as loci.

Consumers must not infer meaning from list order. Directional relationships use
named endpoint roles or an explicit direction. The event producer should use
a declared mapping plugin/service to enrich events, while another stream
processor may publish additional mapped loci if a needed space is absent.

### UniProt track-to-MolViewSpec composition

The UniProt example is a distributed request pipeline, not direct viewer
coupling or merely bidirectional event forwarding:

```text
user activates track header
        |
        v
ShowAnnotationInStructure intent
        |
        v
UniProt/MVS plugin resolves track -> annotation -> sequence loci
        |
        v
seq-coords maps sequence loci -> structure loci
        |
        v
plugin publishes an MVS visualization request with residue colors
        |
        +--> Mol* wrapper loads the request payload
        +--> export plugin serializes the same payload
        +--> another MVS consumer can receive the same request
```

The track header only dispatches an intent with stable document/view/track
references. It does not import Mol*, construct structure selectors, or assign
structure colors.

The UniProt/MolViewSpec integration plugin supplies the intent processor. It:

1. resolves the annotation entries represented by the track;
2. maps their loci to a declared structure target;
3. applies a registered coloring policy or explicit track coloring;
4. produces a MolViewSpec tree containing the appropriate structure,
   components/selectors, representations, and colors;
5. publishes a targeted or capability-addressed MVS visualization request with
   correlation/causation metadata.

The payload is therefore inspectable, serializable, reproducible, and reusable
without an embedded Mol* viewer. A later activation or upstream change can
publish a replacement request without requiring shared mutable state between
the producer and Mol* wrapper.

This pattern generalizes beyond UniProt. Other plugins can consume the same
intent and publish a different visualization request, and the same MVS
generation capability can be triggered from a feature click, selection
control, script, or notebook.

## 7. Prototype scope cut

The prototype should prove these vertical slices. Detailed user flows and
acceptance criteria are defined in `case-studies.md`:

1. An inline protein with range and per-position annotations rendered by the
   base viewer from SeqViewSpec.
2. The same SeqViewSpec visualization request routed to Nightingale,
   demonstrating that SeqViewSpec is not coupled to the base canvas renderer.
   This page must use the vendored, locally built Nightingale source.
3. A protein/structure page with Mol* and bidirectional hover/selection through
   an explicit sequence-to-structure mapping. Activating an annotation track
   header must publish a MolViewSpec visualization request with mapped residue
   coloring, which the Mol* wrapper then consumes and loads. Pointer hover in
   either viewer must be translated and reflected as a highlight in the other
   without an event loop.
4. A multi-polymer or MSA page exercising named coordinate spaces, gaps, and
   one non-trivial mapping.
5. A nucleotide-to-protein page only if it can reuse the same mapping and event
   contracts without adding genome-browser scope.

The prototype may use checked-in fixtures and deterministic local mappings.
Remote source loading, SIFTS resolution, large-scale streaming, BinaryCIF,
SeqQL, arbitrary plugins, server infrastructure, and a full Nightingale vNext
are follow-on work unless needed to validate a seam.

The Neuroglancer/tomogram integration is an explicit post-prototype extension
scenario for the harness contract, not a required implementation in this first
prototype.

## 8. Disposition of PR feedback

| Feedback | Reconciliation |
| --- | --- |
| Lens is redundant/underspecified | Remove it from the initial normative vocabulary; use adapters now and reserve “lens” for a future typed projection extension. |
| Human- and machine-readable origin, methods, citations, labels, URLs | Add portable provenance and presentation metadata; materialize links rather than executing templates. |
| Compact gaps, A3M, CIGAR | Handle as parser inputs and normalize to explicit alignment mappings. |
| Ligands and authoritative chemical links | Keep non-polymers outside sequence strings; represent modifications/contacts as annotations with authoritative IDs. |
| Identity needs authority, version, and segment clarity | Make identity authority-qualified/versionable and move mappings into explicit coordinate relations. |
| Zero and reverse direction | Define internal interval conventions; preserve external labels and explicit orientation. |
| Source annotation kind may not match display kind | Normalize source data to geometric annotations; choose representation separately in the view. |
| Atom, bond, and boundary targets | Add sequence boundaries; preserve atom/bond targets as external structure loci rather than sequence positions. |
| Rich per-position values and subgroup context | Permit structured/vector values and attach them to a named sequence/alignment context. |
| Dense directional pairwise matrices | Add matrix geometry with explicit axes and directionality. |
| Multiple alignments and indirect mappings | Give alignments identities and all coordinate spaces names; use explicit mapping chains. |
| Rows as well as columns | Defer generalized layout; keep the first renderer contract to horizontal axes and stacked tracks. |
| Overlay, stacking, filtering, and modulation | Distinguish collision stacking from ordered visual layers; add limited explicit encodings/scales. |
| Batch expansion may bloat state | Treat batch APIs as builder conveniences compiling to resolved objects; allow source references without embedding all raw data. |
| Multiple mapped positions in events | Use multiple typed loci and set-valued mapping results, not array-valued range endpoints. |
| Event list ordering | Lists are unordered unless endpoint roles/direction explicitly provide semantics. |
| Event producer versus consumer mapping | Producer enriches through the shared mapping service; consumers may resolve missing mappings through the same runtime. |
| Preserve the interacted semantic object | Include the annotation/feature/relationship target as well as its loci. |
| SeqQL for semantic selection | Defer SeqQL; stable semantic target IDs and explicit loci cover the prototype. |

## 9. Decisions to carry into the next phase

The specification and deliverables phase should now make the following concrete:

- package boundaries and public APIs;
- the minimal application harness, wrapper, plugin contribution, message
  envelope, routing, lifecycle, and stream-policy contracts;
- the coordinate-translator registration, discovery, composition, and mapping
  result contracts;
- the minimal resolved TypeScript model and serialized JSON schema;
- coordinate/locus/mapping types and exact interval conventions;
- the core interaction message schema;
- the portable feature vocabulary and renderer capability/fallback rules;
- which four prototype pages are mandatory and which fifth page is optional;
- fixture datasets and acceptance criteria for base, Nightingale, and Mol*;
- the Nightingale upstream commit, vendored package subset, workspace layout,
  local patch log, and license/provenance handling;
- the exact UniProt track-header -> intent -> mapped loci -> MVS visualization
  request -> Mol* wrapper acceptance path;
- the exact Mol* highlight -> translated sequence highlight and reverse path,
  including clear, coalescing, and loop-prevention behavior;
- the wrapper/capability requirements that let a future Neuroglancer tomogram
  visualizer join without modifying existing viewers;
- explicit non-goals and deferred PR concerns.

No schema detail in draft v0.6 should be treated as frozen until it is checked
against these reconciled boundaries and the chosen vertical slices.
