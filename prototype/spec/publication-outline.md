# Seq\*: Towards a Common Library and Tools for Biological Sequence Visualization

### Authors

- UniProt: Daniel Rice, Minjoon Kim, Swaathi Kandasaamy, Maria Martin  
- PDBe: Adam Midlik, Sameer Velankar, Jennifer Fleming   
- EMDB: Kyle Morris  
- Jalview: Jim Procter  
- Mol\*: David Sehnal

### Framing

This is an early discussion draft for a proposed Seq\* publication. The aim is to test the scope and shape of a reusable, modular infrastructure for biological sequence visualization, analogous to what Mol\* provides for structural data. The bullets below intentionally separate likely core ideas from open questions about project structure and first deliverables.

### Working Claim

- Biological sequence visualization on the web is still fragmented.  
- Mol\* succeeded in structural visualization not only because of its viewer, but because it provides reusable data models, state, rendering, and integration layers flexible enough for other contexts.  
- Seq\* proposes an analogous shared foundation for biological sequence data:  
  - common sequence and annotation data models for single polymers and multi-polymer complexes;  
  - reusable coordinate mapping across biological coordinate systems;  
  - declarative, reproducible view state;  
  - integration with structure viewers, alignment tools, and existing resources;  
  - a reference sequence-viewer implementation, likely through Nightingale vNext.  
- The goal is not to create a formal standards body, but to build useful open infrastructure that projects can adopt incrementally.

### Motivation

- Sequence data is central to resources such as UniProt, AlphaFold DB, and PDBe, and to tools such as Jalview.  
- Predicted structures mean sequence and structure views are now tightly linked in routine workflows.  
- Today, sequence viewers, structure viewers, annotation tracks, alignments, and external resources are often connected by application-specific glue code.  
- This creates recurring problems:  
  - fragile integrations when APIs change;  
  - duplicated coordinate translation logic;  
  - poor portability of visualization states;  
  - high integration cost for external developers.  
- Mol\* showed that strong reusable foundations for parsing, data representation, querying, state management, rendering, and data access can support many applications.  
- Seq\* aims to provide the same kind of shared foundation for sequence visualization.

### Scope

- Initial focus:  
  - protein sequences;  
  - sequence features and annotations;  
  - multiple sequence alignments;  
  - mappings between sequence, alignment, and 3D structure coordinates;  
  - limited nucleotide/protein mappings where needed for coding-sequence use cases.  
- Non-goal:  
  - Seq\* should not become a full genome browser.  
- Desired interoperability:  
  - genome/transcript resources should be able to exchange coordinates and events within the Seq\* ecosystem where appropriate;  
  - JBrowse-like tools remain the right layer for chromosome-scale visualization;  
  - Seq\* should coordinate with, not replace, other 1D visualization tools.

### Core Concepts

#### Intent Layer and Plugin Ecosystem

\<TODO introduce the intent layer and plugin eco system as a core concept? The plugins could be helpful for easier adoption to by handling common cases\>

#### Shared Sequence Data Model

- Define reusable representations for:  
  - biological sequences;  
  - constructs and complexes composed of multiple related polymers;  
  - sequence features and metadata;  
  - alignments;  
  - mappings to structure residues and chains.  
- Preserve enough source-format detail to avoid losing database-specific information.  
- Support existing formats and schemas where possible rather than inventing unnecessary new ones.

#### Coordinate Mapping

- Treat coordinate translation as a first-class problem, not application glue.  
- Support mappings among UniProt positions, transcript/CDS/nucleotide coordinates where relevant, protein positions, alignment columns, PDB/mmCIF residues/chains, and computed model positions from resources such as AlphaFold DB or ModelArchive.  
- Reuse established resources such as SIFTS where possible.  
- Reduce errors around indexing, gaps, insertions, and chain numbering.

#### SeqViewSpec

- SeqViewSpec should provide a portable, declarative description of sequence views, analogous in spirit to MolViewSpec.  
- It should describe:  
  - one or more polymers with annotations, values, identities, and reference numbering systems;  
  - multi-polymer contexts such as antibodies, complexes, and constructs;  
  - optional sources and selectors for constructing data objects from existing data;  
  - views composed of sections, tracks, and features;  
  - feature types, styles, tooltip data, and visible tracks;  
  - coordinate systems and mappings across alignment, sequence, and reference spaces; \<TODO: be be precise in saying \- one syntax that allows dual annotation across sequence and coordinates\>  
  - enough coordinate and identity context to streamline app-level integration with MolViewSpec or Mol\* where useful.  
- SeqViewSpec should stay view-oriented:  
  - describe what data and visual state exist;  
  - avoid domain computation;  
  - leave heavier parsing, transformation, and source-specific mapping to builders or companion adapters.  
- A builder-first workflow seems natural:  
  - TypeScript builders provide ergonomics and type safety;  
  - JSON remains the portable serialized state.  
- SeqViewSpec can also be a compilation target for higher-order specifications:  
  - app-specific state from UniProt, AlphaFold DB, or similar applications could compile into portable SeqViewSpec;  
  - templates, notebooks, services, or LLM-assisted tools could materialize sequence stories or annotation views into explicit SeqViewSpec state;  
  - SeqViewSpec remains the validated output language, not the template language itself.

#### SeqQL

- Explore a sequence-oriented query language analogous to MolQL.  
- Possible query targets include motifs, feature types, evidence codes, conservation thresholds, alignment columns, and mapped residues.  
- Use cases:  
  - sequence engineering constraints that are hard to represent as simple annotations or filters;  
  - compact view definitions, similar to how Mol\* uses MolQL internally for 3D representations.

#### Event Payloads

- Replace ad-hoc event translation with shared, serializable event payload conventions.  
- Events should carry biological coordinates and enough context for consumers to translate them correctly.  
- Important principle: pass the coordinate system with the position, not just a bare number.  
- Mol\*, Nightingale vNext, Jalview, UniProt pages, AFDB pages, and external applications should be able to consume the same conceptual events.

### Candidate Architecture

#### Candidate Modules

- Core: `seq-data`, `seq-io`, `seq-model`, `seq-coords`, `seq-algorithm`, `seq-view-spec`, `seq-ql`, `seq-state`, `seq-plugin`.  
- `seq-algorithm` should host reusable alignment, conservation, consensus, comparison, and annotation-transfer algorithms.  
- `seq-viewer` should provide reusable viewer components for sequence and annotation tracks.  
- Nightingale vNext is the natural primary implementation; Seq\* should strengthen the Nightingale ecosystem, not replace it.

#### Data Access

- Open question:  
  - Does Seq\* need data services analogous to Mol\* ModelServer and VolumeServer?  
- BinaryCIF is an important precedent:  
  - it was designed around mmCIF, but proved useful beyond atomic coordinates, including volumetric data delivery;  
  - Seq\* should evaluate whether BinaryCIF or a related typed binary encoding could support efficient sequence, alignment, and annotation payloads.  
- Possible services include alignment slicing/downsampling, annotation aggregation, feature streaming, and coordinate-mapped sequence/structure payloads.

### Key Use Cases

- **UniProt**  
    
  - Keep rich sequence feature views synchronized with Mol\* structure views.  
  - Selections should work in both directions between UniProt annotations and mapped structural residues.  
  - Coordinate mapping should handle canonical sequences, isoforms, residue numbering, chains, and SIFTS.


- **AlphaFold DB**  
    
  - Extend basic sequence views with richer tracks for confidence, annotations, domains, variants, and complexes.  
  - Support multi-chain and multi-protein contexts cleanly.


- **Jalview and Alignment Workflows**  
    
  - Export view state into SeqViewSpec.  
  - Restore alignment views, selections, annotations, and mapped structure context on the web.


- **Nucleotide-to-Protein Views**  
    
  - Support selected coding-sequence scenarios where nucleotide changes map to amino acid changes.


- \<TODO: EMDB use-case\>  
  - Structure quality? Anything else?


- **General Reuse**  
    
  - Make it easier to combine sequence and structure visualization without bespoke glue code.  
  - Allow adoption of only the needed layers.

### Relationship to Mol\* and Existing Tools

- Seq\* should follow Mol\* principles:  
  - modular TypeScript codebase;  
  - reusable core data model;  
  - separation between data, model, state, and rendering;  
  - declarative state descriptions;  
  - efficient data access;  
  - high-performance rendering and permissive open-source collaboration.  
- Seq\* should interoperate closely with Mol\*:  
  - shared selection/highlight concepts;  
  - mapping between SeqViewSpec and MolViewSpec where useful;  
  - coordinated sequence and structure interactions;  
  - possible shared infrastructure for state, tasks, or plugin context.  
- Likely early collaborators and use cases include Nightingale, Jalview, UniProt, PDBe, AFDB, and Mol\*.  
- Related or adjacent ecosystems to discuss include BioJS and genome-scale tools such as JBrowse/IGV.

### What We Need Feedback On

- Is the Mol\*-for-sequence framing accurate and useful?  
- Is Seq\* the right name and conceptual boundary?  
- Should SeqViewSpec explicitly support both single-polymer views and multi-polymer contexts such as antibodies, complexes, and engineered constructs? \<YES\>  
- Should SeqViewSpec remain strictly view-oriented, with transformation and domain computation handled by builders/adapters?  
- Should SeqViewSpec be framed explicitly as a compilation target for higher-order templates and generated sequence stories?  
- How much of the event model should be normative versus recommended?  
- Which use cases are essential for the first phase?  
- How much nucleotide/transcript/genome coordinate support is needed initially?  
- Do we need SeqQL early, or is that premature?  
- Do we need BinaryCIF-like encodings or dedicated data servers for sequence, alignment, and annotation payloads?  
- Should Seq\* be standalone, a Mol\* sibling/extension, or a Nightingale vNext architecture effort with broader specifications?  
- Who needs to be involved early from UniProt, PDBe, AFDB, Jalview, Mol\*, and external communities?

### Suggested Initial Deliverables

- A short design note defining the minimal Seq\* architecture.  
- A draft SeqViewSpec schema for inline sequence data, simple protein feature views, multi-polymer contexts, and sequence/structure coordinate events.  
- A coordinate mapping prototype connecting UniProt positions, SIFTS, and Mol\* residue selections.  
- A Nightingale vNext prototype consuming SeqViewSpec.  
- A small Mol\* plus Nightingale demo showing bidirectional selection/highlighting and generated SeqViewSpec/MolViewSpec state updates, e.g. clicking a sequence track changes coloring in the 3D view.  
- A decision document on project structure and ownership.
