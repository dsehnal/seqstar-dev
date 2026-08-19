# Proposal: Shared Infrastructure for Sequence and Structure Visualization

[Mol\* goals/overview paper](https://diglib.eg.org/server/api/core/bitstreams/76d3cf4e-8ea6-49ff-bd9c-3914ce23a05c/content)

This proposal outlines a shift towards **Seq**\*: shared infrastructure for biological sequence visualization, conceptually parallel to **Mol**\* for molecular and structural visualization.

Mol\* provides a reusable foundation for 3D molecular views. Seq\* would play an analogous role for 1D biological sequence views, while enabling clean interoperability between sequence, structure, alignment, and annotation components across UniProt, AlphaFoldDB, PDBe, Jalview, and related tools.

Seq\* should be understood as an evolution of the Nightingale ecosystem, not a replacement for it. **Nightingale vNext would be the primary implementation of Seq**\*, providing the concrete sequence-viewer components, track system, and rendering layer needed to make SeqViewSpec useful in real applications.

The goal is to reduce application-specific integration logic, make viewer states reproducible, and allow visualization components to be reused across different biological and application contexts.

## Current Challenges

Nightingale provides rich 1D sequence visualization, while Mol\* provides interactive 3D molecular visualization. However, today a large amount of application-level code is needed simply to make these components communicate.

For example, when a user clicks an amino acid in Mol\*, the application must catch that event, translate the relevant structural coordinates into sequence coordinates, and manually trigger a Nightingale-compatible event. The reverse is also true when a user interacts with a Nightingale track. This orchestration is usually specific to one application, data model, or deployment.

This creates several issues:

1. **High maintenance burden** API changes in Nightingale, Mol\*, or the application can break the custom translation layer.  
     
2. **Tight coupling** Nightingale becomes tied to specific application orchestration logic, making it harder to pair with other structure viewers or reuse in different contexts.  
     
3. **Poor portability** External developers cannot easily reuse Nightingale tracks or Mol\* views without rebuilding bespoke integration logic.  
     
4. **Difficult reproducibility** Combinations of tracks, structures, selections, mappings, and highlights are hard to capture, share, and replay.  
     
5. **Steep integration curve** Using the base Mol\* component directly is powerful, but currently requires substantial low-level structural-visualization knowledge.

## Proposed Direction

We propose developing **Seq**\* as a reusable sequence-visualization counterpart to Mol\*.

Seq\* would introduce a new declarative language, **SeqViewSpec**, for describing sequence visualization state: sequences, tracks, annotations, selections, highlights, coordinate mappings, and interactions.

This is not intended to leave Nightingale behind. Instead, it gives Nightingale a clearer architectural role: **Nightingale vNext becomes the primary implementation of Seq**\*, while SeqViewSpec defines the portable language that allows Nightingale-based views to be reproduced, exchanged, and integrated with Mol\*, Jalview, and other tools.

The architecture would have three main parts:

1. **Mol\* / MolViewSpec** The structural visualization counterpart, providing declarative descriptions of 3D molecular views.  
     
2. **Seq\* / SeqViewSpec / Nightingale vNext** Seq\* is the shared sequence-visualization infrastructure. SeqViewSpec is the new declarative language for reproducible 1D biological sequence views. Nightingale vNext is the primary implementation of this infrastructure, continuing Nightingale’s role as the core EBI sequence-viewer component.  
     
3. **Composable Event Context** A shared interaction layer allowing Seq\*, Mol\*, Nightingale, Jalview, and third-party components to exchange events and data without application-specific translation code.

Together, these pieces replace ad-hoc integration logic with a shared API target. Any component, whether developed at EBI or externally, could participate by implementing the relevant specification.

## Key Use Cases

### AlphaFoldDB

AlphaFoldDB currently uses a customized Mol\* sequence viewer with limited functionality. Seq\* would allow richer sequence-level information to be shown alongside structures, including domains, functional annotations, confidence-related features, and complex-specific tracks.

It would also support a more powerful, zoomable sequence display for protein complexes that remains synchronized with the 3D view.

### UniProt

For UniProt, Seq\* would enable richer interaction between sequence annotations and structures. For example, clicking an AlphaMissense annotation could color the corresponding residues in Mol\*, while selecting residues in Mol\* could highlight the corresponding UniProt feature, variant, or domain in Nightingale.

It would also help streamline coordinate translation between UniProt positions, mmCIF coordinates, and SIFTS mappings.

### Amino acid and DNA views

A strong community use case is showing amino acid and DNA sequence views side by side. Seq\* could allow nucleotide and protein views to share selections, mappings, and highlights through the same event context.

For example, selecting a coding region in a DNA view could highlight the corresponding amino acid region, with links to relevant structural residues where available.

### Sequence Viewer at EMDB 

DraftL EMDB is interested in showing annotations on 1D sequence viewer and making it interactive with structures.

### Cross-team and external reuse

The same infrastructure could support:

* alignment views involving multiple accessions and structures;  
* multiple proteins from different PDBe entries in a single Mol\* instance;  
* dynamically computed annotations such as contact maps;  
* integration with Jalview and other sequence/alignment tools;  
* reuse of Nightingale or Mol\* components in external applications without custom glue code.

## Project Scope and UniProt Role

This should be viewed as a long-term cross-team and potentially cross-institutional initiative. It is an opportunity for UniProt to help shape an infrastructure that could become broadly useful across EBI and the wider bioinformatics community.

Early UniProt involvement is important because the specification needs to support real UniProt use cases from the beginning, including feature annotations, variants, isoforms, evidence, coordinate mappings, external structure links, and existing Nightingale workflows.

Expected UniProt contributions include:

1. **Schema design** Participation in shaping SeqViewSpec and related event models through regular cross-team meetings.  
     
2. **Concrete use cases** Examples that test whether the schema supports UniProt’s real sequence, annotation, and structure-integration needs.  
     
3. **Implementation work** Development effort for Nightingale vNext and UniProt-specific integration requirements.  
     
4. **Cross-team collaboration** Coordination with AlphaFoldDB, PDBe, Jalview, and external contributors to ensure the architecture is useful beyond a single product.

## Relationship to Gene and Genome Views

Seq\* should not try to become a full genome browser. Protein sequence views, nucleotide sequence views, transcript views, and genome-browser views share a 1D visual character, but they rely on different coordinate systems and biological semantics.

For this reason, Seq\* should be built on a shared biological coordinate model rather than assuming that all sequence-like data live in a single coordinate space. The model should be able to represent mappings between genome assemblies, transcripts, CDS regions, translated proteins, UniProt canonical or isoform sequences, alignments, AlphaFold models, and PDB/mmCIF chains.

A future Gene\* or GeneViewSpec layer may be useful for genome- and transcript-centric visualization, including exons, introns, UTRs, splice isoforms, genomic variants, read coverage, and regulatory annotations. However, the initial goal should be interoperability with existing genome browsers and transcript resources, not replacement of them. Seq\* should therefore define the sequence-level visualization layer and participate in a shared coordinate-mapping and event system that can also be used by Mol\*, Jalview, JBrowse-like genome views, and future Gene\* components.

## Expected Outcomes

Seq\* would provide:

* a clearer architectural future for Nightingale as the primary Seq\* implementation;  
* reproducible descriptions of 1D sequence views through SeqViewSpec;  
* shared event handling between sequence, structure, and alignment components;  
* less application-level glue code;  
* easier integration between Nightingale vNext, Mol\*, Jalview, and future viewers;  
* better portability for external developers;  
* stronger foundations for cross-resource visualization across UniProt, AlphaFoldDB, PDBe, and the wider community.

Ultimately, Seq\* would establish a sequence-visualization counterpart to Mol\*: shared infrastructure through which sequence and structure components can be composed, reused, and extended across many biological contexts.  