import {
  type HarnessMessage,
  type HarnessPluginContext,
  type HarnessPluginSpec,
  type InteractionClearCommand,
  type InteractionCommand,
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
} from "@seq-star/seq-coords";
import { type SeqViewSpec, validateSeqViewSpec } from "@seq-star/seq-view-spec";
import { MVSData } from "molstar/lib/extensions/mvs/index.js";
import type { MVSData as MvsDocument } from "molstar/lib/extensions/mvs/mvs-data.js";
import {
  appendMvsCartoonPresentation,
  type MvsCartoonStyle,
  type MvsResidueSelector,
} from "./mvs-presentation.js";

/** The two identities are deliberately named; neither order nor axis position is biological data. */
export const barnaseSequenceSpace: CoordinateSpace = Object.freeze({
  id: "uniprot-P00648-sequence",
  kind: "sequence",
  length: 157,
});
export const barstarSequenceSpace: CoordinateSpace = Object.freeze({
  id: "uniprot-P11540-sequence",
  kind: "sequence",
  length: 90,
});
export const barnaseStructureSpace: CoordinateSpace = Object.freeze({
  id: "structure-residue",
  kind: "structure-residue",
  authority: "molstar",
  context: Object.freeze({
    entry: "1BRS",
    entity: "1",
    "label-asym": "A",
    "auth-asym": "A",
    numbering: "label-and-auth",
  }),
});
export const barstarStructureSpace: CoordinateSpace = Object.freeze({
  id: "structure-residue",
  kind: "structure-residue",
  authority: "molstar",
  context: Object.freeze({
    entry: "1BRS",
    entity: "2",
    "label-asym": "D",
    "auth-asym": "D",
    numbering: "label-and-auth",
  }),
});

type MappingStatus = "exact" | "exact_conflict" | "missing_coordinate" | "outside_construct";
export interface ComplexMappingRow {
  readonly accession: "P00648" | "P11540";
  readonly sourceIndex: number;
  readonly sourceResidue: string;
  readonly labelAsymId: "A" | "D";
  readonly authAsymId: "A" | "D";
  readonly labelSeqId?: number;
  readonly authSeqId?: number;
  readonly structureResidue?: string;
  readonly observed: boolean;
  readonly residueMatch: boolean;
  readonly status: MappingStatus;
}
export interface ComplexContact {
  readonly id: string;
  readonly barnaseIndex: number;
  readonly barnaseLabelSeqId: number;
  readonly barnaseAuthSeqId: number;
  readonly barstarIndex: number;
  readonly barstarLabelSeqId: number;
  readonly barstarAuthSeqId: number;
  readonly distance: number;
}
export interface SyntheticConfidenceRow {
  readonly polymerId: "barnase" | "barstar";
  readonly accession: "P00648" | "P11540";
  readonly maturePosition: number;
  readonly sourceIndex: number;
  readonly score: number;
}

const tsv = (
  text: string,
): { readonly headings: readonly string[]; readonly rows: readonly string[][] } => {
  const lines = text.trim().split(/\r?\n/u);
  const headings = lines.shift()?.split("\t") ?? [];
  if (headings.length === 0) throw new Error("TSV is missing headings.");
  return { headings, rows: lines.map((line) => line.split("\t")) };
};
const field = (headings: readonly string[], name: string): number => {
  const index = headings.indexOf(name);
  if (index < 0) throw new Error(`TSV is missing '${name}'.`);
  return index;
};
const optionalNumber = (value: string | undefined): number | undefined =>
  value === undefined || value === "" ? undefined : Number(value);

/** Reads the frozen transform, never a coordinate file. */
export const parseComplexMappingTsv = (text: string): readonly ComplexMappingRow[] => {
  const { headings, rows } = tsv(text);
  const accession = field(headings, "source_accession");
  const sourceIndex = field(headings, "source_index_0based");
  const sourceResidue = field(headings, "source_residue");
  const labelAsym = field(headings, "label_asym_id");
  const authAsym = field(headings, "auth_asym_id");
  const labelSeq = field(headings, "label_seq_id");
  const authSeq = field(headings, "auth_seq_id");
  const structureResidue = field(headings, "structure_residue");
  const observed = field(headings, "observed");
  const residueMatch = field(headings, "residue_match");
  const status = field(headings, "status");
  const parsed = rows.map((row) => {
    const state = row[status] as MappingStatus;
    if (!["exact", "exact_conflict", "missing_coordinate", "outside_construct"].includes(state))
      throw new Error(`Unsupported complex mapping status '${String(row[status])}'.`);
    const source = row[accession];
    if (source !== "P00648" && source !== "P11540")
      throw new Error(`Unsupported accession '${source}'.`);
    const label = row[labelAsym];
    const auth = row[authAsym];
    if (
      (source === "P00648" && (label !== "A" || auth !== "A")) ||
      (source === "P11540" && (label !== "D" || auth !== "D"))
    )
      throw new Error(`Mapping '${source}' has unexpected chain '${label}/${auth}'.`);
    return Object.freeze({
      accession: source,
      sourceIndex: Number(row[sourceIndex]),
      sourceResidue: row[sourceResidue] ?? "",
      labelAsymId: label as "A" | "D",
      authAsymId: auth as "A" | "D",
      ...(optionalNumber(row[labelSeq]) === undefined
        ? {}
        : { labelSeqId: optionalNumber(row[labelSeq]) }),
      ...(optionalNumber(row[authSeq]) === undefined
        ? {}
        : { authSeqId: optionalNumber(row[authSeq]) }),
      ...(row[structureResidue] === undefined || row[structureResidue] === ""
        ? {}
        : { structureResidue: row[structureResidue] }),
      observed: row[observed] === "true",
      residueMatch: row[residueMatch] === "true",
      status: state,
    }) as ComplexMappingRow;
  });
  const expected = parsed[0]?.accession === "P00648" ? 157 : 90;
  if (parsed.length !== expected || parsed.some((row, index) => row.sourceIndex !== index))
    throw new Error("Complex mapping must have one ordered row per source residue.");
  return Object.freeze(parsed);
};

export const parseComplexContactsTsv = (text: string): readonly ComplexContact[] => {
  const { headings, rows } = tsv(text);
  const at = (name: string) => field(headings, name);
  const contacts = rows.map((row) =>
    Object.freeze({
      id: row[at("contact_id")] ?? "",
      barnaseIndex: Number(row[at("barnase_uniprot_position")]) - 1,
      barnaseLabelSeqId: Number(row[at("barnase_label_seq_id")]),
      barnaseAuthSeqId: Number(row[at("barnase_auth_seq_id")]),
      barstarIndex: Number(row[at("barstar_uniprot_position")]) - 1,
      barstarLabelSeqId: Number(row[at("barstar_label_seq_id")]),
      barstarAuthSeqId: Number(row[at("barstar_auth_seq_id")]),
      distance: Number(row[at("minimum_distance_angstrom")]),
    }),
  );
  if (contacts.length !== 43 || new Set(contacts.map((contact) => contact.id)).size !== 43)
    throw new Error("Complex fixture must contain exactly 43 distinct frozen contacts.");
  return Object.freeze(contacts);
};

export const parseSyntheticConfidenceTsv = (text: string): readonly SyntheticConfidenceRow[] => {
  const { headings, rows } = tsv(text);
  const at = (name: string) => field(headings, name);
  const result = rows.map((row) => {
    const polymerId = row[at("polymer_id")];
    const accession = row[at("source_accession")];
    if (
      (polymerId !== "barnase" && polymerId !== "barstar") ||
      (accession !== "P00648" && accession !== "P11540")
    )
      throw new Error("Unexpected confidence polymer identity.");
    return Object.freeze({
      polymerId,
      accession,
      maturePosition: Number(row[at("mature_position_1based")]),
      sourceIndex: Number(row[at("uniprot_position_1based")]) - 1,
      score: Number(row[at("score_0_to_100")]),
    }) as SyntheticConfidenceRow;
  });
  if (result.length !== 199 || result.some((row) => row.score < 70 || row.score > 100))
    throw new Error("Synthetic confidence transform is incomplete or outside its declared range.");
  return Object.freeze(result);
};

const structurePattern = (entry: "A" | "D"): CoordinateSpacePattern => ({
  id: "structure-residue",
  kind: "structure-residue",
  authority: "molstar",
  context: {
    entry: "1BRS",
    entity: entry === "A" ? "1" : "2",
    "label-asym": entry,
    "auth-asym": entry,
  },
});
const sequencePoint = (space: CoordinateSpace, position: number): CoordinateLocus => ({
  kind: "point",
  space,
  position: { kind: "index", value: position },
});
const structurePoint = (space: CoordinateSpace, row: ComplexMappingRow): CoordinateLocus => ({
  kind: "point",
  space,
  position: { kind: "label", value: `label:${row.labelSeqId}|auth:${row.authSeqId}` },
});
const positions = (locus: CoordinateLocus): readonly number[] =>
  locus.kind === "point" && locus.position.kind === "index"
    ? [locus.position.value]
    : locus.kind === "interval"
      ? Array.from({ length: locus.end - locus.start }, (_, index) => locus.start + index)
      : [];

/** Explicit, single-chain translators. Conflict rows map to their observed construct residue with a diagnostic detail. */
export const createComplexMappingTranslators = (
  rows: readonly ComplexMappingRow[],
): readonly [CoordinateTranslator, CoordinateTranslator] => {
  const accession = rows[0]?.accession;
  if (accession !== "P00648" && accession !== "P11540") throw new Error("Empty complex mapping.");
  const sequence = accession === "P00648" ? barnaseSequenceSpace : barstarSequenceSpace;
  const structure = accession === "P00648" ? barnaseStructureSpace : barstarStructureSpace;
  const exact = rows.filter(
    (row): row is ComplexMappingRow & { labelSeqId: number; authSeqId: number } =>
      (row.status === "exact" || row.status === "exact_conflict") &&
      row.labelSeqId !== undefined &&
      row.authSeqId !== undefined,
  );
  const bySource = new Map(exact.map((row) => [row.sourceIndex, row]));
  const byStructure = new Map(exact.map((row) => [`${row.labelSeqId}|${row.authSeqId}`, row]));
  // A two-polymer document must never route through a generic sequence edge: the
  // named source space is the identity that distinguishes barnase from barstar.
  const sourcePattern: CoordinateSpacePattern = { id: sequence.id, kind: "sequence" };
  const targetPattern = structurePattern(accession === "P00648" ? "A" : "D");
  return Object.freeze([
    {
      id: `p50.${accession}-to-1BRS-chain-${accession === "P00648" ? "A" : "D"}`,
      source: sourcePattern,
      target: targetPattern,
      async map(request, signal) {
        const incompatibleTarget =
          request.target !== undefined && !coordinateSpaceMatches(targetPattern, request.target);
        const target =
          request.target !== undefined && coordinateSpaceMatches(targetPattern, request.target)
            ? request.target
            : structure;
        return {
          translatorIds: [this.id],
          diagnostics: [],
          associations: request.loci.map((source) => {
            if (
              incompatibleTarget ||
              signal.aborted ||
              !coordinateSpaceEquals(source.space, sequence)
            )
              return { source, targets: [], status: "unmapped" as const };
            const requested = positions(source);
            const mapped = requested.flatMap((position) => {
              const row = bySource.get(position);
              return row === undefined ? [] : [structurePoint(target, row)];
            });
            return {
              source,
              targets: mapped,
              status:
                mapped.length === 0
                  ? ("unmapped" as const)
                  : mapped.length === requested.length
                    ? ("exact" as const)
                    : ("partial" as const),
              details: {
                sourceResidues: requested.length,
                mappedResidues: mapped.length,
                residueConflicts: requested.filter(
                  (position) => bySource.get(position)?.status === "exact_conflict",
                ).length,
              },
            };
          }),
        };
      },
    },
    {
      id: `p50.1BRS-chain-${accession === "P00648" ? "A" : "D"}-to-${accession}`,
      source: targetPattern,
      target: sourcePattern,
      async map(request, signal) {
        const incompatibleTarget =
          request.target !== undefined && !coordinateSpaceEquals(request.target, sequence);
        const target =
          request.target !== undefined && coordinateSpaceEquals(request.target, sequence)
            ? request.target
            : sequence;
        return {
          translatorIds: [this.id],
          diagnostics: [],
          associations: request.loci.map((source) => {
            if (
              incompatibleTarget ||
              signal.aborted ||
              !coordinateSpaceMatches(targetPattern, source.space) ||
              source.kind !== "point" ||
              source.position.kind !== "label"
            )
              return { source, targets: [], status: "unmapped" as const };
            const match = /^label:(-?\d+)\|auth:(-?\d+)$/u.exec(String(source.position.value));
            const row = match === null ? undefined : byStructure.get(`${match[1]}|${match[2]}`);
            return {
              source,
              targets: row === undefined ? [] : [sequencePoint(target, row.sourceIndex)],
              status: row === undefined ? ("unmapped" as const) : ("exact" as const),
              ...(row?.status === "exact_conflict" ? { details: { residueConflict: true } } : {}),
            };
          }),
        };
      },
    },
  ]);
};

const interfaceIndexes = (contacts: readonly ComplexContact[], side: "barnase" | "barstar") =>
  [
    ...new Set(
      contacts.map((contact) => (side === "barnase" ? contact.barnaseIndex : contact.barstarIndex)),
    ),
  ].sort((left, right) => left - right);
const sparseValues = (rows: readonly SyntheticConfidenceRow[], polymer: "barnase" | "barstar") =>
  rows
    .filter((row) => row.polymerId === polymer)
    .map((row) => ({ position: row.sourceIndex, value: row.score }));

export const createComplexSeqViewSpec = (options: {
  readonly barnaseResidues: string;
  readonly barstarResidues: string;
  readonly confidence: readonly SyntheticConfidenceRow[];
  readonly contacts: readonly ComplexContact[];
}): SeqViewSpec => {
  const barnaseInterface = interfaceIndexes(options.contacts, "barnase");
  const barstarInterface = interfaceIndexes(options.contacts, "barstar");
  const document: SeqViewSpec = {
    kind: "seq-view-spec",
    version: "0.1.0",
    id: "complex-1BRS-barnase-barstar",
    metadata: {
      label: "1BRS barnase–barstar assembly",
      description: "Two named polymers; the visual gap is not a biological coordinate.",
    },
    sequences: [
      {
        id: "barnase-P00648",
        coordinateSpace: barnaseSequenceSpace.id,
        alphabet: "protein",
        residues: options.barnaseResidues,
        identifiers: [{ namespace: "uniprot", value: "P00648", version: "2" }],
      },
      {
        id: "barstar-P11540",
        coordinateSpace: barstarSequenceSpace.id,
        alphabet: "protein",
        residues: options.barstarResidues,
        identifiers: [{ namespace: "uniprot", value: "P11540", version: "3" }],
      },
    ],
    assemblies: [
      {
        id: "complex-1BRS-assembly",
        members: [
          { id: "barnase-chain-A", sequence: "barnase-P00648", role: "barnase / PDB chain A" },
          { id: "barstar-chain-D", sequence: "barstar-P11540", role: "barstar / PDB chain D" },
        ],
        provenance: {
          label: "Approved 1BRS chain identities from frozen mapping tables",
          generatedBy: "P50",
        },
      },
    ],
    annotations: [
      {
        id: "barnase-regions",
        kind: "loci",
        semanticType: "uniprot.chain-processing.region",
        provenance: {
          label: "P00648 precursor, signal peptide, propeptide, and mature-chain boundaries",
          description:
            "Named barnase regions from the approved UniProt P00648 fixture and frozen mapping audit.",
          generatedBy: "P50 frozen mapping audit",
        },
        items: [
          {
            id: "barnase-signal-peptide",
            label: "Signal peptide (P00648 1–34)",
            value: "signal-peptide",
            loci: [{ kind: "interval", space: barnaseSequenceSpace.id, start: 0, end: 34 }],
          },
          {
            id: "barnase-propeptide",
            label: "Propeptide (P00648 35–47)",
            value: "propeptide",
            loci: [{ kind: "interval", space: barnaseSequenceSpace.id, start: 34, end: 47 }],
          },
          {
            id: "barnase-mature-chain",
            label: "Mature barnase chain A source region (P00648 48–157)",
            value: "mature-chain",
            loci: [{ kind: "interval", space: barnaseSequenceSpace.id, start: 47, end: 157 }],
          },
        ],
      },
      {
        id: "barstar-regions",
        kind: "loci",
        semanticType: "uniprot.chain-processing.region",
        provenance: {
          label: "P11540 initiator-methionine and mature-chain boundaries",
          description:
            "Named barstar regions from the approved UniProt P11540 fixture and frozen mapping audit.",
          generatedBy: "P50 frozen mapping audit",
        },
        items: [
          {
            id: "barstar-initiator-methionine",
            label: "Removed initiator methionine (P11540 1)",
            value: "removed-initiator",
            loci: [{ kind: "interval", space: barstarSequenceSpace.id, start: 0, end: 1 }],
          },
          {
            id: "barstar-mature-chain",
            label: "Mature barstar chain D source region (P11540 2–90)",
            value: "mature-chain",
            loci: [{ kind: "interval", space: barstarSequenceSpace.id, start: 1, end: 90 }],
          },
        ],
      },
      {
        id: "barnase-confidence",
        kind: "values",
        semanticType: "seqstar.synthetic.confidence",
        space: barnaseSequenceSpace.id,
        valueType: "number",
        values: { encoding: "sparse", data: sparseValues(options.confidence, "barnase") },
        provenance: {
          label:
            "Synthetic confidence — deterministic prototype values, not a biological prediction",
          generatedBy: "P50 frozen TSV transform",
        },
      },
      {
        id: "barstar-confidence",
        kind: "values",
        semanticType: "seqstar.synthetic.confidence",
        space: barstarSequenceSpace.id,
        valueType: "number",
        values: { encoding: "sparse", data: sparseValues(options.confidence, "barstar") },
        provenance: {
          label:
            "Synthetic confidence — deterministic prototype values, not a biological prediction",
          generatedBy: "P50 frozen TSV transform",
        },
      },
      {
        id: "barnase-interface",
        kind: "loci",
        semanticType: "structure.interface-residue",
        items: barnaseInterface.map((index) => ({
          id: `barnase-interface-${index + 1}`,
          loci: [{ kind: "point", space: barnaseSequenceSpace.id, position: index }],
          value: "barnase",
        })),
      },
      {
        id: "barstar-interface",
        kind: "loci",
        semanticType: "structure.interface-residue",
        items: barstarInterface.map((index) => ({
          id: `barstar-interface-${index + 1}`,
          loci: [{ kind: "point", space: barstarSequenceSpace.id, position: index }],
          value: "barstar",
        })),
      },
      {
        id: "barnase-barstar-contacts",
        kind: "relationships",
        directed: false,
        semanticType: "structure.contact",
        provenance: {
          label: "Frozen 4.5 Å heavy-atom contacts from approved mapping transform",
          generatedBy: "P01 / P50",
        },
        items: options.contacts.map((contact) => ({
          // SeqViewSpec IDs must begin with a letter. The immutable source ID stays inspectable.
          id: `contact-${contact.id}`,
          value: contact.distance,
          properties: { distanceAngstrom: contact.distance, frozenContactId: contact.id },
          endpoints: [
            {
              role: "barnase",
              loci: [
                { kind: "point", space: barnaseSequenceSpace.id, position: contact.barnaseIndex },
              ],
            },
            {
              role: "barstar",
              loci: [
                { kind: "point", space: barstarSequenceSpace.id, position: contact.barstarIndex },
              ],
            },
          ],
        })),
      },
    ],
    views: [
      {
        id: "complex-1BRS-main",
        context: { assembly: "complex-1BRS-assembly" },
        axis: {
          segments: [
            {
              id: "barnase-axis",
              space: barnaseSequenceSpace.id,
              start: 0,
              end: 157,
              label: "Barnase P00648 / chain A",
            },
            {
              id: "barstar-axis",
              space: barstarSequenceSpace.id,
              start: 0,
              end: 90,
              label: "Barstar P11540 / chain D",
            },
          ],
          gap: 32,
          ruler: { visible: true, numbering: "one-based" },
        },
        sections: [
          {
            id: "complex",
            tracks: [
              {
                id: "sequences",
                label: "Named assembly polymers",
                layers: [
                  {
                    id: "barnase-sequence",
                    representation: "sequence",
                    sequence: "barnase-P00648",
                    showLetters: true,
                  },
                  {
                    id: "barstar-sequence",
                    representation: "sequence",
                    sequence: "barstar-P11540",
                    showLetters: true,
                  },
                ],
              },
              {
                id: "polymer-regions",
                label: "Named precursor and mature-chain regions",
                description:
                  "P00648 barnase and P11540 barstar regions remain in their independent named sequence spaces.",
                layers: [
                  {
                    id: "barnase-region-blocks",
                    representation: "blocks",
                    annotation: "barnase-regions",
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
                  {
                    id: "barstar-region-blocks",
                    representation: "blocks",
                    annotation: "barstar-regions",
                    laneMode: "stack",
                    color: {
                      kind: "categorical",
                      field: "value",
                      colors: {
                        '"removed-initiator"': "#94A3B8",
                        '"mature-chain"': "#D97706",
                      },
                      fallback: "#64748B",
                    },
                  },
                ],
              },
              {
                id: "synthetic-confidence",
                label:
                  "Synthetic confidence — deterministic prototype values, not a biological prediction",
                layers: [
                  {
                    id: "barnase-confidence-heatmap",
                    representation: "heatmap",
                    annotation: "barnase-confidence",
                    color: {
                      kind: "continuous",
                      field: "value",
                      domain: [70, 100],
                      range: ["#DBEAFE", "#1D4ED8"],
                      clamp: true,
                      missing: "#E2E8F0",
                    },
                  },
                  {
                    id: "barstar-confidence-heatmap",
                    representation: "heatmap",
                    annotation: "barstar-confidence",
                    color: {
                      kind: "continuous",
                      field: "value",
                      domain: [70, 100],
                      range: ["#FDE68A", "#B45309"],
                      clamp: true,
                      missing: "#E2E8F0",
                    },
                  },
                ],
              },
              {
                id: "interface",
                label: "Interface residues (both named endpoint roles)",
                layers: [
                  {
                    id: "barnase-interface-markers",
                    representation: "markers",
                    annotation: "barnase-interface",
                    shape: "diamond",
                    color: { kind: "fixed", color: "#2563EB" },
                  },
                  {
                    id: "barstar-interface-markers",
                    representation: "markers",
                    annotation: "barstar-interface",
                    shape: "diamond",
                    color: { kind: "fixed", color: "#D97706" },
                  },
                ],
              },
              {
                id: "contacts",
                label: "43 frozen barnase–barstar contacts",
                description:
                  "Compact links representation; every item retains both endpoint roles.",
                layers: [
                  {
                    id: "contact-links",
                    representation: "links",
                    annotation: "barnase-barstar-contacts",
                    color: {
                      kind: "continuous",
                      field: "value",
                      domain: [0, 4.5],
                      range: ["#94A3B8", "#7C3AED"],
                      clamp: true,
                      missing: "#94A3B8",
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
      label: "Approved 1BRS fixture plus conspicuously synthetic confidence transform",
      generatedBy: "P50",
    },
  };
  const checked = validateSeqViewSpec(document);
  if (!checked.ok)
    throw new Error(
      `P50 SeqViewSpec invalid: ${checked.diagnostics.map((item) => item.message).join("; ")}`,
    );
  return checked.value;
};

const selector = (
  role: "barnase" | "barstar",
  labelSeqId: number,
  authSeqId: number,
): MvsResidueSelector => ({
  label_entity_id: role === "barnase" ? "1" : "2",
  label_asym_id: role === "barnase" ? "A" : "D",
  auth_asym_id: role === "barnase" ? "A" : "D",
  label_seq_id: labelSeqId,
  auth_seq_id: authSeqId,
});
const compareSelectors = (left: MvsResidueSelector, right: MvsResidueSelector): number =>
  JSON.stringify(left).localeCompare(JSON.stringify(right));
export interface ComplexMvsGeneration {
  readonly requestId: string;
  readonly activation: ComplexMvsProfile;
  readonly relationshipId?: string;
  readonly endpointRoles: readonly {
    readonly role: "barnase" | "barstar";
    readonly selectors: readonly ReturnType<typeof selector>[];
  }[];
  readonly mappedContactIds: readonly string[];
  /** JSON-safe evidence for the generic inspector; no MVS builder objects leak here. */
  readonly summary: Readonly<{
    readonly profile: ComplexMvsProfile;
    readonly relationshipId?: string;
    readonly endpointRoles: readonly ("barnase" | "barstar")[];
    readonly selectorCounts: Readonly<Record<"barnase" | "barstar", number>>;
    readonly mappedSelectors: number;
    readonly unmappedSelectors: number;
    readonly syntheticData: boolean;
  }>;
  readonly document: MvsDocument;
}
const timestamp = <T extends MvsDocument>(document: T): T =>
  JSON.parse(
    JSON.stringify({
      ...document,
      metadata: { ...document.metadata, timestamp: "2026-08-20T00:00:00Z" },
    }),
  ) as T;

export type ComplexMvsProfile =
  | "neutral"
  | "regions"
  | "confidence"
  | "interface"
  | "contacts"
  | "contact";

type ComplexMvsOptions = Readonly<{
  contacts: readonly ComplexContact[];
  structureUrl: string;
  requestId: string;
  /** Required only for profiles derived from frozen residue transforms. */
  readonly barnaseMapping?: readonly ComplexMappingRow[];
  readonly barstarMapping?: readonly ComplexMappingRow[];
  readonly confidence?: readonly SyntheticConfidenceRow[];
}> &
  (
    | Readonly<{
        activation: "neutral" | "regions" | "confidence" | "interface" | "contacts";
        relationshipId?: never;
      }>
    | Readonly<{ activation: "contact"; relationshipId: string }>
  );

const profileBaseColors = {
  barnase: "#BFDBFE",
  barstar: "#FDE68A",
} as const;
const roleColors = { barnase: "#2563EB", barstar: "#D97706" } as const;
type ComplexRole = keyof typeof roleColors;

const hexColor = (start: `#${string}`, end: `#${string}`, fraction: number): `#${string}` => {
  const clamp = Math.min(1, Math.max(0, fraction));
  const channel = (offset: number) =>
    Math.round(
      Number.parseInt(start.slice(offset, offset + 2), 16) +
        (Number.parseInt(end.slice(offset, offset + 2), 16) -
          Number.parseInt(start.slice(offset, offset + 2), 16)) *
          clamp,
    )
      .toString(16)
      .padStart(2, "0");
  return `#${channel(1)}${channel(3)}${channel(5)}`.toUpperCase() as `#${string}`;
};
const mappedRows = (rows: readonly ComplexMappingRow[]): readonly ComplexMappingRow[] =>
  rows.filter(
    (row) =>
      (row.status === "exact" || row.status === "exact_conflict") &&
      row.labelSeqId !== undefined &&
      row.authSeqId !== undefined,
  );
const selectorsForIndexes = (
  role: ComplexRole,
  rows: readonly ComplexMappingRow[],
  indexes: readonly number[],
): readonly MvsResidueSelector[] => {
  const byIndex = new Map(rows.map((row) => [row.sourceIndex, row]));
  return indexes.flatMap((index) => {
    const row = byIndex.get(index);
    return row === undefined ||
      row.labelSeqId === undefined ||
      row.authSeqId === undefined ||
      !mappedRows([row]).length
      ? []
      : [selector(role, row.labelSeqId, row.authSeqId)];
  });
};
const requireMappings = (options: ComplexMvsOptions) => {
  if (options.barnaseMapping === undefined || options.barstarMapping === undefined)
    throw new Error(`Complex MVS profile '${options.activation}' requires frozen mapping rows.`);
  return { barnase: options.barnaseMapping, barstar: options.barstarMapping };
};
const group = (
  semanticId: string,
  color: `#${string}`,
  selectors: readonly MvsResidueSelector[],
): MvsCartoonStyle["residueColors"][number] => ({ semanticId, color, precedence: 1, selectors });

/** Generates a complete, self-contained MVS request from frozen contacts, before any wrapper sees it. */
export const generateComplexMvs = (options: ComplexMvsOptions): ComplexMvsGeneration => {
  const untrustedActivation = (options as { readonly activation?: unknown }).activation;
  if (
    untrustedActivation !== "neutral" &&
    untrustedActivation !== "regions" &&
    untrustedActivation !== "confidence" &&
    untrustedActivation !== "interface" &&
    untrustedActivation !== "contacts" &&
    untrustedActivation !== "contact"
  )
    throw new Error(`Unsupported complex MVS activation '${String(untrustedActivation)}'.`);
  const untrustedRelationshipId = (options as { readonly relationshipId?: unknown }).relationshipId;
  if (options.activation !== "contact" && untrustedRelationshipId !== undefined)
    throw new Error(
      `${options.activation[0]?.toUpperCase()}${options.activation.slice(1)} activation must not include a relationship ID.`,
    );
  if (
    options.activation === "contact" &&
    (typeof untrustedRelationshipId !== "string" || untrustedRelationshipId.trim().length === 0)
  )
    throw new Error("Contact activation requires a nonempty relationship ID.");
  const relationshipId =
    options.activation === "contact" ? (untrustedRelationshipId as string) : undefined;
  const selected =
    options.activation === "interface" || options.activation === "contacts"
      ? options.contacts
      : relationshipId === undefined
        ? []
        : options.contacts.filter((contact) => contact.id === relationshipId);
  if (relationshipId !== undefined && selected.length === 0)
    throw new Error(`Unknown frozen contact '${relationshipId}'.`);
  const barnase = [
    ...new Map(
      selected.map((contact) => [
        `${contact.barnaseLabelSeqId}|${contact.barnaseAuthSeqId}`,
        selector("barnase", contact.barnaseLabelSeqId, contact.barnaseAuthSeqId),
      ]),
    ).values(),
  ].sort(compareSelectors);
  const barstar = [
    ...new Map(
      selected.map((contact) => [
        `${contact.barstarLabelSeqId}|${contact.barstarAuthSeqId}`,
        selector("barstar", contact.barstarLabelSeqId, contact.barstarAuthSeqId),
      ]),
    ).values(),
  ].sort(compareSelectors);
  const mappings =
    options.activation === "regions" || options.activation === "confidence"
      ? requireMappings(options)
      : undefined;
  const residueColors: Record<ComplexRole, MvsCartoonStyle["residueColors"]> = {
    barnase: [],
    barstar: [],
  };
  let unmappedSelectors = 0;
  if (options.activation === "regions") {
    const barnaseMature = selectorsForIndexes(
      "barnase",
      mappings?.barnase ?? [],
      Array.from({ length: 110 }, (_, index) => index + 47),
    );
    const barstarMature = selectorsForIndexes(
      "barstar",
      mappings?.barstar ?? [],
      Array.from({ length: 89 }, (_, index) => index + 1),
    );
    residueColors.barnase = [group("barnase-mature-chain", "#2563EB", barnaseMature)];
    residueColors.barstar = [group("barstar-mature-chain", "#D97706", barstarMature)];
    unmappedSelectors = 199 - barnaseMature.length - barstarMature.length;
  } else if (options.activation === "confidence") {
    if (options.confidence === undefined)
      throw new Error("Complex MVS confidence profile requires frozen confidence rows.");
    const mappingBySource = {
      barnase: new Map((mappings?.barnase ?? []).map((row) => [row.sourceIndex, row])),
      barstar: new Map((mappings?.barstar ?? []).map((row) => [row.sourceIndex, row])),
    };
    for (const role of ["barnase", "barstar"] as const) {
      const start = role === "barnase" ? "#DBEAFE" : "#FDE68A";
      const end = role === "barnase" ? "#1D4ED8" : "#B45309";
      const groups = new Map<string, MvsResidueSelector[]>();
      for (const confidence of options.confidence.filter((row) => row.polymerId === role)) {
        const mapped = mappingBySource[role].get(confidence.sourceIndex);
        if (
          mapped === undefined ||
          mapped.labelSeqId === undefined ||
          mapped.authSeqId === undefined
        ) {
          unmappedSelectors++;
          continue;
        }
        const color = hexColor(start, end, (confidence.score - 70) / 30);
        const entries = groups.get(color) ?? [];
        entries.push(selector(role, mapped.labelSeqId, mapped.authSeqId));
        groups.set(color, entries);
      }
      residueColors[role] = [...groups.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([color, selectors]) =>
          group(`${role}-confidence-${color.slice(1)}`, color as `#${string}`, selectors),
        );
    }
  } else if (options.activation === "interface" || options.activation === "contact") {
    residueColors.barnase = [group("barnase-interface-endpoints", roleColors.barnase, barnase)];
    residueColors.barstar = [group("barstar-interface-endpoints", roleColors.barstar, barstar)];
  } else if (options.activation === "contacts") {
    const minDistance = new Map<string, number>();
    for (const contact of options.contacts) {
      const entries: readonly [ComplexRole, MvsResidueSelector][] = [
        ["barnase", selector("barnase", contact.barnaseLabelSeqId, contact.barnaseAuthSeqId)],
        ["barstar", selector("barstar", contact.barstarLabelSeqId, contact.barstarAuthSeqId)],
      ];
      for (const [role, currentSelector] of entries) {
        const key = `${role}:${JSON.stringify(currentSelector)}`;
        minDistance.set(key, Math.min(minDistance.get(key) ?? Infinity, contact.distance));
      }
    }
    for (const role of ["barnase", "barstar"] as const) {
      const groups = new Map<string, MvsResidueSelector[]>();
      for (const [key, distance] of minDistance) {
        if (!key.startsWith(`${role}:`)) continue;
        const currentSelector = JSON.parse(key.slice(role.length + 1)) as MvsResidueSelector;
        const color = hexColor("#94A3B8", "#7C3AED", distance / 4.5);
        const entries = groups.get(color) ?? [];
        entries.push(currentSelector);
        groups.set(color, entries);
      }
      residueColors[role] = [...groups.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([color, selectors]) =>
          group(
            `${role}-minimum-contact-distance-${color.slice(1)}`,
            color as `#${string}`,
            selectors,
          ),
        );
    }
  }
  const profileSelectors = (role: ComplexRole): readonly MvsResidueSelector[] =>
    options.activation === "regions" || options.activation === "confidence"
      ? residueColors[role].flatMap((item) => item.selectors)
      : role === "barnase"
        ? barnase
        : barstar;
  const builder = MVSData.createBuilder();
  builder.canvas({ background_color: "white" });
  const structure = builder
    .download({ url: options.structureUrl })
    .parse({ format: "mmcif" })
    .modelStructure();
  const styles: readonly MvsCartoonStyle[] = [
    {
      componentSelector: { label_entity_id: "1", label_asym_id: "A", auth_asym_id: "A" },
      baseColor: profileBaseColors.barnase,
      residueColors: residueColors.barnase,
      ...(options.activation === "interface" || options.activation === "contact"
        ? {
            atomicDetails: [
              {
                semanticId:
                  options.activation === "contact"
                    ? "barnase-contact-endpoint"
                    : "barnase-interface-residues",
                color: roleColors.barnase,
                selectors: barnase,
              },
            ],
          }
        : {}),
    },
    {
      componentSelector: { label_entity_id: "2", label_asym_id: "D", auth_asym_id: "D" },
      baseColor: profileBaseColors.barstar,
      residueColors: residueColors.barstar,
      ...(options.activation === "interface" || options.activation === "contact"
        ? {
            atomicDetails: [
              {
                semanticId:
                  options.activation === "contact"
                    ? "barstar-contact-endpoint"
                    : "barstar-interface-residues",
                color: roleColors.barstar,
                selectors: barstar,
              },
            ],
          }
        : {}),
    },
  ];
  appendMvsCartoonPresentation(structure, styles);
  // Contacts retain one atomic union per polymer role. Their detail colors are
  // selector-scoped on that union, so a residue's minimum frozen distance is
  // visible without exploding into one representation per residue.
  if (options.activation === "contacts") {
    for (const role of ["barnase", "barstar"] as const) {
      const atomic = structure
        .component({
          selector: profileSelectors(role).map((currentSelector) => ({ ...currentSelector })),
        })
        .representation({ type: "ball_and_stick" })
        .color({ color: profileBaseColors[role] });
      for (const colorGroup of residueColors[role])
        atomic.color({
          color: colorGroup.color,
          selector: [...colorGroup.selectors]
            .sort(compareSelectors)
            .map((currentSelector) => ({ ...currentSelector })),
        });
    }
  }
  if (options.activation === "contact")
    structure.component({ selector: [...barnase, ...barstar] }).focus();
  const document = timestamp(
    builder.getState({
      title:
        relationshipId === undefined
          ? `1BRS ${options.activation}`
          : `1BRS contact ${relationshipId}`,
      description:
        options.activation === "contact"
          ? `Two role-colored cartoons with bounded ball-and-stick atomic detail for both endpoints of contact ${relationshipId} and a union focus.`
          : options.activation === "interface"
            ? "Two role-colored cartoons with all mapped interface residues recolored and shown as bounded ball-and-stick overlays."
            : `Two chain-colored cartoons for the 1BRS ${options.activation} profile.`,
      description_format: "plaintext",
    }),
  );
  const issues = MVSData.validationIssues(document, { noExtra: true }) ?? [];
  if (issues.length > 0) throw new Error(`P50 generated MVS invalid: ${issues.join("; ")}`);
  return Object.freeze({
    requestId: options.requestId,
    activation: options.activation,
    ...(relationshipId === undefined ? {} : { relationshipId }),
    endpointRoles: Object.freeze([
      { role: "barnase" as const, selectors: Object.freeze(profileSelectors("barnase")) },
      { role: "barstar" as const, selectors: Object.freeze(profileSelectors("barstar")) },
    ]),
    mappedContactIds: Object.freeze(selected.map((contact) => contact.id)),
    summary: Object.freeze({
      profile: options.activation,
      ...(relationshipId === undefined ? {} : { relationshipId }),
      endpointRoles: Object.freeze(["barnase", "barstar"] as const),
      selectorCounts: Object.freeze({
        barnase: profileSelectors("barnase").length,
        barstar: profileSelectors("barstar").length,
      }),
      mappedSelectors: profileSelectors("barnase").length + profileSelectors("barstar").length,
      unmappedSelectors,
      syntheticData:
        options.activation === "confidence" ||
        options.activation === "contacts" ||
        options.activation === "contact" ||
        options.activation === "interface",
    }),
    document,
  });
};

export interface ComplexPluginOptions {
  readonly sequenceComponent: string;
  readonly structureComponent: string;
  readonly barnaseMappingTsv: string;
  readonly barstarMappingTsv: string;
  readonly contactsTsv: string;
  readonly confidenceTsv: string;
  readonly barnaseResidues: string;
  readonly barstarResidues: string;
  readonly structureUrl: string;
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const schema = <T>(check: (value: unknown) => value is T) => ({
  schema: VisualizationRequestSchema,
  check,
});
const isComplexMvsProfile = (value: unknown): value is ComplexMvsProfile =>
  value === "neutral" ||
  value === "regions" ||
  value === "confidence" ||
  value === "interface" ||
  value === "contacts" ||
  value === "contact";
const generationSchema = schema<ComplexMvsGeneration>(
  (value): value is ComplexMvsGeneration =>
    isRecord(value) &&
    typeof value.requestId === "string" &&
    isComplexMvsProfile(value.activation) &&
    isRecord(value.document) &&
    isRecord(value.summary) &&
    value.summary.profile === value.activation &&
    (value.activation === "contact"
      ? typeof value.relationshipId === "string" && typeof value.summary.relationshipId === "string"
      : value.relationshipId === undefined && value.summary.relationshipId === undefined),
);
const message = (
  type: string,
  payload: unknown,
  correlationId: string,
  causationId?: string,
  target?: string,
): HarnessMessage => ({
  id: crypto.randomUUID(),
  type,
  version: "0.1.0",
  source: { plugin: "seqstar.complex-mvs" },
  ...(target === undefined ? {} : { target: { component: target } }),
  correlationId,
  ...(causationId === undefined ? {} : { causationId }),
  timestamp: new Date().toISOString(),
  payload: payload as never,
});

type ComplexRelationshipLease = {
  readonly nativeInteractionId: string;
  readonly correlationId: string;
  readonly relationshipId: string;
  readonly requestId: string;
  readonly sourceMessageId: string;
  readonly endpoints: readonly {
    readonly role: "barnase" | "barstar";
    readonly sourceLoci: readonly CoordinateLocus[];
  }[];
  applied: boolean;
};

const relationshipCoordinateLocus = (
  role: "barnase" | "barstar",
  locus:
    | { readonly kind: "point"; readonly position: number }
    | { readonly kind: "boundary"; readonly position: number }
    | { readonly kind: "interval"; readonly start: number; readonly end: number },
): CoordinateLocus => {
  const space = role === "barnase" ? barnaseSequenceSpace : barstarSequenceSpace;
  if (locus.kind === "point") return sequencePoint(space, locus.position);
  if (locus.kind === "boundary") return { kind: "boundary", space, position: locus.position };
  return { kind: "interval", space, start: locus.start, end: locus.end };
};

export const createComplexPlugin = (options: ComplexPluginOptions): HarnessPluginSpec => ({
  id: "seqstar.complex-mvs",
  requires: ["seqstar:format/seqviewspec", "seqstar:format/mvs"],
  provides: [
    "seqstar:case/complex-mvs",
    "seqstar:translator/sequence-structure",
    "seqstar:generator/molviewspec-from-complex-contact",
  ],
  setup(context) {
    const barnaseRows = parseComplexMappingTsv(options.barnaseMappingTsv);
    const barstarRows = parseComplexMappingTsv(options.barstarMappingTsv);
    const contacts = parseComplexContactsTsv(options.contactsTsv);
    const confidence = parseSyntheticConfidenceTsv(options.confidenceTsv);
    const document = createComplexSeqViewSpec({
      barnaseResidues: options.barnaseResidues,
      barstarResidues: options.barstarResidues,
      confidence,
      contacts,
    });
    const translators = [
      ...createComplexMappingTranslators(barnaseRows),
      ...createComplexMappingTranslators(barstarRows),
    ];
    translators.forEach((translator) => {
      context.translators.register(translator);
    });
    context.messageSchemas.register("document.generated.mvs", "0.1.0", generationSchema);
    let sequenceAccepted = false;
    let generation = 0;
    let visibleMvsRequestId: string | undefined;
    let disposed = false;
    let relationshipLease: ComplexRelationshipLease | undefined;
    const relationshipAnnotation = document.annotations?.find(
      (annotation) => annotation.id === "barnase-barstar-contacts",
    );
    if (relationshipAnnotation?.kind !== "relationships")
      throw new Error("P50 relationship annotation is missing.");
    const commandInteractionId = (lease: ComplexRelationshipLease, role: string) =>
      `${lease.nativeInteractionId}:${role}`;
    const clearRelationship = (lease: ComplexRelationshipLease, causationId: string): void => {
      if (!lease.applied) return;
      const owner = {
        correlationId: lease.correlationId,
        sourceComponent: options.sequenceComponent,
      };
      for (const endpoint of lease.endpoints) {
        const payload: InteractionClearCommand = {
          interactionId: commandInteractionId(lease, endpoint.role),
          owner,
        };
        context.fabric.publish(
          message(
            "interaction.focus.clear",
            payload,
            lease.correlationId,
            causationId,
            options.structureComponent,
          ),
        );
      }
      lease.applied = false;
    };
    const applyRelationship = async (
      lease: ComplexRelationshipLease,
      causationId: string,
      processorContext: HarnessPluginContext,
      signal: AbortSignal,
    ): Promise<void> => {
      if (relationshipLease !== lease || lease.applied || signal.aborted) return;
      const descriptor = processorContext.components.get(options.structureComponent);
      const owner = {
        correlationId: lease.correlationId,
        sourceComponent: options.sequenceComponent,
      };
      const commands: InteractionCommand[] = [];
      for (const endpoint of lease.endpoints) {
        const pattern = structurePattern(endpoint.role === "barnase" ? "A" : "D");
        const target =
          descriptor?.coordinateSpaces.find((space) => coordinateSpaceMatches(pattern, space)) ??
          (endpoint.role === "barnase" ? barnaseStructureSpace : barstarStructureSpace);
        const preferred = endpoint.role === "barnase" ? translators[0]?.id : translators[2]?.id;
        const mapped = await processorContext.translators.map(
          {
            loci: endpoint.sourceLoci,
            target,
            policy: {
              ...(preferred === undefined ? {} : { preferredTranslatorIds: [preferred] }),
              maxSteps: 1,
            },
          },
          signal,
        );
        const loci = mapped.associations.flatMap((association) => association.targets);
        if (loci.length !== endpoint.sourceLoci.length)
          throw new Error(
            `Contact '${lease.relationshipId}' endpoint '${endpoint.role}' did not map exactly.`,
          );
        commands.push({
          interactionId: commandInteractionId(lease, endpoint.role),
          owner,
          mode: "replace",
          loci,
          semanticTarget: {
            relationshipId: lease.relationshipId,
            endpointRole: endpoint.role,
          },
        });
      }
      if (relationshipLease !== lease || signal.aborted) return;
      for (const command of commands)
        processorContext.fabric.publish(
          message(
            "interaction.focus.apply",
            command,
            lease.correlationId,
            causationId,
            options.structureComponent,
          ),
        );
      lease.applied = true;
    };
    context.addProcessor({
      id: "p50.complex-activation",
      types: ["lifecycle.visualization", "interaction.native"],
      async process(incoming, processorContext, signal) {
        if (incoming.type === "lifecycle.visualization") {
          const payload = incoming.payload as {
            componentId?: string;
            requestId?: string;
            status?: string;
            visibleRequestId?: string;
          };
          if (
            payload.componentId === options.sequenceComponent &&
            payload.requestId === "P50-sequence-initial" &&
            (payload.status === "accepted" ||
              payload.status === "rendered" ||
              payload.status === "degraded")
          )
            sequenceAccepted = true;
          const currentLease = relationshipLease;
          if (
            payload.componentId === options.structureComponent &&
            currentLease !== undefined &&
            incoming.correlationId === currentLease.correlationId &&
            payload.requestId === currentLease.requestId &&
            visibleMvsRequestId === currentLease.requestId &&
            payload.visibleRequestId === currentLease.requestId &&
            (payload.status === "rendered" || payload.status === "degraded")
          )
            await applyRelationship(currentLease, incoming.id, processorContext, signal);
          if (
            payload.componentId === options.structureComponent &&
            currentLease !== undefined &&
            incoming.correlationId === currentLease.correlationId &&
            payload.requestId === currentLease.requestId &&
            (payload.status === "failed" || payload.status === "superseded")
          ) {
            clearRelationship(currentLease, incoming.id);
            relationshipLease = undefined;
          }
          return;
        }
        const event = incoming.payload as unknown as InteractionEvent;
        if (
          event.phase === "clear" &&
          event.origin.componentId === options.sequenceComponent &&
          relationshipLease !== undefined &&
          (event.interactionId === relationshipLease.nativeInteractionId ||
            incoming.correlationId === relationshipLease.correlationId)
        ) {
          clearRelationship(relationshipLease, incoming.id);
          relationshipLease = undefined;
          return;
        }
        if (
          event.phase !== "set" ||
          event.origin.componentId !== options.sequenceComponent ||
          !sequenceAccepted
        )
          return;
        const headerProfiles: Readonly<Record<string, ComplexMvsProfile>> = {
          sequences: "neutral",
          "polymer-regions": "regions",
          "synthetic-confidence": "confidence",
          interface: "interface",
          contacts: "contacts",
        };
        const profile =
          event.interaction === "track-activate" && event.origin.trackId !== undefined
            ? headerProfiles[event.origin.trackId]
            : undefined;
        const rawRelationshipId =
          event.semanticTarget?.relationshipId ??
          (event.semanticTarget?.annotationId === "barnase-barstar-contacts"
            ? event.semanticTarget.itemId
            : undefined);
        // Hover/focus is intentionally transient; C20 maps its mixed-space loci
        // directly and this plugin must never replace the static MVS for it.
        const relationshipId =
          event.interaction === "select" ? rawRelationshipId?.replace(/^contact-/u, "") : undefined;
        const isContact = relationshipId !== undefined;
        if (profile === undefined && !isContact) return;
        if (relationshipLease !== undefined) {
          clearRelationship(relationshipLease, incoming.id);
          relationshipLease = undefined;
        }
        const current = ++generation;
        const activation: Exclude<ComplexMvsProfile, "contact"> = profile as Exclude<
          ComplexMvsProfile,
          "contact"
        >;
        const requestId = `P50-${activation}${relationshipId === undefined ? "" : `-${relationshipId}`}-${current}`;
        const generated =
          relationshipId === undefined
            ? generateComplexMvs({
                contacts,
                structureUrl: options.structureUrl,
                requestId,
                activation,
                barnaseMapping: barnaseRows,
                barstarMapping: barstarRows,
                confidence,
              })
            : generateComplexMvs({
                contacts,
                structureUrl: options.structureUrl,
                requestId,
                activation: "contact",
                relationshipId,
                barnaseMapping: barnaseRows,
                barstarMapping: barstarRows,
                confidence,
              });
        if (disposed || current !== generation) return;
        visibleMvsRequestId = generated.requestId;
        processorContext.fabric.publish(
          message("document.generated.mvs", generated, incoming.correlationId, incoming.id),
        );
        processorContext.fabric.publish(
          message(
            "visualization.mvs.request",
            {
              format: "mvs",
              requestId: generated.requestId,
              mode: "replace",
              document: generated.document,
            },
            incoming.correlationId,
            incoming.id,
            options.structureComponent,
          ),
        );
        if (relationshipId !== undefined) {
          const item = relationshipAnnotation.items.find(
            (candidate) => candidate.id === `contact-${relationshipId}`,
          );
          if (item === undefined)
            throw new Error(`Unknown relationship item 'contact-${relationshipId}'.`);
          relationshipLease = {
            nativeInteractionId: event.interactionId,
            correlationId: incoming.correlationId,
            relationshipId,
            requestId: generated.requestId,
            sourceMessageId: incoming.id,
            endpoints: item.endpoints.map((endpoint) => {
              if (endpoint.role !== "barnase" && endpoint.role !== "barstar")
                throw new Error(`Unsupported complex endpoint role '${endpoint.role}'.`);
              return {
                role: endpoint.role,
                sourceLoci: endpoint.loci.map((locus) =>
                  relationshipCoordinateLocus(endpoint.role as "barnase" | "barstar", locus),
                ),
              };
            }),
            applied: false,
          };
        }
      },
    });
    const correlationId = crypto.randomUUID();
    context.fabric.publish(
      message(
        "visualization.seqviewspec.request",
        {
          format: "seqviewspec",
          requestId: "P50-sequence-initial",
          mode: "replace",
          document,
          viewId: "complex-1BRS-main",
        },
        correlationId,
        undefined,
        options.sequenceComponent,
      ),
    );
    // Publish a complete neutral structure request immediately after the initial
    // sequence request. It does not wait for user interaction or a sequence
    // lifecycle acknowledgement, so the page opens with both documents pending.
    const initialMvs = generateComplexMvs({
      contacts,
      structureUrl: options.structureUrl,
      requestId: "P50-neutral-initial",
      activation: "neutral",
      barnaseMapping: barnaseRows,
      barstarMapping: barstarRows,
      confidence,
    });
    visibleMvsRequestId = initialMvs.requestId;
    context.fabric.publish(message("document.generated.mvs", initialMvs, correlationId));
    context.fabric.publish(
      message(
        "visualization.mvs.request",
        {
          format: "mvs",
          requestId: initialMvs.requestId,
          mode: "replace",
          document: initialMvs.document,
        },
        correlationId,
        undefined,
        options.structureComponent,
      ),
    );
    return {
      dispose() {
        disposed = true;
        if (relationshipLease !== undefined)
          clearRelationship(relationshipLease, relationshipLease.sourceMessageId);
        relationshipLease = undefined;
        visibleMvsRequestId = undefined;
        generation += 1;
      },
    };
  },
});
