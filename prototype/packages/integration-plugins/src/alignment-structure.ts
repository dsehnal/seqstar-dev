import {
  type HarnessMessage,
  type HarnessPluginSpec,
  type InteractionEvent,
  VisualizationRequestSchema,
} from "@seq-star/harness-core";
import {
  type CoordinateLocus,
  type CoordinateSpace,
  type CoordinateSpacePattern,
  type CoordinateTranslator,
  coordinateSpaceEquals,
  coordinateSpaceMatches,
  createAlignmentColumnToMemberTranslator,
  createMemberToAlignmentColumnTranslator,
  type MappingStatus,
} from "@seq-star/seq-coords";
import {
  type AlignmentModel,
  consensus,
  conservation,
  normalizeAlignment,
  parseAlignedFasta,
  parseFasta,
  type SequenceModel,
} from "@seq-star/seq-core";
import { type SeqViewSpec, validateSeqViewSpec } from "@seq-star/seq-view-spec";
import { MVSData } from "molstar/lib/extensions/mvs/index.js";
import type { MVSData as MvsDocument } from "molstar/lib/extensions/mvs/mvs-data.js";

const alignmentColumnLength = 118;
const p69905SequenceLength = 142;

/** Frozen SeqViewSpec interval coordinates; every interval is half-open [start, end). */
const subgroupAnnotationRanges = {
  core: [[26, 91]],
  gapEdge: [
    [21, 25],
    [56, 59],
  ],
} as const;

const inHalfOpenRanges = (
  column: number,
  ranges: readonly (readonly [start: number, end: number])[],
): boolean => ranges.some(([start, end]) => column >= start && column < end);

export const alignmentColumnSpace: CoordinateSpace = Object.freeze({
  id: "PF00042.29:alignment-columns",
  kind: "alignment",
  length: alignmentColumnLength,
});

export const p69905SequenceSpace: CoordinateSpace = Object.freeze({
  id: "P69905:sequence",
  kind: "sequence",
  length: p69905SequenceLength,
});

export const p69905StructureSpace: CoordinateSpace = Object.freeze({
  id: "structure-1A3N-P69905-chain-A",
  kind: "structure-residue",
  authority: "molstar",
  context: Object.freeze({
    entry: "1A3N",
    entity: "1",
    "label-asym": "A",
    "auth-asym": "A",
    numbering: "label-and-auth",
  }),
});

const p69905Pattern: CoordinateSpacePattern = { kind: "sequence" };
const structurePattern: CoordinateSpacePattern = {
  kind: "structure-residue",
  authority: "molstar",
  context: { entry: "1A3N", entity: "1", "label-asym": "A", "auth-asym": "A" },
};

export interface AlignmentStructureColumnRow {
  readonly column: number;
  readonly alignedResidue: string;
  readonly sourceIndex?: number;
  readonly labelSeqId?: number;
  readonly authSeqId?: number;
  readonly status: "exact" | "query_gap";
}

export interface P69905StructureRow {
  readonly sourceIndex: number;
  readonly sourceResidue: string;
  readonly labelSeqId?: number;
  readonly authSeqId?: number;
  readonly insertionCode?: string;
  readonly status: "exact" | "outside_construct";
}

const requiredColumns = (
  headings: readonly string[],
  names: readonly string[],
): Record<string, number> => {
  const found: Record<string, number> = {};
  for (const name of names) {
    const index = headings.indexOf(name);
    if (index < 0) throw new Error(`Mapping table is missing '${name}'.`);
    found[name] = index;
  }
  return found;
};
const textRows = (
  text: string,
): { readonly headings: readonly string[]; readonly rows: readonly string[][] } => {
  const lines = text.trim().split(/\r?\n/u);
  const headings = lines.shift()?.split("\t") ?? [];
  if (headings.length === 0) throw new Error("Mapping table is empty.");
  return { headings, rows: lines.filter(Boolean).map((line) => line.split("\t")) };
};
const optionalNumber = (value: string | undefined): number | undefined =>
  value === undefined || value === "" ? undefined : Number(value);

/** Parse the approved derived column table, never the source Stockholm or mmCIF. */
export const parseAlignmentStructureMappingTsv = (
  text: string,
): readonly AlignmentStructureColumnRow[] => {
  const table = textRows(text);
  const column = requiredColumns(table.headings, [
    "alignment_index_0based",
    "aligned_residue",
    "uniprot_position_1based",
    "label_seq_id",
    "auth_seq_id",
    "status",
  ]);
  const rows = table.rows.map((fields) => {
    const at = (name: string): string | undefined => {
      const index = column[name];
      if (index === undefined) throw new Error(`Mapping table is missing '${name}'.`);
      return fields[index];
    };
    const status = at("status");
    if (status !== "exact" && status !== "query_gap")
      throw new Error(`Unsupported alignment mapping status '${status}'.`);
    const sourceIndex = optionalNumber(at("uniprot_position_1based"));
    const labelSeqId = optionalNumber(at("label_seq_id"));
    const authSeqId = optionalNumber(at("auth_seq_id"));
    return Object.freeze({
      column: Number(at("alignment_index_0based")),
      alignedResidue: at("aligned_residue") ?? "",
      ...(sourceIndex === undefined ? {} : { sourceIndex: sourceIndex - 1 }),
      ...(labelSeqId === undefined ? {} : { labelSeqId }),
      ...(authSeqId === undefined ? {} : { authSeqId }),
      status,
    });
  });
  if (
    rows.length !== alignmentColumnLength ||
    rows.some((row, index) => row.column !== index) ||
    rows.filter((row) => row.status === "query_gap").length !== 7 ||
    rows.filter((row) => row.status === "exact").length !== 111
  )
    throw new Error("P69905 / PF00042 mapping must be an ordered 118-column 111-residue table.");
  if (
    rows.some((row) =>
      row.status === "exact"
        ? row.sourceIndex === undefined ||
          row.labelSeqId === undefined ||
          row.authSeqId === undefined
        : row.sourceIndex !== undefined ||
          row.labelSeqId !== undefined ||
          row.authSeqId !== undefined,
    )
  )
    throw new Error("P69905 alignment mapping has inconsistent exact/gap coordinates.");
  return Object.freeze(rows);
};

/** Parse the approved P69905 / 1A3N transform rather than parsing structural files. */
export const parseP69905StructureMappingTsv = (text: string): readonly P69905StructureRow[] => {
  const table = textRows(text);
  const column = requiredColumns(table.headings, [
    "source_index_0based",
    "source_residue",
    "label_seq_id",
    "auth_seq_id",
    "insertion_code",
    "status",
  ]);
  const rows = table.rows.map((fields) => {
    const at = (name: string): string | undefined => {
      const index = column[name];
      if (index === undefined) throw new Error(`Mapping table is missing '${name}'.`);
      return fields[index];
    };
    const status = at("status");
    if (status !== "exact" && status !== "outside_construct")
      throw new Error(`Unsupported P69905 structure status '${status}'.`);
    const labelSeqId = optionalNumber(at("label_seq_id"));
    const authSeqId = optionalNumber(at("auth_seq_id"));
    const insertionCode = at("insertion_code");
    return Object.freeze({
      sourceIndex: Number(at("source_index_0based")),
      sourceResidue: at("source_residue") ?? "",
      ...(labelSeqId === undefined ? {} : { labelSeqId }),
      ...(authSeqId === undefined ? {} : { authSeqId }),
      ...(insertionCode === undefined || insertionCode === "" ? {} : { insertionCode }),
      status,
    });
  });
  if (
    rows.length !== p69905SequenceLength ||
    rows.some((row, index) => row.sourceIndex !== index) ||
    rows.filter((row) => row.status === "exact").length !== 141
  )
    throw new Error("P69905 / 1A3N mapping must have 142 ordered rows and 141 exact residues.");
  if (
    rows.some((row) =>
      row.status === "exact"
        ? row.labelSeqId === undefined || row.authSeqId === undefined
        : row.labelSeqId !== undefined || row.authSeqId !== undefined,
    )
  )
    throw new Error("P69905 structure mapping has inconsistent exact/outside coordinates.");
  return Object.freeze(rows);
};

type NormalizedAlignment = {
  readonly sequences: readonly SequenceModel[];
  readonly alignment: AlignmentModel;
};

export interface AlignmentStructureData {
  readonly document: SeqViewSpec;
  readonly normalized: NormalizedAlignment;
  readonly columnRows: readonly AlignmentStructureColumnRow[];
  readonly structureRows: readonly P69905StructureRow[];
}

const parseData = (options: {
  readonly alignmentAfa: string;
  readonly p69905Fasta: string;
  readonly alignmentMappingTsv: string;
  readonly structureMappingTsv: string;
}): AlignmentStructureData => {
  const aligned = parseAlignedFasta(options.alignmentAfa);
  if (!aligned.ok)
    throw new Error(
      `P60 alignment parse failed: ${aligned.diagnostics.map((item) => item.code).join(", ")}`,
    );
  const normalizedResult = normalizeAlignment(aligned.value, {
    alignmentId: "PF00042.29",
    coordinateSpace: alignmentColumnSpace.id,
    alphabet: "protein",
  });
  if (!normalizedResult.ok)
    throw new Error(
      `P60 alignment normalization failed: ${normalizedResult.diagnostics.map((item) => item.code).join(", ")}`,
    );
  const normalized = normalizedResult.value;
  if (
    normalized.alignment.members.length !== 32 ||
    normalized.alignment.length !== alignmentColumnLength ||
    normalized.alignment.members[0]?.id !== "HBA_HUMAN-27-137:member"
  )
    throw new Error(
      "The checked PF00042 fixture must normalize to its frozen 32-row query-centric form.",
    );
  const p69905 = parseFasta(options.p69905Fasta);
  if (!p69905.ok || p69905.value.length !== 1 || p69905.value[0]?.id !== "P69905")
    throw new Error("P69905 FASTA fixture is invalid.");
  if (p69905.value[0]?.residues.length !== p69905SequenceLength)
    throw new Error("P69905 FASTA fixture length does not match the approved mapping table.");
  const columnRows = parseAlignmentStructureMappingTsv(options.alignmentMappingTsv);
  const structureRows = parseP69905StructureMappingTsv(options.structureMappingTsv);
  const query = normalized.alignment.members[0];
  if (
    query === undefined ||
    query.positions.some(
      (position, column) =>
        position !== (columnRows[column]?.status === "query_gap" ? null : position),
    )
  )
    throw new Error("Normalized query gaps do not agree with the approved column mapping.");
  const queryPositions = query.positions.map((position, column) =>
    position === null ? null : (columnRows[column]?.sourceIndex ?? -1),
  );
  if (queryPositions.some((position) => position === -1))
    throw new Error("An aligned P69905 residue is missing its approved UniProt position.");
  const querySequence = p69905.value[0];
  if (querySequence === undefined) throw new Error("P69905 FASTA fixture has no sequence.");
  const sequences = [
    {
      id: querySequence.id,
      coordinateSpace: p69905SequenceSpace.id,
      alphabet: querySequence.alphabet,
      residues: querySequence.residues,
      ...(querySequence.identifiers === undefined
        ? {}
        : { identifiers: querySequence.identifiers }),
      provenance: {
        label: "UniProtKB P69905",
        description: "Checked-in offline sequence used as the structure-linked alignment member.",
        generatedBy: "P60",
      },
    },
    ...normalized.sequences.slice(1).map((sequence) => ({
      id: sequence.id,
      coordinateSpace: sequence.coordinateSpace,
      alphabet: sequence.alphabet,
      residues: sequence.residues,
      ...(sequence.identifiers === undefined ? {} : { identifiers: sequence.identifiers }),
      provenance: {
        label: "PF00042.29 normalized member",
        description: "Checked-in deterministic query-centric aligned FASTA row.",
        generatedBy: "P60",
      },
    })),
  ];
  const algorithmMembers = normalized.alignment.members.map((member, index) =>
    index === 0
      ? {
          ...member,
          sequence: "P69905",
          residues: querySequence.residues,
          positions: queryPositions,
        }
      : member,
  );
  const members = algorithmMembers.map((member) => ({
    id: member.id,
    sequence: member.sequence,
    positions: member.positions,
    ...(member.metadata === undefined ? {} : { metadata: member.metadata }),
  }));
  const consensusTrack = consensus({ ...normalized.alignment, members: algorithmMembers });
  const conservationTrack = conservation({ ...normalized.alignment, members: algorithmMembers });
  const document: SeqViewSpec = {
    kind: "seq-view-spec",
    version: "0.1.0",
    id: "PF00042.29-P69905-1A3N-alignment-structure",
    metadata: {
      label: "PF00042.29 globin alignment, P69905, and 1A3N chain A",
      description: "Offline 32-row deterministic query-centric alignment; gaps remain explicit.",
    },
    sequences,
    alignments: [
      {
        id: "PF00042.29",
        coordinateSpace: alignmentColumnSpace.id,
        length: alignmentColumnLength,
        members,
        metadata: { label: "PF00042.29 (32 deterministic query-centric rows)" },
        provenance: {
          label: "InterPro PF00042.29 transformed alignment",
          description: "Checked normalized AFA, selected deterministic 32-row subset.",
          generatedBy: "P01 fixture normalization",
        },
      },
    ],
    annotations: [
      {
        id: "PF00042.29-consensus",
        kind: "values",
        semanticType: consensusTrack.semanticType,
        space: alignmentColumnSpace.id,
        valueType: "category",
        values: { encoding: "dense", data: consensusTrack.values },
        provenance: { label: "Seq* consensus", generatedBy: "@seq-star/seq-core" },
      },
      {
        id: "PF00042.29-conservation",
        kind: "values",
        semanticType: conservationTrack.semanticType,
        space: alignmentColumnSpace.id,
        valueType: "number",
        values: { encoding: "dense", data: conservationTrack.values },
        provenance: { label: "Seq* conservation fraction", generatedBy: "@seq-star/seq-core" },
      },
      {
        id: "PF00042.29-subgroups",
        kind: "loci",
        semanticType: "pfam.subgroup",
        items: [
          {
            id: "query-helix-rich-core",
            label: "Query globin core",
            value: "query-subgroup",
            loci: subgroupAnnotationRanges.core.map(([start, end]) => ({
              kind: "interval" as const,
              space: alignmentColumnSpace.id,
              start,
              end,
            })),
          },
          {
            id: "insertion-edge-columns",
            label: "Query insertion/deletion edges",
            value: "gap-edge",
            loci: subgroupAnnotationRanges.gapEdge.map(([start, end]) => ({
              kind: "interval" as const,
              space: alignmentColumnSpace.id,
              start,
              end,
            })),
          },
        ],
        provenance: { label: "P60 visual subgroup annotations", generatedBy: "P60" },
      },
    ],
    views: [
      {
        id: "PF00042.29-main",
        context: { alignment: "PF00042.29" },
        axis: {
          segments: [
            {
              id: "PF00042.29-columns",
              space: alignmentColumnSpace.id,
              start: 0,
              end: alignmentColumnLength,
              label: "PF00042.29 alignment columns",
            },
          ],
          ruler: { visible: true, numbering: "one-based" },
        },
        sections: [
          {
            id: "alignment-annotations",
            tracks: [
              {
                id: "consensus",
                label: "Consensus",
                layers: [
                  {
                    id: "consensus-swatch",
                    representation: "swatch",
                    annotation: "PF00042.29-consensus",
                    color: {
                      kind: "categorical",
                      field: "value",
                      colors: { '"-"': "#CBD5E1", '"A"': "#2563EB", '"G"': "#059669" },
                      fallback: "#64748B",
                    },
                  },
                ],
              },
              {
                id: "conservation",
                label: "Conservation",
                layers: [
                  {
                    id: "conservation-heatmap",
                    representation: "heatmap",
                    annotation: "PF00042.29-conservation",
                    color: {
                      kind: "continuous",
                      field: "value",
                      domain: [0, 1],
                      range: ["#DBEAFE", "#1D4ED8"],
                      clamp: true,
                      missing: "#CBD5E1",
                    },
                  },
                ],
              },
              {
                id: "subgroups",
                label: "Subgroup annotations",
                layers: [
                  {
                    id: "subgroup-blocks",
                    representation: "blocks",
                    annotation: "PF00042.29-subgroups",
                    laneMode: "stack",
                    color: {
                      kind: "categorical",
                      field: "value",
                      colors: { '"query-subgroup"': "#7C3AED", '"gap-edge"': "#D97706" },
                      fallback: "#64748B",
                    },
                  },
                ],
              },
            ],
          },
          {
            id: "alignment-rows",
            label: "32 stable alignment rows",
            tracks: [
              {
                id: "alignment",
                label: "PF00042.29 members",
                height: 20,
                layers: [
                  {
                    id: "aligned-residues",
                    representation: "alignment",
                    alignment: "PF00042.29",
                    showLetters: true,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    provenance: {
      label: "P60 offline alignment/structure vertical slice",
      generatedBy: "@seq-star/integration-plugins",
    },
  };
  const checked = validateSeqViewSpec(document);
  if (!checked.ok)
    throw new Error(
      `P60 SeqViewSpec invalid: ${checked.diagnostics
        .map((item) => `${item.code} ${item.path}: ${item.message}`)
        .join("; ")}`,
    );
  return { document: checked.value, normalized, columnRows, structureRows };
};

export const createAlignmentStructureSeqViewSpec = (options: {
  readonly alignmentAfa: string;
  readonly p69905Fasta: string;
  readonly alignmentMappingTsv: string;
  readonly structureMappingTsv: string;
}): SeqViewSpec => parseData(options).document;

const sequenceSpaceFor = (sequence: SeqViewSpec["sequences"][number]): CoordinateSpace =>
  sequence.id === "P69905"
    ? p69905SequenceSpace
    : Object.freeze({
        id: sequence.coordinateSpace,
        kind: "sequence",
        length: [...sequence.residues].length,
      });
const structurePoint = (row: P69905StructureRow, space: CoordinateSpace): CoordinateLocus => ({
  kind: "point",
  space,
  position: {
    kind: "label",
    value: `label:${row.labelSeqId}|auth:${row.authSeqId}`,
    ...(row.insertionCode === undefined ? {} : { insertionCode: row.insertionCode }),
  },
});
const sequencePoint = (position: number, space: CoordinateSpace): CoordinateLocus => ({
  kind: "point",
  space,
  position: { kind: "index", value: position },
});

export interface AlignmentStructureTranslators {
  readonly all: readonly CoordinateTranslator[];
  readonly columnToMember: readonly CoordinateTranslator[];
  readonly memberToColumn: readonly CoordinateTranslator[];
  readonly sequenceToStructure: CoordinateTranslator;
  readonly structureToSequence: CoordinateTranslator;
}

/** Explicit edges only: no alignment-to-structure shortcut is registered. */
export const createAlignmentStructureTranslators = (options: {
  readonly document: SeqViewSpec;
  readonly structureRows: readonly P69905StructureRow[];
}): AlignmentStructureTranslators => {
  const alignment = options.document.alignments?.find((item) => item.id === "PF00042.29");
  if (alignment === undefined) throw new Error("P60 document lacks the PF00042.29 alignment.");
  const sequences = new Map(options.document.sequences.map((item) => [item.id, item]));
  const columnToMember: CoordinateTranslator[] = [];
  const memberToColumn: CoordinateTranslator[] = [];
  for (const member of alignment.members) {
    const sequence = sequences.get(member.sequence);
    if (sequence === undefined) throw new Error(`Alignment member '${member.id}' has no sequence.`);
    const mapping = {
      alignmentSpace: alignmentColumnSpace,
      memberSpace: sequenceSpaceFor(sequence),
      positions: member.positions,
    };
    const structureLinked = member.sequence === "P69905";
    // Coordinate patterns intentionally do not carry a serialized sequence ID.
    // The table translator itself rejects non-P69905 loci; prefer the one
    // structure-linked member edge so a column takes the biologically useful
    // route instead of an arbitrary non-query row's unmapped attempt.
    columnToMember.push({
      ...createAlignmentColumnToMemberTranslator(`p60.PF00042.29.column-to-${member.id}`, mapping),
      cost: structureLinked ? 0 : 1,
    });
    memberToColumn.push({
      ...createMemberToAlignmentColumnTranslator(`p60.${member.id}-to-PF00042.29.column`, mapping),
      cost: structureLinked ? 0 : 1,
    });
  }
  const exactRows = options.structureRows.filter(
    (row): row is P69905StructureRow & { labelSeqId: number; authSeqId: number } =>
      row.status === "exact" && row.labelSeqId !== undefined && row.authSeqId !== undefined,
  );
  const bySource = new Map(exactRows.map((row) => [row.sourceIndex, row]));
  const byTarget = new Map(exactRows.map((row) => [`${row.labelSeqId}|${row.authSeqId}`, row]));
  const sequenceToStructure: CoordinateTranslator = {
    id: "p60.P69905.sequence-to-1A3N-chain-A",
    source: p69905Pattern,
    target: structurePattern,
    async map(request, signal) {
      const target =
        request.target !== undefined && coordinateSpaceMatches(structurePattern, request.target)
          ? request.target
          : p69905StructureSpace;
      return {
        translatorIds: [this.id],
        diagnostics: [],
        associations: request.loci.map((source) => {
          if (
            signal.aborted ||
            !coordinateSpaceEquals(source.space, p69905SequenceSpace) ||
            source.kind !== "point" ||
            source.position.kind !== "index"
          )
            return { source, targets: [], status: "unmapped" as const };
          const row = bySource.get(source.position.value);
          return {
            source,
            targets: row === undefined ? [] : [structurePoint(row, target)],
            status: row === undefined ? ("unmapped" as const) : ("exact" as const),
          };
        }),
      };
    },
  };
  const structureToSequence: CoordinateTranslator = {
    id: "p60.1A3N-chain-A-to-P69905.sequence",
    source: structurePattern,
    target: p69905Pattern,
    async map(request, signal) {
      const target =
        request.target !== undefined && coordinateSpaceEquals(request.target, p69905SequenceSpace)
          ? request.target
          : p69905SequenceSpace;
      return {
        translatorIds: [this.id],
        diagnostics: [],
        associations: request.loci.map((source) => {
          if (
            signal.aborted ||
            !coordinateSpaceMatches(structurePattern, source.space) ||
            source.kind !== "point" ||
            source.position.kind !== "label" ||
            typeof source.position.value !== "string"
          )
            return { source, targets: [], status: "unmapped" as const };
          const match = /^label:(-?\d+)\|auth:(-?\d+)$/u.exec(source.position.value);
          const row = match === null ? undefined : byTarget.get(`${match[1]}|${match[2]}`);
          return {
            source,
            targets: row === undefined ? [] : [sequencePoint(row.sourceIndex, target)],
            status: row === undefined ? ("unmapped" as const) : ("exact" as const),
          };
        }),
      };
    },
  };
  return Object.freeze({
    all: Object.freeze([
      ...columnToMember,
      ...memberToColumn,
      sequenceToStructure,
      structureToSequence,
    ]),
    columnToMember: Object.freeze(columnToMember),
    memberToColumn: Object.freeze(memberToColumn),
    sequenceToStructure,
    structureToSequence,
  });
};

const fixedTimestamp = <T extends MvsDocument>(document: T): T =>
  JSON.parse(
    JSON.stringify({
      ...document,
      metadata: { ...document.metadata, timestamp: "2026-08-20T00:00:00Z" },
    }),
  ) as T;

export const createNeutral1A3nMvs = (structureUrl: string): MvsDocument => {
  const builder = MVSData.createBuilder();
  builder.canvas({ background_color: "white" });
  const structure = builder
    .download({ url: structureUrl })
    .parse({ format: "mmcif" })
    .modelStructure();
  structure
    .component({ selector: { label_entity_id: "1", label_asym_id: "A", auth_asym_id: "A" } })
    .representation({ type: "cartoon" })
    .color({ color: "#CBD5E1" });
  const document = fixedTimestamp(
    builder.getState({ title: "1A3N P69905 chain A — neutral", description_format: "plaintext" }),
  );
  const issues = MVSData.validationIssues(document, { noExtra: true }) ?? [];
  if (issues.length) throw new Error(`P60 neutral MVS is invalid: ${issues.join("; ")}`);
  return document;
};

export type AlignmentProfile = "consensus" | "conservation" | "subgroup";

/** A checked local structure available to the alignment presentation. */
export interface AlignmentEnsembleMember {
  readonly id: string;
  readonly memberId: string;
  readonly label: string;
  readonly provenanceLabel: string;
  readonly url: string;
  readonly color: string;
  readonly predicted: boolean;
  /** The approved derived column-to-model table, or the P69905 table for 1A3N. */
  readonly mappingTsv: string;
  /** A checked column-major mobile-to-1A3N transform. Omit only for the reference model. */
  readonly transform?: readonly number[];
}

type EnsembleResidue = {
  readonly column: number;
  readonly labelSeqId: number;
  readonly authSeqId: number;
};

const exactMvs = (document: MvsDocument, label: string): MvsDocument => {
  const issues = MVSData.validationIssues(document, { noExtra: true }) ?? [];
  if (issues.length) throw new Error(`${label} MVS is invalid: ${issues.join("; ")}`);
  return document;
};

const profileColor = (
  profile: AlignmentProfile,
  column: number,
  memberResidue: string,
  consensusValues: readonly unknown[],
  conservationValues: readonly unknown[],
): string | undefined => {
  if (memberResidue === "-") return undefined;
  if (profile === "consensus")
    return memberResidue === consensusValues[column] ? "#2563EB" : "#DC2626";
  if (profile === "conservation") {
    const value = conservationValues[column];
    if (typeof value !== "number") return undefined;
    if (value >= 0.9) return "#312E81";
    if (value >= 0.75) return "#2563EB";
    if (value >= 0.5) return "#0EA5E9";
    return "#94A3B8";
  }
  // The narrower gap-edge annotation has intentional precedence where its
  // [56, 59) interval overlaps the broad [26, 91) core annotation.
  if (inHalfOpenRanges(column, subgroupAnnotationRanges.gapEdge)) return "#D97706";
  if (inHalfOpenRanges(column, subgroupAnnotationRanges.core)) return "#7C3AED";
  return "#64748B";
};

const parseEnsembleResidues = (member: AlignmentEnsembleMember): readonly EnsembleResidue[] => {
  const table = textRows(member.mappingTsv);
  const headings = table.headings;
  const columnIndex = headings.indexOf("alignment_index_0based");
  const labelIndex = headings.indexOf("label_seq_id");
  const authIndex = headings.indexOf("auth_seq_id");
  const statusIndex = headings.indexOf("status");
  if (columnIndex < 0 || labelIndex < 0 || authIndex < 0 || statusIndex < 0)
    throw new Error(`Checked mapping for '${member.id}' lacks alignment/model columns.`);
  const values = table.rows.flatMap((fields) => {
    const status = fields[statusIndex];
    const column = Number(fields[columnIndex]);
    const labelSeqId = optionalNumber(fields[labelIndex]);
    const authSeqId = optionalNumber(fields[authIndex]);
    if (!Number.isInteger(column) || column < 0 || column >= alignmentColumnLength) return [];
    // P69905 uses 'exact'; the predicted mappings use 'exact_observed'.
    if (
      (status !== "exact" && status !== "exact_observed") ||
      labelSeqId === undefined ||
      authSeqId === undefined
    )
      return [];
    return [{ column, labelSeqId, authSeqId } satisfies EnsembleResidue];
  });
  if (values.length === 0)
    throw new Error(`Checked mapping for '${member.id}' has no observed residues.`);
  return Object.freeze(values);
};

const chainSelector = {
  label_entity_id: "1",
  label_asym_id: "A",
  auth_asym_id: "A",
};

/**
 * Build all alignment presentations through the pinned Mol* MVS builder.  We
 * deliberately use checked mapping rows only; no CIF parsing or inferred
 * sequence alignment occurs in the browser route.
 */
export const createAlignmentEnsembleMvs = (options: {
  readonly members: readonly AlignmentEnsembleMember[];
  readonly title: string;
  readonly description: string;
  readonly profile?: AlignmentProfile;
  readonly alignment: AlignmentModel;
}): MvsDocument => {
  if (options.members.length !== 4)
    throw new Error("The approved PF00042.29 display contains exactly four checked structures.");
  const consensusAnnotation = consensus(options.alignment).values;
  const conservationAnnotation = conservation(options.alignment).values;
  const memberById = new Map(options.alignment.members.map((member) => [member.id, member]));
  const builder = MVSData.createBuilder();
  builder.canvas({ background_color: "white" });
  for (const entry of options.members) {
    const aligned = memberById.get(entry.memberId);
    if (aligned === undefined) throw new Error(`Ensemble member '${entry.memberId}' is absent.`);
    const structure = builder
      .download({ url: entry.url })
      .parse({ format: "mmcif" })
      .modelStructure();
    const transformed =
      entry.transform === undefined
        ? structure
        : structure.transform({ matrix: [...entry.transform] });
    const full = transformed.component({ selector: chainSelector });
    if (!entry.predicted) full.focus();
    const cartoon = full
      .representation({ type: "cartoon" })
      .color({ color: (options.profile === undefined ? entry.color : "#CBD5E1") as never });
    if (options.profile === undefined) continue;
    const groups = new Map<string, EnsembleResidue[]>();
    for (const residue of parseEnsembleResidues(entry)) {
      const memberPosition = aligned.positions[residue.column];
      const color = profileColor(
        options.profile,
        residue.column,
        memberPosition === null || memberPosition === undefined
          ? "-"
          : (aligned.residues[memberPosition] ?? "-"),
        consensusAnnotation,
        conservationAnnotation,
      );
      if (color !== undefined) groups.set(color, [...(groups.get(color) ?? []), residue]);
    }
    // Keep one cartoon per model and apply checked mapping rows as
    // selector-scoped colors on that representation. Separate residue
    // cartoons compete with the gray base geometry and can render gray due
    // to depth ordering; scoped color layers have deterministic precedence.
    for (const [color, residues] of [...groups].sort(([left], [right]) =>
      left.localeCompare(right),
    ))
      cartoon.color({
        color: color as never,
        selector: residues.map((residue) => ({
          ...chainSelector,
          label_seq_id: residue.labelSeqId,
          auth_seq_id: residue.authSeqId,
        })),
      });
  }
  return exactMvs(
    fixedTimestamp(
      builder.getState({
        title: options.title,
        description: options.description,
        description_format: "plaintext",
      }),
    ),
    "Alignment ensemble",
  );
};

const customSchema = <T>(check: (value: unknown) => value is T) => ({
  schema: VisualizationRequestSchema,
  check,
});
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
type ReadyPayload = {
  readonly documentId: string;
  readonly alignmentId: string;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly queryGapColumns: number;
  readonly translatorIds: readonly string[];
};
type MappingPayload = {
  readonly direction: "alignment-to-structure" | "structure-to-alignment" | "column-selection";
  readonly interaction: "hover" | "select";
  readonly phase: "set" | "clear";
  readonly status: MappingStatus;
  readonly translatorIds: readonly string[];
  readonly targetCount: number;
  readonly sourceMemberId?: string;
  readonly alignmentId: string;
};
type ProfileIntentPayload = { readonly profile: AlignmentProfile };
type MemberIntentPayload = { readonly memberId: string };
type ShowAllIntentPayload = { readonly ensembleId: string };
type AlignmentActionPayload =
  | { readonly kind: "profile"; readonly profile: AlignmentProfile; readonly requestId: string }
  | { readonly kind: "member"; readonly memberId: string; readonly requestId: string }
  | {
      readonly kind: "show-all";
      readonly ensembleId: string;
      readonly profile: AlignmentProfile;
      readonly requestId: string;
    };
const readySchema = customSchema<ReadyPayload>(
  (value): value is ReadyPayload =>
    isObject(value) &&
    typeof value.documentId === "string" &&
    typeof value.alignmentId === "string" &&
    typeof value.rowCount === "number" &&
    typeof value.columnCount === "number" &&
    typeof value.queryGapColumns === "number" &&
    Array.isArray(value.translatorIds),
);
const mappingSchema = customSchema<MappingPayload>(
  (value): value is MappingPayload =>
    isObject(value) &&
    (value.direction === "alignment-to-structure" ||
      value.direction === "structure-to-alignment" ||
      value.direction === "column-selection") &&
    (value.interaction === "hover" || value.interaction === "select") &&
    (value.phase === "set" || value.phase === "clear") &&
    (value.status === "exact" ||
      value.status === "partial" ||
      value.status === "ambiguous" ||
      value.status === "unmapped") &&
    Array.isArray(value.translatorIds) &&
    typeof value.targetCount === "number" &&
    typeof value.alignmentId === "string",
);
const profileIntentSchema = customSchema<ProfileIntentPayload>(
  (value): value is ProfileIntentPayload =>
    isObject(value) &&
    (value.profile === "consensus" ||
      value.profile === "conservation" ||
      value.profile === "subgroup"),
);
const memberIntentSchema = customSchema<MemberIntentPayload>(
  (value): value is MemberIntentPayload => isObject(value) && typeof value.memberId === "string",
);
const showAllIntentSchema = customSchema<ShowAllIntentPayload>(
  (value): value is ShowAllIntentPayload => isObject(value) && typeof value.ensembleId === "string",
);
const actionSchema = customSchema<AlignmentActionPayload>(
  (value): value is AlignmentActionPayload =>
    isObject(value) &&
    typeof value.kind === "string" &&
    typeof value.requestId === "string" &&
    ((value.kind === "profile" &&
      (value.profile === "consensus" ||
        value.profile === "conservation" ||
        value.profile === "subgroup")) ||
      (value.kind === "member" && typeof value.memberId === "string") ||
      (value.kind === "show-all" &&
        typeof value.ensembleId === "string" &&
        (value.profile === "consensus" ||
          value.profile === "conservation" ||
          value.profile === "subgroup"))),
);
const message = <T>(
  type: string,
  payload: T,
  source: string,
  correlationId: string,
  causationId?: string,
  target?: { component: string },
): HarnessMessage => ({
  id: crypto.randomUUID(),
  type,
  version: "0.1.0",
  source: { plugin: source },
  ...(target === undefined ? {} : { target }),
  correlationId,
  ...(causationId === undefined ? {} : { causationId }),
  timestamp: new Date().toISOString(),
  payload: payload as never,
});

export interface AlignmentStructurePluginOptions {
  readonly alignmentComponent: string;
  readonly structureComponent: string;
  readonly alignmentAfa: string;
  readonly p69905Fasta: string;
  readonly alignmentMappingTsv: string;
  readonly structureMappingTsv: string;
  readonly structureUrl: string;
  readonly ensemble: readonly AlignmentEnsembleMember[];
  readonly ensembleId: string;
}

/**
 * P60 integration owns fixture normalization and explicit translator edges;
 * viewers merely consume harness requests and normalized interactions.
 */
export const createAlignmentStructurePlugin = (
  options: AlignmentStructurePluginOptions,
): HarnessPluginSpec => ({
  id: "seqstar.alignment-structure",
  requires: ["seqstar:format/seqviewspec", "seqstar:format/mvs"],
  provides: [
    "seqstar:integration/alignment-structure",
    "seqstar:translator/alignment-member",
    "seqstar:translator/sequence-structure",
  ],
  setup(context) {
    const data = parseData(options);
    const translators = createAlignmentStructureTranslators({
      document: data.document,
      structureRows: data.structureRows,
    });
    translators.all.forEach((translator) => {
      context.translators.register(translator);
    });
    context.messageSchemas.register("alignment-structure.ready", "0.1.0", readySchema);
    context.messageSchemas.register("alignment-structure.mapping", "0.1.0", mappingSchema);
    context.messageSchemas.register("alignment.profile.activate", "0.1.0", profileIntentSchema);
    context.messageSchemas.register("alignment.structure.show-member", "0.1.0", memberIntentSchema);
    context.messageSchemas.register("alignment.structure.show-all", "0.1.0", showAllIntentSchema);
    context.messageSchemas.register("alignment-structure.action", "0.1.0", actionSchema);
    const correlationId = crypto.randomUUID();
    const ready: ReadyPayload = {
      documentId: data.document.id,
      alignmentId: "PF00042.29",
      rowCount: data.document.alignments?.[0]?.members.length ?? 0,
      columnCount: alignmentColumnLength,
      queryGapColumns: data.columnRows.filter((row) => row.status === "query_gap").length,
      translatorIds: translators.all.map((translator) => translator.id),
    };
    context.fabric.publish(
      message("alignment-structure.ready", ready, "seqstar.alignment-structure", correlationId),
    );
    context.fabric.publish(
      message(
        "visualization.seqviewspec.request",
        {
          format: "seqviewspec",
          requestId: "P60-alignment-initial",
          mode: "replace",
          document: data.document,
          viewId: "PF00042.29-main",
        },
        "seqstar.alignment-structure",
        correlationId,
        undefined,
        { component: options.alignmentComponent },
      ),
    );
    context.fabric.publish(
      message(
        "visualization.mvs.request",
        {
          format: "mvs",
          requestId: "P60-structure-neutral",
          mode: "replace",
          document: createNeutral1A3nMvs(options.structureUrl),
        },
        "seqstar.alignment-structure",
        correlationId,
        undefined,
        { component: options.structureComponent },
      ),
    );
    const alignment = data.document.alignments?.[0];
    const queryMember = alignment?.members.find((member) => member.sequence === "P69905");
    if (alignment === undefined || queryMember === undefined)
      throw new Error("P60 document has no structure-linked alignment member.");
    const ensembleByMember = new Map(options.ensemble.map((member) => [member.memberId, member]));
    const ensembleResiduesByMember = new Map(
      options.ensemble.map((member) => [
        member.memberId,
        new Map(parseEnsembleResidues(member).map((residue) => [residue.column, residue])),
      ]),
    );
    if (ensembleByMember.size !== 4 || !ensembleByMember.has(queryMember.id))
      throw new Error("The alignment ensemble must expose the exact four approved members.");
    let actionGeneration = 0;
    // “Show all” should never discard the annotation colors. Conservation is
    // the initial structural profile; activating another annotation track
    // changes the profile retained by subsequent ensemble displays.
    let activeProfile: AlignmentProfile = "conservation";
    const actionRequest = (
      incoming: HarnessMessage,
      action:
        | { readonly kind: "profile"; readonly profile: AlignmentProfile }
        | { readonly kind: "member"; readonly memberId: string }
        | { readonly kind: "show-all"; readonly ensembleId: string },
    ): void => {
      const requestId = `M50-${action.kind}-${++actionGeneration}`;
      let document: MvsDocument;
      let detail: AlignmentActionPayload;
      if (action.kind === "profile") {
        activeProfile = action.profile;
        document = createAlignmentEnsembleMvs({
          members: options.ensemble,
          profile: action.profile,
          alignment: data.normalized.alignment,
          title: `PF00042.29 ${action.profile} profile across checked structures`,
          description:
            "Checked local experimental 1A3N and AlphaFold DB v6 predicted models; colors are derived only from frozen PF00042.29 alignment columns.",
        });
        detail = { kind: "profile", profile: action.profile, requestId };
      } else if (action.kind === "member") {
        const member = ensembleByMember.get(action.memberId);
        if (member === undefined) return;
        // A member action must load its exact structure, not a similarly named row.
        const builder = MVSData.createBuilder();
        builder.canvas({ background_color: "white" });
        const structure = builder
          .download({ url: member.url })
          .parse({ format: "mmcif" })
          .modelStructure();
        const transformed =
          member.transform === undefined
            ? structure
            : structure.transform({ matrix: [...member.transform] });
        const component = transformed.component({ selector: chainSelector });
        component.focus();
        component.representation({ type: "cartoon" }).color({ color: member.color as never });
        document = exactMvs(
          fixedTimestamp(
            builder.getState({
              title: `${member.label} — checked local structure`,
              description: `${member.provenanceLabel}. Displayed in the frozen P69905/1A3N frame.`,
              description_format: "plaintext",
            }),
          ),
          "Alignment member",
        );
        detail = { kind: "member", memberId: member.memberId, requestId };
      } else {
        if (action.ensembleId !== options.ensembleId) return;
        document = createAlignmentEnsembleMvs({
          members: options.ensemble,
          profile: activeProfile,
          alignment: data.normalized.alignment,
          title: `PF00042.29 ${activeProfile} annotations across the checked structures`,
          description: `Comparative experimental-plus-predicted display colored by the active ${activeProfile} annotation profile; this is not a biological ensemble. Every model uses a frozen local transform into the P69905/1A3N frame.`,
        });
        detail = {
          kind: "show-all",
          ensembleId: action.ensembleId,
          profile: activeProfile,
          requestId,
        };
      }
      context.fabric.publish(
        message(
          "visualization.mvs.request",
          { format: "mvs", requestId, mode: "replace", document },
          "seqstar.alignment-structure",
          incoming.correlationId,
          incoming.id,
          { component: options.structureComponent },
        ),
      );
      context.fabric.publish(
        message(
          "alignment-structure.action",
          detail,
          "seqstar.alignment-structure",
          incoming.correlationId,
          incoming.id,
        ),
      );
    };
    context.addProcessor({
      id: "m50.alignment-structure-actions",
      types: [
        "alignment.profile.activate",
        "alignment.structure.show-member",
        "alignment.structure.show-all",
        "interaction.native",
      ],
      process(incoming) {
        if (incoming.type === "alignment.profile.activate") {
          actionRequest(incoming, {
            kind: "profile",
            profile: (incoming.payload as unknown as ProfileIntentPayload).profile,
          });
          return;
        }
        if (incoming.type === "alignment.structure.show-member") {
          actionRequest(incoming, {
            kind: "member",
            memberId: (incoming.payload as unknown as MemberIntentPayload).memberId,
          });
          return;
        }
        if (incoming.type === "alignment.structure.show-all") {
          actionRequest(incoming, {
            kind: "show-all",
            ensembleId: (incoming.payload as unknown as ShowAllIntentPayload).ensembleId,
          });
          return;
        }
        const event = incoming.payload as unknown as InteractionEvent;
        if (
          event.interaction !== "track-activate" ||
          event.phase !== "set" ||
          event.origin.componentId !== options.alignmentComponent
        )
          return;
        const profileByTrack: Record<string, AlignmentProfile> = {
          consensus: "consensus",
          conservation: "conservation",
          subgroups: "subgroup",
        };
        const profile =
          event.origin.trackId === undefined ? undefined : profileByTrack[event.origin.trackId];
        if (profile !== undefined) actionRequest(incoming, { kind: "profile", profile });
        else if (event.origin.alignmentMemberId !== undefined)
          actionRequest(incoming, { kind: "member", memberId: event.origin.alignmentMemberId });
      },
    });
    type RoutedInteraction = "hover" | "select";
    type ActiveLease = {
      readonly interactionId: string;
      readonly owner: ReturnType<typeof owner>;
    };
    const forwardControllers = new Map<RoutedInteraction, AbortController>();
    const reverseControllers = new Map<RoutedInteraction, AbortController>();
    const forwardLeases = new Map<RoutedInteraction, ActiveLease>();
    const reverseLeases = new Map<RoutedInteraction, ActiveLease>();
    const family = (interaction: "hover" | "select"): "highlight" | "selection" =>
      interaction === "hover" ? "highlight" : "selection";
    const owner = (incoming: HarnessMessage, event: InteractionEvent) => ({
      correlationId: incoming.correlationId,
      sourceComponent: event.origin.componentId,
    });
    const publishClear = (
      incoming: HarnessMessage,
      event: InteractionEvent,
      target: string,
      lease?: ActiveLease,
    ): void => {
      if (event.interaction !== "hover" && event.interaction !== "select") return;
      context.fabric.publish(
        message(
          `interaction.${family(event.interaction)}.clear`,
          {
            interactionId: lease?.interactionId ?? event.interactionId,
            owner: lease?.owner ?? owner(incoming, event),
          },
          "seqstar.alignment-structure",
          incoming.correlationId,
          incoming.id,
          { component: target },
        ),
      );
    };
    const publishApply = (
      incoming: HarnessMessage,
      event: InteractionEvent,
      target: string,
      loci: readonly CoordinateLocus[],
    ): void => {
      if ((event.interaction !== "hover" && event.interaction !== "select") || loci.length === 0)
        return;
      context.fabric.publish(
        message(
          `interaction.${family(event.interaction)}.apply`,
          {
            interactionId: event.interactionId,
            owner: owner(incoming, event),
            mode: event.mode ?? "replace",
            loci,
            ...(event.semanticTarget === undefined ? {} : { semanticTarget: event.semanticTarget }),
          },
          "seqstar.alignment-structure",
          incoming.correlationId,
          incoming.id,
          { component: target },
        ),
      );
    };
    const publishMapping = (
      incoming: HarnessMessage,
      event: InteractionEvent,
      payload: Omit<MappingPayload, "interaction" | "phase" | "alignmentId">,
    ): void => {
      if (event.interaction !== "hover" && event.interaction !== "select") return;
      context.fabric.publish(
        message(
          "alignment-structure.mapping",
          {
            ...payload,
            interaction: event.interaction,
            phase: event.phase,
            alignmentId: alignment.id,
          } satisfies MappingPayload,
          "seqstar.alignment-structure",
          incoming.correlationId,
          incoming.id,
        ),
      );
    };
    const currentStructureSpace = (): CoordinateSpace | undefined => {
      const candidates =
        context.components
          .get(options.structureComponent)
          ?.coordinateSpaces.filter((space) => coordinateSpaceMatches(structurePattern, space)) ??
        [];
      return candidates.length === 1 ? candidates[0] : undefined;
    };
    const currentStructureSpaceForMember = (memberId: string): CoordinateSpace | undefined => {
      const member = ensembleByMember.get(memberId);
      if (member === undefined) return undefined;
      if (memberId === queryMember.id) return currentStructureSpace();
      const accession = member.id.split("-")[0]?.toUpperCase();
      const allCandidates =
        context.components
          .get(options.structureComponent)
          ?.coordinateSpaces.filter(
            (space) => space.kind === "structure-residue" && space.authority === "molstar",
          ) ?? [];
      const candidates = allCandidates.filter((space) => {
        if (space.kind !== "structure-residue" || space.authority !== "molstar") return false;
        const entry = String(space.context?.entry ?? "").toUpperCase();
        return accession !== undefined && entry.includes(accession);
      });
      // A member action intentionally loads a single local model. Mol*'s
      // model-entry identifier varies by mmCIF producer, so use that exact
      // active singleton rather than guessing an identifier from a URL.
      return candidates.length === 1 ? candidates[0] : undefined;
    };
    const controllerFor = (
      direction: "forward" | "reverse",
      interaction: "hover" | "select",
      disposalSignal: AbortSignal,
    ): AbortController => {
      const controller = new AbortController();
      const controllers = direction === "forward" ? forwardControllers : reverseControllers;
      controllers.get(interaction)?.abort();
      controllers.set(interaction, controller);
      if (disposalSignal.aborted) controller.abort();
      else disposalSignal.addEventListener("abort", () => controller.abort(), { once: true });
      return controller;
    };
    const clearDirection = (
      direction: "forward" | "reverse",
      incoming: HarnessMessage,
      event: InteractionEvent,
      target: string,
    ): void => {
      if (event.interaction !== "hover" && event.interaction !== "select") return;
      const controllers = direction === "forward" ? forwardControllers : reverseControllers;
      const leases = direction === "forward" ? forwardLeases : reverseLeases;
      controllers.get(event.interaction)?.abort();
      controllers.delete(event.interaction);
      publishClear(incoming, event, target, leases.get(event.interaction));
      leases.delete(event.interaction);
    };
    // Case-specific routing lives here rather than in React or the wrappers.
    // It gates the one structure-linked row and supplies exact named targets
    // plus preferred translator IDs to the generic harness registry.
    context.addProcessor({
      id: "p60.alignment-structure-interactions",
      types: ["interaction.native"],
      async process(incoming, processorContext, signal) {
        const event = incoming.payload as unknown as InteractionEvent;
        if (
          (event.interaction !== "hover" && event.interaction !== "select") ||
          (event.origin.componentId !== options.alignmentComponent &&
            event.origin.componentId !== options.structureComponent)
        )
          return;
        if (event.phase === "clear") {
          if (event.origin.componentId === options.alignmentComponent) {
            if (event.interaction === "select")
              publishClear(incoming, event, options.alignmentComponent);
            if (
              event.origin.alignmentMemberId !== undefined &&
              ensembleByMember.has(event.origin.alignmentMemberId)
            ) {
              const hadLease = forwardLeases.has(event.interaction);
              clearDirection("forward", incoming, event, options.structureComponent);
              publishMapping(incoming, event, {
                direction: "alignment-to-structure",
                status: hadLease ? "exact" : "unmapped",
                translatorIds: [],
                targetCount: 0,
                sourceMemberId: event.origin.alignmentMemberId,
              });
            }
          } else clearDirection("reverse", incoming, event, options.alignmentComponent);
          return;
        }
        if (event.origin.componentId === options.alignmentComponent) {
          const columns = event.loci.filter(
            (locus) =>
              locus.kind === "point" && coordinateSpaceEquals(locus.space, alignmentColumnSpace),
          );
          if (columns.length === 0) return;
          const sourceMemberId = event.origin.alignmentMemberId;
          const structureLinkedOrigin =
            sourceMemberId !== undefined && ensembleByMember.has(sourceMemberId);
          // Entering any other row replaces the active structure mark even
          // though the reference viewer does not emit a separate native clear.
          if (!structureLinkedOrigin)
            clearDirection("forward", incoming, event, options.structureComponent);
          if (event.interaction === "select") {
            const memberLoci = (
              await Promise.all(
                alignment.members.map(async (member) => {
                  const sequence = data.document.sequences.find(
                    (item) => item.id === member.sequence,
                  );
                  if (sequence === undefined) return [] as CoordinateLocus[];
                  const mapped = await processorContext.translators.map(
                    {
                      loci: columns,
                      target: sequenceSpaceFor(sequence),
                      policy: {
                        preferredTranslatorIds: [`p60.PF00042.29.column-to-${member.id}`],
                        maxSteps: 1,
                      },
                    },
                    signal,
                  );
                  return mapped.associations.flatMap((association) => association.targets);
                }),
              )
            ).flat();
            if (signal.aborted) return;
            // The column locus is what draws across every virtual row. Member
            // loci remain present for non-gap semantic inspection.
            publishApply(incoming, event, options.alignmentComponent, [...columns, ...memberLoci]);
            publishMapping(incoming, event, {
              direction: "column-selection",
              status:
                memberLoci.length === 0
                  ? "unmapped"
                  : memberLoci.length < alignment.members.length
                    ? "partial"
                    : "exact",
              translatorIds: alignment.members.map(
                (member) => `p60.PF00042.29.column-to-${member.id}`,
              ),
              targetCount: memberLoci.length,
              ...(event.origin.alignmentMemberId === undefined
                ? {}
                : { sourceMemberId: event.origin.alignmentMemberId }),
            });
          }
          if (!structureLinkedOrigin) {
            publishMapping(incoming, event, {
              direction: "alignment-to-structure",
              status: "unmapped",
              translatorIds: [],
              targetCount: 0,
              ...(event.origin.alignmentMemberId === undefined
                ? {}
                : { sourceMemberId: event.origin.alignmentMemberId }),
            });
            return;
          }
          const target =
            sourceMemberId === undefined
              ? undefined
              : currentStructureSpaceForMember(sourceMemberId);
          if (target === undefined) {
            clearDirection("forward", incoming, event, options.structureComponent);
            publishMapping(incoming, event, {
              direction: "alignment-to-structure",
              status: "unmapped",
              translatorIds: [],
              targetCount: 0,
              sourceMemberId: sourceMemberId ?? queryMember.id,
            });
            return;
          }
          // P69905 retains its audited registry path. The three predicted
          // members use their own frozen alignment-column -> member sequence
          // -> model table; they are never routed through P69905/1A3N.
          if (sourceMemberId !== queryMember.id && sourceMemberId !== undefined) {
            const rows = ensembleResiduesByMember.get(sourceMemberId);
            const loci = columns.flatMap((column) => {
              if (column.kind !== "point" || column.position.kind !== "index") return [];
              const residue = rows?.get(column.position.value);
              if (residue === undefined) return [];
              return [
                {
                  kind: "point" as const,
                  space: target,
                  position: {
                    kind: "label" as const,
                    value: `label:${residue.labelSeqId}|auth:${residue.authSeqId}`,
                  },
                },
              ];
            });
            if (loci.length === 0)
              clearDirection("forward", incoming, event, options.structureComponent);
            else {
              publishApply(incoming, event, options.structureComponent, loci);
              forwardLeases.set(event.interaction, {
                interactionId: event.interactionId,
                owner: owner(incoming, event),
              });
            }
            publishMapping(incoming, event, {
              direction: "alignment-to-structure",
              status: loci.length === 0 ? "unmapped" : "exact",
              translatorIds: [
                `p60.PF00042.29.column-to-${sourceMemberId}`,
                `m50.${sourceMemberId}.sequence-to-checked-structure`,
              ],
              targetCount: loci.length,
              sourceMemberId,
            });
            return;
          }
          const controller = controllerFor("forward", event.interaction, signal);
          const mapped = await processorContext.translators.map(
            {
              loci: columns,
              target,
              policy: {
                preferredTranslatorIds: [
                  `p60.PF00042.29.column-to-${queryMember.id}`,
                  translators.sequenceToStructure.id,
                ],
                maxSteps: 2,
              },
            },
            controller.signal,
          );
          if (controller.signal.aborted || signal.aborted) return;
          const loci = mapped.associations.flatMap((association) => association.targets);
          if (loci.length === 0)
            clearDirection("forward", incoming, event, options.structureComponent);
          else {
            publishApply(incoming, event, options.structureComponent, loci);
            forwardLeases.set(event.interaction, {
              interactionId: event.interactionId,
              owner: owner(incoming, event),
            });
          }
          publishMapping(incoming, event, {
            direction: "alignment-to-structure",
            status: mapped.associations[0]?.status ?? "unmapped",
            translatorIds: mapped.paths[0]?.translatorIds ?? [],
            targetCount: loci.length,
            sourceMemberId: queryMember.id,
          });
          return;
        }
        const controller = controllerFor("reverse", event.interaction, signal);
        const memberMapped = await processorContext.translators.map(
          {
            loci: event.loci,
            target: p69905SequenceSpace,
            policy: {
              preferredTranslatorIds: [translators.structureToSequence.id],
              maxSteps: 1,
            },
          },
          controller.signal,
        );
        const columnMapped = await processorContext.translators.map(
          {
            loci: event.loci,
            target: alignmentColumnSpace,
            policy: {
              preferredTranslatorIds: [
                translators.structureToSequence.id,
                `p60.${queryMember.id}-to-PF00042.29.column`,
              ],
              maxSteps: 2,
            },
          },
          controller.signal,
        );
        if (controller.signal.aborted || signal.aborted) return;
        const memberLoci = memberMapped.associations.flatMap((association) => association.targets);
        const columnLoci = columnMapped.associations.flatMap((association) => association.targets);
        const loci = [...columnLoci, ...memberLoci];
        if (loci.length === 0)
          clearDirection("reverse", incoming, event, options.alignmentComponent);
        else {
          publishApply(incoming, event, options.alignmentComponent, loci);
          reverseLeases.set(event.interaction, {
            interactionId: event.interactionId,
            owner: owner(incoming, event),
          });
        }
        publishMapping(incoming, event, {
          direction: "structure-to-alignment",
          status: columnMapped.associations[0]?.status ?? "unmapped",
          translatorIds: columnMapped.paths[0]?.translatorIds ?? [],
          targetCount: loci.length,
          sourceMemberId: queryMember.id,
        });
      },
    });
    return {
      dispose() {
        for (const controller of forwardControllers.values()) controller.abort();
        for (const controller of reverseControllers.values()) controller.abort();
        forwardControllers.clear();
        reverseControllers.clear();
        forwardLeases.clear();
        reverseLeases.clear();
      },
    };
  },
});
