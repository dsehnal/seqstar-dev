# Prototype Integration Plugin Specification

Status: prototype specification draft

Integration plugins turn domain data and user intent into portable requests,
coordinate translations, and derived messages. They are the only prototype
components that know about combinations such as UniProt plus MolViewSpec.

Detailed visible scenarios remain in `case-studies.md`; this document defines
their reusable software contracts.

## 1. Plugin rules

Every integration plugin:

- is a `HarnessPluginSpec` with stable `requires` and `provides` capabilities;
- validates configuration through TypeBox;
- owns and disposes its processors, routes, and translator registrations;
- consumes and publishes serializable messages;
- uses SeqViewSpec or MolViewSpec builders rather than visualizer-native state;
- reports mapping loss and unsupported data explicitly;
- contains no React layout and no direct wrapper references.

A plugin may target a component ID supplied by configuration. It MUST NOT find
a visualizer by DOM traversal or global singleton.

## 2. Fixture/document provider

Capability: `seqstar:prototype/fixture-provider`

The fixture provider loads checked-in case data, validates provenance metadata,
builds initial SeqViewSpec/MVS documents, and publishes visualization requests.
It is a prototype data source, not a general persistence service.

```typescript
interface FixtureCase {
  id: string
  metadata: FixtureMetadata
  create(context: FixtureBuildContext): Promise<CaseDocuments>
}

interface CaseDocuments {
  seqViewSpecs: Array<{ target: string; document: SeqViewSpec; viewId?: string }>
  molViewSpecs?: Array<{ target: string; document: unknown }>
  translators?: CoordinateTranslator[]
}
```

Fixture outputs are deterministic and can be validated without network access.
The provider registers translators before publishing requests.

## 3. Renderer-portability plugin

Capability: `seqstar:case/renderer-portability`

This plugin publishes the exact same SeqViewSpec object to the reference-viewer
and Nightingale component instances. It installs an identity-space translator
and a bidirectional hover/selection synchronization rule.

It contains no renderer-specific document branch. Capability differences are
handled by wrapper fallback reports, which the plugin may aggregate for the
diagnostics UI.

Acceptance:

- both lifecycle results reference the same document ID and content digest;
- interaction reflection uses the translator registry even for identity;
- no direct viewer-to-viewer subscription exists.

## 4. UniProt-to-MVS plugin

Capability: `seqstar:integration/uniprot-mvs`

Requires:

- `seqstar:format/seqviewspec`;
- `seqstar:format/molviewspec`;
- sequence-to-structure translator capability.

Provides:

- `seqstar:intent/annotation-show-in-structure`;
- `seqstar:generator/molviewspec-from-sequence-annotation`.

### 4.1 Inputs

The plugin observes SeqViewSpec requests, indexes their read-only documents by
target, request, and document ID, and observes lifecycle results. `accepted`
promotes that request to the target's active projection; `superseded` removes
its active status; `failed` retains or removes it according to whether the
wrapper reports the previous view as still visible. Projections are evicted on
component disposal. It consumes
`intent.annotation.show-in-structure`:

```typescript
interface ShowAnnotationInStructureIntent {
  documentId: string
  viewId: string
  trackId: string
  layerId?: string
  annotationId?: string
  targetComponent: string
  structureSpace: CoordinateSpace
}
```

If layer or annotation is omitted, the track must resolve unambiguously to one
activatable annotation layer. Otherwise the plugin emits a diagnostic and no
MVS request.

### 4.2 Processing

The plugin:

1. resolves the referenced document and visual objects;
2. obtains annotation items and their source loci;
3. evaluates the selected layer's deterministic color encoding per item;
4. maps loci to the configured structure space through the registry;
5. groups mapped structure loci by resulting color and semantic item;
6. builds a complete MolViewSpec document using supported MVS builders;
7. publishes `visualization.mvs.request` targeted to the requested component;
8. emits a generation summary containing mapped, partial, ambiguous, and
   unmapped item IDs.

The MVS document includes structure loading, components/selectors,
representations, colors, and optional focus required to reproduce the result.
It is inspectable and downloadable before Mol* receives it.

### 4.3 Coloring and mapping policy

- Explicit SeqViewSpec layer colors take precedence.
- Missing colors use a deterministic plugin palette keyed by annotation item ID.
- Multiple items with the same color may share an MVS component when semantic
  attribution remains available in generation diagnostics.
- Unmapped loci are omitted from MVS selectors but retained in the result.
- Ambiguous mappings are excluded by default; configuration may include all
  candidates with an explicit warning.
- Activating a new track creates a new complete MVS request; it does not mutate
  the previous Mol* state directly.

## 5. Structure-mapping plugin

Capability: `seqstar:translator/sequence-structure`

The prototype implementation reads a checked-in mapping table with explicit:

- source sequence coordinate-space identity;
- target structure/model/entity/chain space;
- source index and target label/index;
- missing or ambiguous rows;
- mapping provenance.

It registers forward and reverse translators separately. It supports partial
interval mapping by returning discontinuous point/interval targets rather than
spanning missing residues.

Separate configured instances cover the UniProt experimental structure and
each polymer/chain in the predicted complex.

## 6. AlphaFold-style complex plugin

Capability: `seqstar:case/complex-mvs`

The plugin builds the two-polymer SeqViewSpec, registers one translator pair per
polymer/chain, and processes interface-track or relationship activation.

For an interface track it generates one complete MVS request containing
distinguishable colors for both endpoint roles. For a relationship item it
preserves the relationship ID and maps all endpoints; the resulting request
focuses or highlights both sides without collapsing them into one fabricated
range.

Polymer and chain association comes from explicit IDs and mappings. Display
order is never used as biological identity. Synthetic confidence/contact data
is labeled as synthetic in document and fixture provenance.

## 7. Alignment plugin

Capability: `seqstar:case/alignment-structure`

The plugin:

- parses/normalizes the checked-in aligned fixture;
- creates consensus and conservation annotations through `seq-algorithm`;
- builds the alignment SeqViewSpec;
- registers column-to-member-sequence translators and explicit reverses;
- registers the selected member's sequence-to-structure translator;
- configures synchronization between alignment and Mol* components.

The registry composes the two steps. The plugin does not create a direct
alignment-to-structure shortcut solely for the case study.

Column selection maps to every non-gap member position. Hovering a gap returns
an explicit unmapped result for the member-sequence target while retaining the
alignment-column source locus.

## 8. Nucleotide/protein plugin (stretch)

Capability: `seqstar:case/cds-protein`

If implemented, this plugin registers explicit forward and reverse CDS
translators with strand, phase, and offset configuration. Protein-to-nucleotide
mapping returns the whole codon; nucleotide-to-protein mapping returns its
amino acid plus partial-codon diagnostics for interval edges.

This capability extends `seq-coords`; it does not add nucleotide mapping fields
to SeqViewSpec 0.1.

## 9. Intent bridge from track activation

A small generic processor may convert `interaction.native` with
`interaction: "track-activate"` into a configured domain intent:

```typescript
interface TrackIntentBinding {
  component: string
  documentId: string
  viewId: string
  trackId: string
  intentType: string
  targetComponent?: string
}
```

Bindings live in harness/plugin configuration, not SeqViewSpec. This keeps a
portable track reusable in applications that do not contain Mol*.

## 10. Security and determinism

- Fixture and generated document links are treated as untrusted URLs.
- No plugin evaluates source-provided JavaScript or templates.
- MVS selectors are built through typed builders, not string concatenation.
- Same fixture, configuration, and intent produce semantically identical output.
- Generated documents and mapping summaries are serializable for diagnostics.

## 11. Acceptance criteria

1. Every required case starts from checked-in data without network access.
2. All generated SeqViewSpec documents validate before publication.
3. All generated MVS documents validate before the Mol* wrapper receives them.
4. UniProt track activation produces inspectable residue coloring with explicit
   partial/unmapped summaries.
5. Complex contacts retain endpoint roles and polymer identities.
6. Alignment-to-structure interaction reports the composed two-step path.
7. Plugins dispose translators and processors on page navigation.
8. No plugin imports Nightingale, Mol* native APIs, or the reference-viewer API.
