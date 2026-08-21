# Seq* Prototype Case Studies

Status: proposed implementation cases

These case studies turn the architectural claims into observable prototype
behavior. Each case is a separate page in the Vite/React prototype application
and uses checked-in, deterministic fixtures. Network-backed variants may be
added later, but acceptance must not depend on an external service.

The cases deliberately exercise different layers:

- SeqViewSpec and MolViewSpec describe requested visuals only;
- Seq* and the vendored Nightingale copy render sequence views;
- wrappers connect visualizers to the harness event fabric;
- harness plugins generate requests, register translators, and synchronize
  interactions;
- page components arrange visualizers but contain no biological translation or
  cross-view synchronization logic.

## Implementation set

| Priority | Case | Main architectural proof |
| --- | --- | --- |
| Required | 1. Renderer portability | One SeqViewSpec can drive independent sequence renderers. |
| Required | 2. UniProt annotations and structure | Intent processing produces MVS requests; Mol* and sequence highlights synchronize. |
| Required | 3. AlphaFold-style complex | Multi-polymer data, pairwise annotations, and cross-chain mappings work. |
| Required | 4. Alignment to sequence to structure | Translator composition works across alignment, sequence, and structure spaces. |
| Stretch | 5. Nucleotide to protein | One-to-many and reverse-orientation mappings work across viewer instances. |
| Live-data validation | 6. Cryo-ET particle linkage | A spatial visualizer can join without changing existing viewers. |

## Shared page behavior

Every implemented page uses the same application harness implementation and
shows a small optional diagnostics drawer for prototype verification. The
drawer exposes messages, correlation/causation IDs, selected translation path,
and lifecycle results. It is not part of SeqViewSpec and is not required for a
production UI.

Every page must demonstrate:

1. visualization requests are published to the harness rather than passed
   directly between page components and viewers;
2. wrappers report accepted, rendered, superseded, degraded, or failed lifecycle results;
3. interaction messages contain stable source/document/view/object identities
   and typed loci;
4. reflected interactions do not create feedback loops;
5. disposing or navigating away from a page removes its subscriptions.

## Case 1: Renderer portability

### User story

As a developer evaluating SeqViewSpec, I can send one sequence visualization
request to two renderer instances and see semantically equivalent views without
rewriting the input.

### Page composition

- one base Seq* canvas-viewer instance;
- one vendored Nightingale instance;
- one harness instance routing the same request to both wrappers;
- an optional renderer capability/fallback summary.

### Fixture and view

Use one protein sequence with enough length to require zooming and include:

- residue letters and ruler/navigation;
- at least two overlapping range-annotation tracks;
- a categorical residue swatch;
- a numeric per-residue bars or heatmap track;
- labels, tooltips, and provenance metadata;
- an initial viewport that can be changed through normal viewer navigation.

The page publishes one SeqViewSpec visualization request. The harness broadcasts
it to `base-sequence` and `nightingale-sequence` component instances.

### Interactions

- Hovering a residue in either renderer publishes a sequence-locus highlight.
- The harness reflects that highlight into the other renderer.
- Clearing the pointer clears the reflected highlight.
- Selecting a residue range in either renderer reflects the same selection in
  the other renderer.

No coordinate translation is needed because both viewers use the same named
sequence space. The identity translator is still resolved through the harness
registry so this case exercises the same synchronization path as later cases.

### Acceptance criteria

- Both renderers consume the exact same SeqViewSpec document ID and payload.
- Core tracks have equivalent biological meaning even when their pixels differ.
- Any unsupported portable representation is reported through capability or
  lifecycle output and has a documented fallback; it is not silently dropped.
- Hover and selection work in both directions without visible echo/flicker.
- Nightingale is imported from the vendored workspace source.
- Page code contains no direct base-viewer-to-Nightingale event wiring.

## Case 2: UniProt multi-track annotations and Mol*

### User story

As a UniProt user, I can inspect sequence annotations, ask for any annotation
track to be shown on a structure, and move between the 1D and 3D views without
losing biological coordinate context.

### Page composition

- one Nightingale-backed sequence-viewer instance;
- one Mol* instance behind the MVS wrapper;
- a UniProt case-study plugin;
- a sequence-to-structure translator registered with the harness;
- an initial neutral MolViewSpec request for the chosen structure.

The fixture should contain one UniProt-like protein with a partial experimental
structure mapping. The exact accession/PDB entry is selected during planning,
using these criteria:

- several recognizable range and point annotations;
- at least one mapped and one unmapped sequence interval;
- non-trivial reference versus structure residue numbering;
- a structure small enough to load quickly from a checked-in mmCIF/BCIF fixture.

### SeqViewSpec view

The multi-track view contains:

- protein sequence;
- domains or regions;
- active/binding sites or other point features;
- variants;
- an AlphaMissense-like per-residue score/heatmap;
- optional structure coverage showing which residues can be mapped.

### Track-to-structure flow

```text
track-header activation
  -> Nightingale wrapper publishes interaction.native(track-activate)
  -> UniProt/MVS plugin resolves document + view + track
  -> plugin obtains annotation loci and display colors
  -> harness translator maps UniProt sequence loci to structure loci
  -> plugin builds a complete MolViewSpec document
  -> plugin publishes an MVS visualization request
  -> Mol* wrapper replaces the current MVS view
```

Activating a different track publishes a new request and replaces the previous
annotation coloring. Unmapped annotations remain represented in the sequence
view and are omitted from structure selectors with an explicit mapping result;
they are not treated as errors.

### Synchronized interactions

- Hovering a mapped sequence residue highlights the corresponding Mol* residue.
- Hovering a mapped Mol* residue highlights the UniProt sequence position.
- Hovering an unmapped sequence residue clears or leaves empty the Mol*
  highlight according to the declared synchronization policy.
- Selecting an annotation feature highlights all mapped structure loci while
  preserving the annotation ID in the event target.
- Clear-highlight and clear-selection propagate correctly.

### Acceptance criteria

- The track header publishes a normalized event and has no Mol* dependency.
- The generated MolViewSpec can be inspected or downloaded before Mol* loads it.
- Mol* consumes only the MVS request; it contains no UniProt-specific logic.
- The translator reports partial mappings and preserves original UniProt loci.
- Bidirectional hover is responsive and loop-free.
- Generated residue colors correspond to the selected track's annotation
  colors or declared coloring policy.
- Page code only configures the harness and layout.

## Case 3: AlphaFold-style multi-polymer complex

### User story

As an AlphaFold DB user inspecting a predicted complex, I can view multiple
polymers on one sequence axis, inspect confidence and interface annotations,
and relate cross-chain features to the 3D complex.

### Page composition

- one base Seq* viewer instance, exercising the reference renderer;
- one Mol* instance;
- an AlphaFold-style case-study plugin;
- one translator per polymer/structure chain mapping;
- a deterministic two-polymer predicted-complex fixture.

The case may use a compact real or representative fixture, but must not imply
that synthetic confidence/contact values are real biological results. Fixture
provenance labels this clearly.

### SeqViewSpec view

- two named polymers with independent identity and structure-chain mappings;
- per-residue confidence tracks for both polymers;
- domain/region tracks;
- interface-residue annotations;
- at least one pairwise cross-chain contact annotation;
- a compact pairwise/matrix representation or a documented prototype fallback.

### Interactions

- Hovering either polymer maps to the correct structure chain.
- Activating the interface track produces an MVS request that colors both sides
  of the interface with distinguishable colors.
- Activating a pairwise contact preserves the relationship target and both
  endpoint loci; Mol* focuses/highlights both endpoints.
- Selecting across the visual gap between polymers never produces fabricated
  biological positions.

### Acceptance criteria

- Polymer identity is never inferred from display order.
- Cross-chain translation uses named spaces and registered translators.
- Pairwise events preserve the contact ID and endpoint roles.
- An MVS request can contain mapped components from multiple chains.
- Missing residues or low-confidence/unmapped intervals are handled explicitly.
- The case proves that `assembly` and `alignment` are not being conflated.

## Case 4: Alignment to sequence to structure

### User story

As a Jalview/alignment user, I can restore an annotated MSA view, explore
columns and conservation, and connect one structure-linked alignment member to
its 3D residues.

### Page composition

- one base Seq* alignment viewer;
- one optional Mol* panel for the structure-linked member;
- an alignment case-study plugin;
- alignment-column-to-member-sequence translators;
- a member-sequence-to-structure translator;
- a checked-in aligned FASTA/A3M-derived fixture normalized before rendering.

### SeqViewSpec view

- approximately 20–50 aligned protein rows so virtualization is exercised
  without turning the prototype into a scale benchmark;
- stable identities for the alignment and every member;
- consensus and conservation tracks;
- one or more annotated subgroups;
- one member with a structure mapping;
- visible gaps and at least one insertion/deletion edge case.

### Translator composition

```text
alignment column
  -> selected member sequence position
  -> structure chain residue
```

The harness resolves this as a composed path. The alignment wrapper and Mol*
wrapper do not call each other and do not implement the other domain's mapping.

### Interactions

- Hovering a cell identifies alignment, row/member, column, and any resolved
  sequence position.
- Hovering a gap emits an alignment-column locus but no member sequence locus.
- Hovering the structure-linked row at a non-gap column highlights Mol*.
- Hovering Mol* maps back to the correct member position and alignment column.
- Selecting a column highlights all non-gap member positions; structure
  highlighting applies only to members with a registered structure mapping.

### Acceptance criteria

- Alignment coordinate spaces always name the alignment.
- Multiple member rows are not modeled as independent biological assemblies
  merely for rendering convenience.
- Gaps do not generate sequence positions.
- The harness reports and uses a two-step translation path for structure-linked
  cells.
- MSA row virtualization preserves stable event identities.
- The restored view is produced from SeqViewSpec, not page-specific row setup.

## Case 5: Nucleotide to protein (stretch)

### User story

As a user comparing a CDS and its translated protein, I can move between
nucleotide, codon, amino-acid, and optional structure coordinates while strand
and one-to-many semantics remain explicit.

### Page composition

- two independent sequence-viewer instances, one nucleotide and one protein;
- optionally the Mol* instance from the UniProt case;
- a CDS translation/mapping plugin;
- forward and reverse coordinate translators.

### View and mapping

- a short transcript/CDS fixture with explicit orientation and phase;
- nucleotide and protein SeqViewSpec documents as separate visualization
  requests;
- at least one variant annotation;
- a reverse-strand or offset example if it can be shown without obscuring the
  core behavior.

### Interactions

- Hovering a nucleotide highlights its translated amino acid.
- Hovering an amino acid highlights the corresponding codon, not a single
  arbitrary nucleotide.
- Selecting a nucleotide interval produces all affected amino acids with
  partial-codon semantics reported.
- If Mol* is present, protein loci can continue through the registered
  protein-to-structure translator.

### Acceptance criteria

- The mapping is explicitly one-to-many/many-to-one where appropriate.
- Direction, offset, and coordinate conventions are visible in diagnostics.
- Reverse mapping does not rely on array-valued `start`/`end` fields.
- The two viewers are synchronized only through the harness.

## Case 6: live Cryo-ET particle linkage

### Scenario

Compose a sequence viewer, Mol*, and a spatial particle viewer around CryoET
Data Portal dataset DS-10493 / run RN-34483. A deliberately small local join
index connects particle class `AN-134660` to EMD-77085, representative PDB
1DWN, and UniProt P03630. Particle coordinates, EMDB metadata and density,
SIFTS mappings, atomic coordinates, and protein annotations load from their
official live services rather than checked-in scientific copies.

### Expected flow

```text
particle selection
  -> spatial-particle locus + stable annotation item ID
  -> curated particle-class join
  -> EMD-77085 density request + P03630 annotation context

sequence hover/select <-> exact P03630 / 1DWN chain-A translator <-> Mol*
```

The wrapper-owned particle projection publishes normal native hover/selection
events. The full Zarr tomogram remains available through an explicit external
Neuroglancer link; its control-heavy cross-origin iframe is not embedded in the
compact case-study layout because it cannot expose a trusted harness event
bridge. Density and representative structure are separate MVS presentations:
clicking the EMDB or PDB accession selects and scrolls to the corresponding
Mol* view, while UniProt track-header actions generate track-specific annotated
1DWN presentations. 1DWN is biologically linked through live SIFTS and is not
claimed as a fitted model for EMD-77085. The case adds a new portable tomogram
request/wrapper and plugin without changing SeqViewSpec, MolViewSpec, the Seq*
viewer, Nightingale, or the Mol* wrapper.

### Live-data acceptance

- exactly 128 live PP7 oriented-point annotations receive stable line-derived
  IDs and retain x/y/z plus orientation;
- EMDB title, 3.0 Å resolution, deposited contour, and map statistics are read
  from the live EMD-77085 API; its downsampled BCIF is loaded through PDBe
  Volume Server with an MVS isosurface at an explicit 3.7σ preview level (never
  the incompatible full-resolution absolute contour);
- live UniProt P03630 sequence/features generate a validated SeqViewSpec;
- live SIFTS establishes exact P03630 residue 2–128 to 1DWN chain-A residue
  1–127 mapping, preserving the actual Mol* generation coordinate space;
- selecting a particle shows its class and coordinates and presents the class
  density; the user can explicitly switch to the representative structure;
- separate source-link icons preserve direct access to CryoET Portal, EMDB,
  PDBe, and UniProt records without conflating source navigation with in-app
  presentation selection;
- sequence, regions, sites, and mutagenesis track headers generate validated
  1DWN cartoons; sites and mutagenesis additionally use one bounded colored
  ball-and-stick detail group;
- the inspector exposes the currently rendered SeqViewSpec/MVS and bounded
  harness messages;
- deterministic tests mock the official response shapes and URLs, while a
  separate live probe verifies current endpoints. No scientific response body
  is committed as a fixture.

## Coverage summary

| Capability | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| SeqViewSpec consumption | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Base Seq* renderer | ✓ |  | ✓ | ✓ | ✓ | optional |
| Vendored Nightingale | ✓ | ✓ |  |  | optional | optional |
| MolViewSpec generation/consumption |  | ✓ | ✓ | ✓ | optional | ✓ |
| Bidirectional highlight | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Registered translation | identity | sequence/structure | multi-polymer | composed | one-to-many | cross-domain |
| Pairwise/matrix data |  |  | ✓ | optional |  | optional |
| More than two visualizers |  |  |  |  | optional | ✓ |

## Fixture selection rules

Before implementation planning, select exact fixtures using these rules:

- small enough to commit and load locally;
- openly redistributable with recorded source, version, and license/provenance;
- biologically credible for the behavior being demonstrated;
- includes the coordinate edge cases claimed by its case study;
- deterministic: remote data changes cannot alter acceptance results;
- sanitized of any private or unpublished information.

Each fixture directory should include a short metadata file explaining its
origin, transformations, and whether any values are synthetic.
