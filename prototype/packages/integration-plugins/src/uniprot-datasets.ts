import {
  type HarnessMessage,
  type HarnessPluginSpec,
  type InteractionEvent,
  type PayloadSchema,
  payloadSchema,
} from "@seq-star/harness-core";
import {
  type CoordinateLocus,
  CoordinateLocusSchema,
  type CoordinateSpace,
  CoordinateSpaceSchema,
  type CoordinateTranslator,
} from "@seq-star/seq-coords";
import { parseFasta } from "@seq-star/seq-core";
import {
  evaluateColorEncoding,
  type SeqViewSpec,
  SeqViewSpecSchema,
  validateSeqViewSpec,
} from "@seq-star/seq-view-spec";
import { MVSData } from "molstar/lib/extensions/mvs/index.js";
import type { MVSData as MvsDocument } from "molstar/lib/extensions/mvs/mvs-data.js";
import {
  createAlignmentStructureSeqViewSpec,
  createAlignmentStructureTranslators,
  p69905SequenceSpace,
  p69905StructureSpace,
  parseAlignmentStructureMappingTsv,
  parseP69905StructureMappingTsv,
} from "./alignment-structure.js";
import {
  barnaseSequenceSpace,
  barnaseStructureSpace,
  createComplexMappingTranslators,
  parseComplexContactsTsv,
  parseComplexMappingTsv,
  parseSyntheticConfidenceTsv,
} from "./complex.js";
import {
  appendMvsCartoonPresentation,
  type MvsResidueColorGroup,
  type MvsResidueSelector,
} from "./mvs-presentation.js";
import {
  createP04637MappingTranslators,
  createUniProtStructureSeqViewSpec,
  p53StructureSpace,
  parseP04637MappingTsv,
  type UniProtMvsGeneration,
  uniprotSequenceSpace,
} from "./uniprot-structure.js";

export const UNIPROT_DATASET_IDS = ["P04637-1TUP", "P69905-1A3N", "P00648-1BRS-A"] as const;
export type UniProtDatasetId = (typeof UNIPROT_DATASET_IDS)[number];

export interface UniProtDatasetAssetBundle {
  readonly p04637: {
    readonly mappingTsv: string;
    readonly structureUrl: string;
  };
  readonly p69905: {
    readonly alignmentAfa: string;
    readonly p69905Fasta: string;
    readonly alignmentMappingTsv: string;
    readonly structureMappingTsv: string;
    readonly structureUrl: string;
  };
  readonly p00648: {
    readonly p00648Fasta: string;
    readonly mappingTsv: string;
    readonly contactsTsv: string;
    readonly confidenceTsv: string;
    readonly structureUrl: string;
  };
}

export interface UniProtDatasetDefinition {
  readonly id: UniProtDatasetId;
  readonly label: string;
  readonly accession: "P04637" | "P69905" | "P00648";
  readonly structureId: "1TUP" | "1A3N" | "1BRS";
  readonly structureLabel: string;
  readonly sequenceSpace: CoordinateSpace;
  readonly structureSpace: CoordinateSpace;
  readonly structureUrl: string;
  readonly viewId: string;
  readonly trackIds: readonly string[];
  readonly atomicDetailTrackIds: readonly string[];
  readonly seqViewSpec: SeqViewSpec;
  readonly neutralMvs: MvsDocument;
  readonly provenance: readonly string[];
}

export interface UniProtDatasetCatalog {
  readonly initialDatasetId: UniProtDatasetId;
  readonly datasets: readonly UniProtDatasetDefinition[];
}

type RuntimeDataset = {
  readonly definition: UniProtDatasetDefinition;
  readonly forward: CoordinateTranslator;
  readonly reverse: CoordinateTranslator;
};

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
};

const detached = <T>(value: T): T => deepFreeze(JSON.parse(JSON.stringify(value)) as T);

const checkedSeqViewSpec = (document: SeqViewSpec, datasetId: string): SeqViewSpec => {
  const checked = validateSeqViewSpec(document);
  if (!checked.ok)
    throw new Error(
      `${datasetId} SeqViewSpec is invalid: ${checked.diagnostics
        .map((item) => `${item.path}: ${item.message}`)
        .join("; ")}`,
    );
  return checked.value;
};

const fixedTimestamp = <T extends MvsDocument>(document: T): T =>
  JSON.parse(
    JSON.stringify({
      ...document,
      metadata: { ...document.metadata, timestamp: "2026-08-20T00:00:00Z" },
    }),
  ) as T;

const createNeutralMvs = (options: {
  readonly structureUrl: string;
  readonly title: string;
  readonly selector: MvsResidueSelector;
}): MvsDocument => {
  const builder = MVSData.createBuilder();
  builder.canvas({ background_color: "white" });
  const structure = builder
    .download({ url: options.structureUrl })
    .parse({ format: "mmcif" })
    .modelStructure();
  appendMvsCartoonPresentation(structure, [
    { componentSelector: options.selector, baseColor: "#CBD5E1", residueColors: [] },
  ]);
  const document = fixedTimestamp(
    builder.getState({ title: options.title, description_format: "plaintext" }),
  );
  const issues = MVSData.validationIssues(document, { noExtra: true }) ?? [];
  if (issues.length > 0) throw new Error(`Neutral MVS is invalid: ${issues.join("; ")}`);
  return document;
};

const exactTranslatorPair = (
  pair: readonly [CoordinateTranslator, CoordinateTranslator],
  sequenceSpace: CoordinateSpace,
): readonly [CoordinateTranslator, CoordinateTranslator] =>
  Object.freeze([
    Object.freeze({ ...pair[0], source: { id: sequenceSpace.id, kind: sequenceSpace.kind } }),
    Object.freeze({ ...pair[1], target: { id: sequenceSpace.id, kind: sequenceSpace.kind } }),
  ]);

const oneFastaSequence = (text: string, id: string): string => {
  const parsed = parseFasta(text);
  if (!parsed.ok || parsed.value.length !== 1 || parsed.value[0]?.id !== id)
    throw new Error(`Expected one checked ${id} FASTA sequence.`);
  return parsed.value[0].residues;
};

const makeP69905Document = (assets: UniProtDatasetAssetBundle["p69905"]): SeqViewSpec => {
  const alignment = createAlignmentStructureSeqViewSpec(assets);
  const sequence = alignment.sequences.find((item) => item.id === "P69905");
  const aligned = alignment.alignments?.find((item) => item.id === "PF00042.29");
  const conservation = alignment.annotations?.find(
    (item) => item.id === "PF00042.29-conservation" && item.kind === "values",
  );
  if (
    sequence === undefined ||
    aligned === undefined ||
    conservation?.kind !== "values" ||
    conservation.values.encoding !== "dense"
  )
    throw new Error("The checked P69905 alignment lacks its query or conservation values.");
  const columns = parseAlignmentStructureMappingTsv(assets.alignmentMappingTsv);
  const structureRows = parseP69905StructureMappingTsv(assets.structureMappingTsv);
  const exactColumns = columns.filter(
    (row): row is typeof row & { sourceIndex: number } =>
      row.status === "exact" && row.sourceIndex !== undefined,
  );
  const gapFraction = aligned.members.map((member) => member.positions);
  const document: SeqViewSpec = {
    kind: "seq-view-spec",
    version: "0.1.0",
    id: "P69905-1A3N-sequence-structure",
    metadata: {
      label: "P69905 alignment-derived signals with experimental 1A3N coverage",
      description:
        "Single-protein offline view; conservation and gap fraction are derived only from the frozen 32-row PF00042.29 alignment.",
    },
    sequences: [
      {
        ...sequence,
        provenance: {
          label: "Checked-in UniProtKB P69905 fixture",
          generatedBy: "P01/P60",
        },
      },
    ],
    annotations: [
      {
        id: "P69905-alignment-conservation",
        kind: "values",
        semanticType: "alignment.conservation.fraction",
        space: p69905SequenceSpace.id,
        valueType: "number",
        values: {
          encoding: "sparse",
          data: exactColumns.map((row) => ({
            position: row.sourceIndex,
            value: Number(conservation.values.data[row.column]),
          })),
        },
        provenance: {
          label: "Seq* conservation projected from frozen PF00042.29 columns",
          generatedBy: "@seq-star/seq-core via P60 checked alignment",
        },
      },
      {
        id: "P69905-alignment-gap-fraction",
        kind: "values",
        semanticType: "alignment.gap-fraction",
        space: p69905SequenceSpace.id,
        valueType: "number",
        values: {
          encoding: "sparse",
          data: exactColumns.map((row) => ({
            position: row.sourceIndex,
            value: gapFraction.filter((positions) => positions[row.column] === null).length / 32,
          })),
        },
        provenance: {
          label: "Gap fraction projected from exactly 32 frozen PF00042.29 rows",
          generatedBy: "P60 checked alignment",
        },
      },
      {
        id: "P69905-structure-coverage",
        kind: "values",
        semanticType: "structure.observed-coverage",
        space: p69905SequenceSpace.id,
        valueType: "boolean",
        values: {
          encoding: "dense",
          data: structureRows.map((row) => row.status === "exact"),
        },
        provenance: {
          label: "Exact observed-coordinate status from approved P69905/1A3N mapping TSV",
          generatedBy: "P01/P60",
        },
      },
    ],
    views: [
      {
        id: "P69905-structure-main",
        axis: {
          segments: [{ id: "P69905-axis", space: p69905SequenceSpace.id, start: 0, end: 142 }],
          ruler: { visible: true, numbering: "one-based" },
        },
        sections: [
          {
            id: "annotations",
            tracks: [
              {
                id: "sequence",
                label: "P69905 sequence",
                layers: [
                  {
                    id: "residues",
                    representation: "sequence",
                    sequence: "P69905",
                    showLetters: true,
                  },
                ],
              },
              {
                id: "alignment-conservation",
                label: "PF00042.29 conservation (32 frozen rows)",
                layers: [
                  {
                    id: "conservation-heatmap",
                    representation: "heatmap",
                    annotation: "P69905-alignment-conservation",
                    color: {
                      kind: "continuous",
                      field: "value",
                      domain: [0, 1],
                      range: ["#E0F2FE", "#0369A1"],
                      clamp: true,
                      missing: "#E2E8F0",
                    },
                  },
                ],
              },
              {
                id: "alignment-gaps",
                label: "PF00042.29 gap fraction (32 frozen rows)",
                layers: [
                  {
                    id: "gap-fraction-heatmap",
                    representation: "heatmap",
                    annotation: "P69905-alignment-gap-fraction",
                    color: {
                      kind: "continuous",
                      field: "value",
                      domain: [0, 1],
                      range: ["#F1F5F9", "#7C3AED"],
                      clamp: true,
                      missing: "#E2E8F0",
                    },
                  },
                ],
              },
              {
                id: "structure-coverage",
                label: "Observed 1A3N coverage",
                layers: [
                  {
                    id: "coverage-swatch",
                    representation: "swatch",
                    annotation: "P69905-structure-coverage",
                    color: {
                      kind: "categorical",
                      field: "value",
                      colors: { true: "#059669", false: "#E2E8F0" },
                      fallback: "#E2E8F0",
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    provenance: {
      label: "Checked P69905/PF00042.29/1A3N offline dataset",
      generatedBy: "@seq-star/integration-plugins",
    },
  };
  return checkedSeqViewSpec(document, "P69905-1A3N");
};

const makeP00648Document = (assets: UniProtDatasetAssetBundle["p00648"]): SeqViewSpec => {
  const residues = oneFastaSequence(assets.p00648Fasta, "P00648");
  const rows = parseComplexMappingTsv(assets.mappingTsv);
  const contacts = parseComplexContactsTsv(assets.contactsTsv);
  const confidence = parseSyntheticConfidenceTsv(assets.confidenceTsv).filter(
    (row) => row.polymerId === "barnase",
  );
  const interfacePositions = [...new Set(contacts.map((contact) => contact.barnaseIndex))].sort(
    (left, right) => left - right,
  );
  const document: SeqViewSpec = {
    kind: "seq-view-spec",
    version: "0.1.0",
    id: "P00648-1BRS-chain-A-sequence-structure",
    metadata: {
      label: "P00648 barnase processing and 1BRS chain A interface",
      description:
        "Single-protein offline view from the approved 1BRS transforms; confidence is explicitly synthetic.",
    },
    sequences: [
      {
        id: "P00648",
        coordinateSpace: barnaseSequenceSpace.id,
        alphabet: "protein",
        residues,
        identifiers: [{ namespace: "uniprot", value: "P00648", version: "2" }],
        provenance: { label: "Checked-in UniProtKB P00648 fixture", generatedBy: "P01/P50" },
      },
    ],
    annotations: [
      {
        id: "P00648-processing",
        kind: "loci",
        semanticType: "uniprot.chain-processing.region",
        items: [
          {
            id: "signal-peptide",
            value: "signal-peptide",
            loci: [{ kind: "interval", space: barnaseSequenceSpace.id, start: 0, end: 34 }],
          },
          {
            id: "propeptide",
            value: "propeptide",
            loci: [{ kind: "interval", space: barnaseSequenceSpace.id, start: 34, end: 47 }],
          },
          {
            id: "mature-chain",
            value: "mature-chain",
            loci: [{ kind: "interval", space: barnaseSequenceSpace.id, start: 47, end: 157 }],
          },
        ],
        provenance: {
          label: "Approved P00648 processing boundaries from frozen fixture audit",
          generatedBy: "P50",
        },
      },
      {
        id: "P00648-interface",
        kind: "loci",
        semanticType: "structure.interface-residue",
        items: interfacePositions.map((position) => ({
          id: `interface-${position + 1}`,
          value: "barnase-interface",
          loci: [{ kind: "point", space: barnaseSequenceSpace.id, position }],
        })),
        provenance: {
          label: "19 chain-A interface residues from frozen 4.5 Å 1BRS contacts",
          generatedBy: "P01/P50",
        },
      },
      {
        id: "P00648-synthetic-confidence",
        kind: "values",
        semanticType: "seqstar.synthetic.confidence",
        space: barnaseSequenceSpace.id,
        valueType: "number",
        values: {
          encoding: "sparse",
          data: confidence.map((row) => ({ position: row.sourceIndex, value: row.score })),
        },
        provenance: {
          label:
            "Synthetic confidence — deterministic prototype values, not a biological prediction",
          generatedBy: "P50 frozen TSV transform",
        },
      },
      {
        id: "P00648-structure-coverage",
        kind: "values",
        semanticType: "structure.observed-coverage",
        space: barnaseSequenceSpace.id,
        valueType: "boolean",
        values: { encoding: "dense", data: rows.map((row) => row.observed) },
        provenance: {
          label: "Observed coordinates from approved P00648/1BRS chain A mapping TSV",
          generatedBy: "P01/P50",
        },
      },
    ],
    views: [
      {
        id: "P00648-structure-main",
        axis: {
          segments: [{ id: "P00648-axis", space: barnaseSequenceSpace.id, start: 0, end: 157 }],
          ruler: { visible: true, numbering: "one-based" },
        },
        sections: [
          {
            id: "annotations",
            tracks: [
              {
                id: "sequence",
                label: "P00648 precursor sequence",
                layers: [
                  {
                    id: "residues",
                    representation: "sequence",
                    sequence: "P00648",
                    showLetters: true,
                  },
                ],
              },
              {
                id: "processing",
                label: "Signal peptide, propeptide, and mature chain",
                layers: [
                  {
                    id: "processing-blocks",
                    representation: "blocks",
                    annotation: "P00648-processing",
                    laneMode: "stack",
                    color: {
                      kind: "categorical",
                      field: "value",
                      colors: {
                        '"signal-peptide"': "#94A3B8",
                        '"propeptide"': "#64748B",
                        '"mature-chain"': "#2563EB",
                      },
                      fallback: "#64748B",
                    },
                  },
                ],
              },
              {
                id: "interface-residues",
                label: "1BRS interface residues (chain A)",
                layers: [
                  {
                    id: "interface-markers",
                    representation: "markers",
                    annotation: "P00648-interface",
                    shape: "diamond",
                    color: { kind: "fixed", color: "#2563EB" },
                  },
                ],
              },
              {
                id: "synthetic-confidence",
                label: "Synthetic confidence — not a biological prediction",
                layers: [
                  {
                    id: "confidence-heatmap",
                    representation: "heatmap",
                    annotation: "P00648-synthetic-confidence",
                    color: {
                      kind: "continuous",
                      field: "value",
                      domain: [70, 100],
                      range: ["#DBEAFE", "#1D4ED8"],
                      clamp: true,
                      missing: "#E2E8F0",
                    },
                  },
                ],
              },
              {
                id: "structure-coverage",
                label: "Observed 1BRS chain A coverage",
                layers: [
                  {
                    id: "coverage-swatch",
                    representation: "swatch",
                    annotation: "P00648-structure-coverage",
                    color: {
                      kind: "categorical",
                      field: "value",
                      colors: { true: "#059669", false: "#E2E8F0" },
                      fallback: "#E2E8F0",
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    provenance: {
      label: "Checked P00648/1BRS chain A offline dataset",
      generatedBy: "@seq-star/integration-plugins",
    },
  };
  return checkedSeqViewSpec(document, "P00648-1BRS-A");
};

const dataset = (options: {
  readonly id: UniProtDatasetId;
  readonly label: string;
  readonly accession: UniProtDatasetDefinition["accession"];
  readonly structureId: UniProtDatasetDefinition["structureId"];
  readonly structureLabel: string;
  readonly sequenceSpace: CoordinateSpace;
  readonly structureSpace: CoordinateSpace;
  readonly structureUrl: string;
  readonly seqViewSpec: SeqViewSpec;
  readonly selector: MvsResidueSelector;
  readonly atomicDetailTrackIds?: readonly string[];
  readonly provenance: readonly string[];
  readonly translators: readonly [CoordinateTranslator, CoordinateTranslator];
}): RuntimeDataset => {
  const view = options.seqViewSpec.views[0];
  if (view === undefined) throw new Error(`${options.id} has no view.`);
  const trackIds = view.sections.flatMap((section) => section.tracks.map((track) => track.id));
  const definition: UniProtDatasetDefinition = {
    id: options.id,
    label: options.label,
    accession: options.accession,
    structureId: options.structureId,
    structureLabel: options.structureLabel,
    sequenceSpace: options.sequenceSpace,
    structureSpace: options.structureSpace,
    structureUrl: options.structureUrl,
    viewId: view.id,
    trackIds,
    atomicDetailTrackIds: options.atomicDetailTrackIds ?? [],
    seqViewSpec: options.seqViewSpec,
    neutralMvs: createNeutralMvs({
      structureUrl: options.structureUrl,
      title: `${options.structureId} ${options.structureLabel} — neutral`,
      selector: options.selector,
    }),
    provenance: options.provenance,
  };
  const [forward, reverse] = exactTranslatorPair(options.translators, options.sequenceSpace);
  return Object.freeze({ definition: detached(definition), forward, reverse });
};

const createRuntimeCatalog = (assets: UniProtDatasetAssetBundle): readonly RuntimeDataset[] => {
  const p53Rows = parseP04637MappingTsv(assets.p04637.mappingTsv);
  const p69905Document = makeP69905Document(assets.p69905);
  const p69905Rows = parseP69905StructureMappingTsv(assets.p69905.structureMappingTsv);
  const p69905Translators = createAlignmentStructureTranslators({
    document: createAlignmentStructureSeqViewSpec(assets.p69905),
    structureRows: p69905Rows,
  });
  const p00648Rows = parseComplexMappingTsv(assets.p00648.mappingTsv);
  return Object.freeze([
    dataset({
      id: "P04637-1TUP",
      label: "Human p53 (P04637) / 1TUP",
      accession: "P04637",
      structureId: "1TUP",
      structureLabel: "p53 chain A",
      sequenceSpace: uniprotSequenceSpace,
      structureSpace: p53StructureSpace,
      structureUrl: assets.p04637.structureUrl,
      seqViewSpec: createUniProtStructureSeqViewSpec(p53Rows),
      selector: { label_entity_id: "3", label_asym_id: "C", auth_asym_id: "A" },
      atomicDetailTrackIds: ["sites"],
      provenance: ["UniProtKB P04637", "wwPDB 1TUP", "approved P01 mapping TSV"],
      translators: createP04637MappingTranslators(p53Rows),
    }),
    dataset({
      id: "P69905-1A3N",
      label: "Hemoglobin alpha (P69905) / 1A3N",
      accession: "P69905",
      structureId: "1A3N",
      structureLabel: "hemoglobin alpha chain A",
      sequenceSpace: p69905SequenceSpace,
      structureSpace: p69905StructureSpace,
      structureUrl: assets.p69905.structureUrl,
      seqViewSpec: p69905Document,
      selector: { label_entity_id: "1", label_asym_id: "A", auth_asym_id: "A" },
      provenance: [
        "UniProtKB P69905",
        "InterPro PF00042.29 frozen 32-row alignment",
        "wwPDB 1A3N",
        "approved P01 mapping TSVs",
      ],
      translators: [p69905Translators.sequenceToStructure, p69905Translators.structureToSequence],
    }),
    dataset({
      id: "P00648-1BRS-A",
      label: "Barnase (P00648) / 1BRS chain A",
      accession: "P00648",
      structureId: "1BRS",
      structureLabel: "barnase chain A",
      sequenceSpace: barnaseSequenceSpace,
      structureSpace: barnaseStructureSpace,
      structureUrl: assets.p00648.structureUrl,
      seqViewSpec: makeP00648Document(assets.p00648),
      selector: { label_entity_id: "1", label_asym_id: "A", auth_asym_id: "A" },
      atomicDetailTrackIds: ["interface-residues"],
      provenance: [
        "UniProtKB P00648",
        "wwPDB 1BRS",
        "approved P01 mapping/contact TSVs",
        "explicitly synthetic confidence TSV",
      ],
      translators: createComplexMappingTranslators(p00648Rows),
    }),
  ]);
};

export interface UniProtDatasetTranslatorPair {
  readonly datasetId: UniProtDatasetId;
  readonly forward: CoordinateTranslator;
  readonly reverse: CoordinateTranslator;
}

/** Exact, disjoint translator edges corresponding to the detached catalog. */
export const createUniProtDatasetTranslators = (
  assets: UniProtDatasetAssetBundle,
): readonly UniProtDatasetTranslatorPair[] =>
  Object.freeze(
    createRuntimeCatalog(assets).map((item) =>
      Object.freeze({
        datasetId: item.definition.id,
        forward: item.forward,
        reverse: item.reverse,
      }),
    ),
  );

/** Builds a detached, deeply immutable, JSON-safe catalog from app-supplied checked assets. */
export const createUniProtDatasetCatalog = (
  assets: UniProtDatasetAssetBundle,
): UniProtDatasetCatalog => {
  const runtime = createRuntimeCatalog(assets);
  return detached({
    initialDatasetId: "P04637-1TUP" as const,
    datasets: runtime.map((item) => item.definition),
  });
};

const selectorFromTarget = (
  target: CoordinateLocus,
  dataset: UniProtDatasetDefinition,
): MvsResidueSelector | undefined => {
  if (
    target.kind !== "point" ||
    target.position.kind !== "label" ||
    typeof target.position.value !== "string"
  )
    return undefined;
  const match = /^label:(-?\d+)\|auth:(-?\d+)$/u.exec(target.position.value);
  if (match === null) return undefined;
  return {
    label_entity_id: String(dataset.structureSpace.context?.entity),
    label_asym_id: String(dataset.structureSpace.context?.["label-asym"]),
    auth_asym_id: String(dataset.structureSpace.context?.["auth-asym"]),
    label_seq_id: Number(match[1]),
    auth_seq_id: Number(match[2]),
    ...(target.position.insertionCode === undefined
      ? {}
      : { pdbx_PDB_ins_code: target.position.insertionCode }),
  };
};

export const generateDatasetAnnotationMvs = async (options: {
  readonly dataset: UniProtDatasetDefinition;
  readonly trackId: string;
  readonly layerId?: string;
  readonly translate: (
    loci: readonly CoordinateLocus[],
    signal: AbortSignal,
  ) => Promise<
    readonly {
      readonly source: CoordinateLocus;
      readonly targets: readonly CoordinateLocus[];
      readonly status: "exact" | "partial" | "ambiguous" | "unmapped";
    }[]
  >;
  readonly signal: AbortSignal;
  readonly requestId: string;
}): Promise<UniProtMvsGeneration> => {
  const document = options.dataset.seqViewSpec;
  const view = document.views.find((item) => item.id === options.dataset.viewId);
  const tracks = view?.sections.flatMap((section) => section.tracks) ?? [];
  const track = tracks.find((item) => item.id === options.trackId);
  const candidates = track?.layers.filter((layer) => "annotation" in layer) ?? [];
  const layer =
    options.layerId === undefined
      ? candidates.length === 1
        ? candidates[0]
        : undefined
      : candidates.find((item) => item.id === options.layerId);
  if (view === undefined || track === undefined || layer === undefined || !("annotation" in layer))
    throw new Error(`Track '${options.trackId}' does not resolve to one activatable layer.`);
  const annotation = document.annotations?.find((item) => item.id === layer.annotation);
  if (annotation === undefined || annotation.kind === "relationships")
    throw new Error(`Annotation '${layer.annotation}' is not activatable.`);
  const point = (position: number): CoordinateLocus => ({
    kind: "point",
    space: options.dataset.sequenceSpace,
    position: { kind: "index", value: position },
  });
  const loci = (
    values: readonly {
      readonly kind: string;
      readonly position?: number;
      readonly start?: number;
      readonly end?: number;
    }[],
  ): CoordinateLocus[] =>
    values.map((locus) =>
      locus.kind === "point"
        ? point(locus.position ?? -1)
        : ({
            kind: "interval",
            space: options.dataset.sequenceSpace,
            start: locus.start ?? 0,
            end: locus.end ?? 0,
          } as CoordinateLocus),
    );
  const items =
    annotation.kind === "loci"
      ? annotation.items.map((item) => ({
          id: item.id,
          value: item.value ?? null,
          properties: item.properties,
          loci: loci(item.loci),
        }))
      : annotation.values.encoding === "dense"
        ? annotation.values.data.map((value, position) => ({
            id: `${annotation.id}:${position}`,
            value,
            loci: [point(position)],
          }))
        : annotation.values.data.map(({ position, value }) => ({
            id: `${annotation.id}:${position}`,
            value,
            loci: [point(position)],
          }));
  const mapping: UniProtMvsGeneration["mapping"][number][] = [];
  for (const item of items) {
    if (options.signal.aborted) throw new DOMException("Generation superseded", "AbortError");
    const associations = await options.translate(item.loci, options.signal);
    const selectors = associations
      .flatMap((association) => association.targets)
      .flatMap((target) => {
        const selector = selectorFromTarget(target, options.dataset);
        return selector === undefined ? [] : [selector];
      });
    const status = associations.some((entry) => entry.status === "ambiguous")
      ? "ambiguous"
      : selectors.length === 0
        ? "unmapped"
        : associations.some((entry) => entry.status === "partial" || entry.status === "unmapped")
          ? "partial"
          : "mapped";
    const color =
      layer.color === undefined
        ? "#2563EB"
        : evaluateColorEncoding(
            layer.color,
            item.value,
            item.id,
            "properties" in item
              ? (item.properties as Readonly<Record<string, string | number | boolean | null>>)
              : undefined,
          );
    mapping.push({
      itemId: item.id,
      color,
      status,
      originalLoci: item.loci,
      selectors,
    });
  }
  const builder = MVSData.createBuilder();
  builder.canvas({ background_color: "white" });
  const structure = builder
    .download({ url: options.dataset.structureUrl })
    .parse({ format: "mmcif" })
    .modelStructure();
  const colors: MvsResidueColorGroup[] = mapping.flatMap((item, index) =>
    item.status === "unmapped" || item.status === "ambiguous" || item.selectors.length === 0
      ? []
      : [
          {
            semanticId: item.itemId,
            color: item.color as `#${string}`,
            precedence: index,
            selectors: item.selectors,
          },
        ],
  );
  const componentSelector: MvsResidueSelector = {
    label_entity_id: String(options.dataset.structureSpace.context?.entity),
    label_asym_id: String(options.dataset.structureSpace.context?.["label-asym"]),
    auth_asym_id: String(options.dataset.structureSpace.context?.["auth-asym"]),
  };
  const atomic = options.dataset.atomicDetailTrackIds.includes(track.id);
  const atomicDetails = [...new Set(colors.map((group) => group.color))].map((color) => ({
    semanticId: `${track.id}-atomic-detail-${color.slice(1)}`,
    color,
    selectors: colors.filter((group) => group.color === color).flatMap((group) => group.selectors),
  }));
  appendMvsCartoonPresentation(structure, [
    {
      componentSelector,
      baseColor: "#CBD5E1",
      residueColors: colors,
      ...(atomic
        ? {
            atomicDetails,
          }
        : {}),
    },
  ]);
  const mvs = fixedTimestamp(
    builder.getState({
      title: `${track.label ?? track.id} on ${options.dataset.structureId}`,
      description: `Generated from ${document.id}; mapped residues color the cartoon${atomic ? " and use one bounded ball-and-stick union" : ""}.`,
      description_format: "plaintext",
    }),
  );
  const issues = MVSData.validationIssues(mvs, { noExtra: true }) ?? [];
  if (issues.length > 0) throw new Error(`Generated MVS is invalid: ${issues.join("; ")}`);
  const counts = { mapped: 0, partial: 0, ambiguous: 0, unmapped: 0 };
  for (const item of mapping) counts[item.status]++;
  return detached({
    documentId: document.id,
    viewId: view.id,
    trackId: track.id,
    layerId: layer.id,
    requestId: options.requestId,
    mapping,
    counts,
    document: mvs,
  });
};

export interface DatasetSelectIntent {
  readonly datasetId: UniProtDatasetId;
}

export interface DatasetStatus {
  readonly datasetId: UniProtDatasetId;
  readonly previousDatasetId?: UniProtDatasetId;
  readonly generation: number;
  readonly status: "switching" | "active" | "superseded";
  readonly sequenceRequestId: string;
  readonly structureRequestId: string;
}

export interface UniProtDatasetsPluginOptions {
  readonly sequenceComponent: string;
  readonly structureComponent: string;
  readonly assets: UniProtDatasetAssetBundle;
  readonly initialDatasetId?: UniProtDatasetId;
}

type ShowIntent = {
  readonly documentId: string;
  readonly viewId: string;
  readonly trackId: string;
  readonly layerId?: string;
  readonly targetComponent: string;
};

const requiredStringSchema = { type: "string", minLength: 1 } as const;
const datasetIdSchema = {
  anyOf: UNIPROT_DATASET_IDS.map((datasetId) => ({ const: datasetId })),
} as const;
const objectSchema = (properties: Readonly<Record<string, unknown>>, required: readonly string[]) =>
  ({ type: "object", properties, required, additionalProperties: false }) as const;
const arraySchema = (items: unknown, options: { readonly minItems?: number } = {}) => ({
  type: "array",
  items,
  ...options,
});
const enumSchema = <T extends string>(values: readonly T[]) => ({
  anyOf: values.map((value) => ({ const: value })),
});
const checkedPayloadSchema = <T>(schema: Readonly<Record<string, unknown>>): PayloadSchema<T> =>
  payloadSchema<T>(schema as never);

export const DatasetSelectIntentPayloadSchema = checkedPayloadSchema<DatasetSelectIntent>(
  objectSchema({ datasetId: datasetIdSchema }, ["datasetId"]),
);

export const DatasetStatusPayloadSchema = checkedPayloadSchema<DatasetStatus>(
  objectSchema(
    {
      datasetId: datasetIdSchema,
      previousDatasetId: datasetIdSchema,
      generation: { type: "integer", minimum: 1 },
      status: enumSchema(["switching", "active", "superseded"] as const),
      sequenceRequestId: requiredStringSchema,
      structureRequestId: requiredStringSchema,
    },
    ["datasetId", "generation", "status", "sequenceRequestId", "structureRequestId"],
  ),
);

export const ShowAnnotationIntentPayloadSchema = checkedPayloadSchema<ShowIntent>(
  objectSchema(
    {
      documentId: requiredStringSchema,
      viewId: requiredStringSchema,
      trackId: requiredStringSchema,
      layerId: requiredStringSchema,
      targetComponent: requiredStringSchema,
    },
    ["documentId", "viewId", "trackId", "targetComponent"],
  ),
);

const mvsSelectorSchema = objectSchema(
  {
    label_entity_id: requiredStringSchema,
    label_asym_id: requiredStringSchema,
    auth_asym_id: requiredStringSchema,
    label_seq_id: { type: "integer" },
    auth_seq_id: { type: "integer" },
    pdbx_PDB_ins_code: { type: "string" },
  },
  ["label_entity_id", "label_asym_id", "auth_asym_id", "label_seq_id", "auth_seq_id"],
);
const generationMappingSchema = objectSchema(
  {
    itemId: requiredStringSchema,
    color: { type: "string", pattern: "^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$" },
    status: enumSchema(["mapped", "partial", "ambiguous", "unmapped"] as const),
    originalLoci: arraySchema(CoordinateLocusSchema),
    selectors: arraySchema(mvsSelectorSchema),
  },
  ["itemId", "color", "status", "originalLoci", "selectors"],
);
const generationCountsSchema = objectSchema(
  {
    mapped: { type: "integer", minimum: 0 },
    partial: { type: "integer", minimum: 0 },
    ambiguous: { type: "integer", minimum: 0 },
    unmapped: { type: "integer", minimum: 0 },
  },
  ["mapped", "partial", "ambiguous", "unmapped"],
);
const mvsMetadataSchema = objectSchema(
  {
    title: { type: "string" },
    description: { type: "string" },
    description_format: enumSchema(["markdown", "plaintext"] as const),
    timestamp: requiredStringSchema,
    version: requiredStringSchema,
  },
  ["timestamp", "version"],
);
const mvsDocumentSchema = objectSchema(
  {
    kind: { const: "single" },
    root: { type: "object" },
    metadata: mvsMetadataSchema,
  },
  ["root", "metadata"],
);

export const UniProtMvsGenerationPayloadSchema = checkedPayloadSchema<UniProtMvsGeneration>(
  objectSchema(
    {
      documentId: requiredStringSchema,
      viewId: requiredStringSchema,
      trackId: requiredStringSchema,
      layerId: requiredStringSchema,
      requestId: requiredStringSchema,
      mapping: arraySchema(generationMappingSchema),
      counts: generationCountsSchema,
      document: mvsDocumentSchema,
    },
    ["documentId", "viewId", "trackId", "layerId", "requestId", "mapping", "counts", "document"],
  ),
);

const datasetDefinitionSchema = objectSchema(
  {
    id: datasetIdSchema,
    label: requiredStringSchema,
    accession: enumSchema(["P04637", "P69905", "P00648"] as const),
    structureId: enumSchema(["1TUP", "1A3N", "1BRS"] as const),
    structureLabel: requiredStringSchema,
    sequenceSpace: CoordinateSpaceSchema,
    structureSpace: CoordinateSpaceSchema,
    structureUrl: requiredStringSchema,
    viewId: requiredStringSchema,
    trackIds: arraySchema(requiredStringSchema, { minItems: 1 }),
    atomicDetailTrackIds: arraySchema(requiredStringSchema),
    seqViewSpec: SeqViewSpecSchema,
    neutralMvs: mvsDocumentSchema,
    provenance: arraySchema(requiredStringSchema, { minItems: 1 }),
  },
  [
    "id",
    "label",
    "accession",
    "structureId",
    "structureLabel",
    "sequenceSpace",
    "structureSpace",
    "structureUrl",
    "viewId",
    "trackIds",
    "atomicDetailTrackIds",
    "seqViewSpec",
    "neutralMvs",
    "provenance",
  ],
);

export const UniProtDatasetCatalogPayloadSchema = checkedPayloadSchema<UniProtDatasetCatalog>(
  objectSchema(
    {
      initialDatasetId: datasetIdSchema,
      datasets: arraySchema(datasetDefinitionSchema, { minItems: 1 }),
    },
    ["initialDatasetId", "datasets"],
  ),
);

const message = <T>(
  type: string,
  payload: T,
  correlationId: string,
  causationId?: string,
  target?: { component: string },
): HarnessMessage => ({
  id: crypto.randomUUID(),
  type,
  version: "0.1.0",
  source: { plugin: "seqstar.uniprot-datasets" },
  ...(target === undefined ? {} : { target }),
  correlationId,
  ...(causationId === undefined ? {} : { causationId }),
  timestamp: new Date().toISOString(),
  payload: payload as never,
});

/** Dataset catalog, switching, translation and annotation generation remain plugin-owned. */
export const createUniProtDatasetsPlugin = (
  options: UniProtDatasetsPluginOptions,
): HarnessPluginSpec => ({
  id: "seqstar.uniprot-datasets",
  requires: ["seqstar:format/seqviewspec", "seqstar:format/mvs"],
  provides: [
    "seqstar:integration/uniprot-datasets",
    "seqstar:translator/sequence-structure",
    "seqstar:intent/dataset-select",
    "seqstar:generator/molviewspec-from-sequence-annotation",
  ],
  setup(context) {
    const runtime = createRuntimeCatalog(options.assets);
    const byId = new Map(runtime.map((item) => [item.definition.id, item]));
    const initialDatasetId = options.initialDatasetId ?? "P04637-1TUP";
    if (!byId.has(initialDatasetId))
      throw new Error(`Unknown initial dataset '${initialDatasetId}'.`);
    for (const item of runtime) {
      context.translators.register(item.forward);
      context.translators.register(item.reverse);
    }
    context.messageSchemas.register(
      "intent.dataset.select",
      "0.1.0",
      DatasetSelectIntentPayloadSchema,
    );
    context.messageSchemas.register("dataset.status", "0.1.0", DatasetStatusPayloadSchema);
    context.messageSchemas.register(
      "dataset.catalog.ready",
      "0.1.0",
      UniProtDatasetCatalogPayloadSchema,
    );
    context.messageSchemas.register(
      "document.generated.mvs",
      "0.1.0",
      UniProtMvsGenerationPayloadSchema,
    );
    context.messageSchemas.register(
      "intent.annotation.show-in-structure",
      "0.1.0",
      ShowAnnotationIntentPayloadSchema,
    );
    let active: RuntimeDataset | undefined;
    let switchGeneration = 0;
    let annotationGeneration = 0;
    let annotationAbort: AbortController | undefined;

    const publishSelection = async (
      datasetId: UniProtDatasetId,
      incoming: HarnessMessage,
      signal: AbortSignal,
    ): Promise<void> => {
      const selected = byId.get(datasetId);
      if (selected === undefined) throw new Error(`Unknown dataset '${datasetId}'.`);
      annotationAbort?.abort();
      annotationAbort = undefined;
      annotationGeneration++;
      const current = ++switchGeneration;
      const previousDatasetId = active?.definition.id;
      active = selected;
      const sequenceRequestId = `dataset-${current}-${datasetId}-sequence`;
      const structureRequestId = `dataset-${current}-${datasetId}-neutral`;
      const status = (state: DatasetStatus["status"]): DatasetStatus => ({
        datasetId,
        ...(previousDatasetId === undefined ? {} : { previousDatasetId }),
        generation: current,
        status: state,
        sequenceRequestId,
        structureRequestId,
      });
      context.fabric.publish(
        message("dataset.status", status("switching"), incoming.correlationId, incoming.id),
      );
      await Promise.resolve();
      if (signal.aborted || current !== switchGeneration) {
        context.fabric.publish(
          message("dataset.status", status("superseded"), incoming.correlationId, incoming.id),
        );
        return;
      }
      context.fabric.publish(
        message(
          "visualization.seqviewspec.request",
          {
            format: "seqviewspec",
            requestId: sequenceRequestId,
            mode: "replace",
            document: selected.definition.seqViewSpec,
            viewId: selected.definition.viewId,
          },
          incoming.correlationId,
          incoming.id,
          { component: options.sequenceComponent },
        ),
      );
      await Promise.resolve();
      if (signal.aborted || current !== switchGeneration) {
        context.fabric.publish(
          message("dataset.status", status("superseded"), incoming.correlationId, incoming.id),
        );
        return;
      }
      context.fabric.publish(
        message(
          "visualization.mvs.request",
          {
            format: "mvs",
            requestId: structureRequestId,
            mode: "replace",
            document: selected.definition.neutralMvs,
          },
          incoming.correlationId,
          incoming.id,
          { component: options.structureComponent },
        ),
      );
      context.fabric.publish(
        message("dataset.status", status("active"), incoming.correlationId, incoming.id),
      );
    };

    context.addProcessor({
      id: "h20.uniprot-datasets",
      types: ["intent.dataset.select", "interaction.native", "intent.annotation.show-in-structure"],
      async process(incoming, processorContext, signal) {
        if (incoming.type === "intent.dataset.select") {
          await publishSelection(
            (incoming.payload as unknown as DatasetSelectIntent).datasetId,
            incoming,
            signal,
          );
          return;
        }
        if (incoming.type === "interaction.native") {
          const event = incoming.payload as unknown as InteractionEvent;
          if (
            event.interaction !== "track-activate" ||
            event.phase !== "set" ||
            event.origin.componentId !== options.sequenceComponent ||
            event.origin.documentId === undefined ||
            event.origin.viewId === undefined ||
            event.origin.trackId === undefined ||
            active?.definition.seqViewSpec.id !== event.origin.documentId ||
            active.definition.viewId !== event.origin.viewId ||
            !active.definition.trackIds.includes(event.origin.trackId)
          )
            return;
          processorContext.fabric.publish(
            message(
              "intent.annotation.show-in-structure",
              {
                documentId: event.origin.documentId,
                viewId: event.origin.viewId,
                trackId: event.origin.trackId,
                ...(event.origin.layerId === undefined ? {} : { layerId: event.origin.layerId }),
                targetComponent: options.structureComponent,
              },
              incoming.correlationId,
              incoming.id,
            ),
          );
          return;
        }
        const selected = active;
        const intent = incoming.payload as {
          readonly documentId?: string;
          readonly viewId?: string;
          readonly trackId?: string;
          readonly layerId?: string;
          readonly targetComponent?: string;
        };
        if (
          selected === undefined ||
          intent.documentId !== selected.definition.seqViewSpec.id ||
          intent.viewId !== selected.definition.viewId ||
          intent.trackId === undefined ||
          intent.targetComponent !== options.structureComponent ||
          !selected.definition.trackIds.includes(intent.trackId)
        )
          return;
        annotationAbort?.abort();
        const controller = new AbortController();
        annotationAbort = controller;
        const current = ++annotationGeneration;
        const selectedSwitch = switchGeneration;
        const requestId = `dataset-${selectedSwitch}-${selected.definition.id}-${intent.trackId}-${current}`;
        let generated: UniProtMvsGeneration;
        try {
          generated = await generateDatasetAnnotationMvs({
            dataset: selected.definition,
            trackId: intent.trackId,
            ...(intent.layerId === undefined ? {} : { layerId: intent.layerId }),
            signal: controller.signal,
            requestId,
            translate: async (loci, localSignal) =>
              (
                await processorContext.translators.map(
                  {
                    loci,
                    target: selected.definition.structureSpace,
                    policy: { preferredTranslatorIds: [selected.forward.id], maxSteps: 1 },
                  },
                  localSignal,
                )
              ).associations,
          });
        } catch (error) {
          if (controller.signal.aborted || signal.aborted) return;
          throw error;
        }
        if (
          signal.aborted ||
          controller.signal.aborted ||
          current !== annotationGeneration ||
          selectedSwitch !== switchGeneration ||
          active !== selected
        )
          return;
        const published = detached(generated);
        processorContext.fabric.publish(
          message("document.generated.mvs", published, incoming.correlationId, incoming.id),
        );
        processorContext.fabric.publish(
          message(
            "visualization.mvs.request",
            { format: "mvs", requestId, mode: "replace", document: published.document },
            incoming.correlationId,
            incoming.id,
            { component: options.structureComponent },
          ),
        );
      },
    });
    const correlationId = crypto.randomUUID();
    const catalog: UniProtDatasetCatalog = detached({
      initialDatasetId,
      datasets: runtime.map((item) => item.definition),
    });
    context.fabric.publish(message("dataset.catalog.ready", catalog, correlationId));
    context.fabric.publish(
      message("intent.dataset.select", { datasetId: initialDatasetId }, correlationId),
    );
    return {
      dispose() {
        annotationAbort?.abort();
        active = undefined;
        switchGeneration++;
        annotationGeneration++;
      },
    };
  },
});
