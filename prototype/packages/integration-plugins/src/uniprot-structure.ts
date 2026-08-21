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
} from "@seq-star/seq-coords";
import {
  evaluateColorEncoding,
  type SeqViewSpec,
  validateSeqViewSpec,
} from "@seq-star/seq-view-spec";
import { MVSData } from "molstar/lib/extensions/mvs/index.js";
import type { MVSData as MvsDocument } from "molstar/lib/extensions/mvs/mvs-data.js";
import {
  appendMvsCartoonPresentation,
  type MvsResidueColorGroup,
  type MvsResidueSelector,
} from "./mvs-presentation.js";

export const uniprotSequenceSpace: CoordinateSpace = Object.freeze({
  id: "uniprot-P04637-sequence",
  kind: "sequence",
  length: 393,
});

export const p53StructureSpace: CoordinateSpace = Object.freeze({
  id: "1TUP-p53-chain-A",
  kind: "structure-residue",
  authority: "molstar",
  context: Object.freeze({
    entry: "1TUP",
    entity: "3",
    "label-asym": "C",
    "auth-asym": "A",
    numbering: "label-and-auth",
  }),
});

export interface P04637MappingRow {
  readonly sourceIndex: number;
  readonly sourceResidue: string;
  readonly labelSeqId?: number;
  readonly authSeqId?: number;
  readonly insertionCode?: string;
  readonly structureResidue?: string;
  readonly status: "exact" | "missing_coordinate" | "outside_construct";
}

/** Parse the approved P01 transform, never the mmCIF itself. */
export const parseP04637MappingTsv = (text: string): readonly P04637MappingRow[] => {
  const lines = text.trim().split(/\r?\n/u);
  const headings = lines.shift()?.split("\t") ?? [];
  const column = (name: string): number => {
    const index = headings.indexOf(name);
    if (index < 0) throw new Error(`Mapping table is missing '${name}'.`);
    return index;
  };
  const sourceIndex = column("source_index_0based");
  const sourceResidue = column("source_residue");
  const labelSeqId = column("label_seq_id");
  const authSeqId = column("auth_seq_id");
  const insertionCode = column("insertion_code");
  const structureResidue = column("structure_residue");
  const status = column("status");
  const rows = lines.map((line) => {
    const fields = line.split("\t");
    const state = fields[status];
    if (state !== "exact" && state !== "missing_coordinate" && state !== "outside_construct")
      throw new Error(`Unsupported P04637 mapping status '${state}'.`);
    const label = fields[labelSeqId];
    const auth = fields[authSeqId];
    return Object.freeze({
      sourceIndex: Number(fields[sourceIndex]),
      sourceResidue: fields[sourceResidue] ?? "",
      ...(label === undefined || label === "" ? {} : { labelSeqId: Number(label) }),
      ...(auth === undefined || auth === "" ? {} : { authSeqId: Number(auth) }),
      ...((fields[insertionCode] ?? "") === "" ? {} : { insertionCode: fields[insertionCode] }),
      ...((fields[structureResidue] ?? "") === ""
        ? {}
        : { structureResidue: fields[structureResidue] }),
      status: state,
    });
  });
  if (rows.length !== 393 || rows.some((row, index) => row.sourceIndex !== index))
    throw new Error("P04637 mapping must contain exactly one ordered row per sequence residue.");
  return Object.freeze(rows);
};

const structurePattern: CoordinateSpacePattern = {
  kind: "structure-residue",
  authority: "molstar",
  context: { entry: "1TUP", entity: "3", "label-asym": "C", "auth-asym": "A" },
};
const sequencePattern: CoordinateSpacePattern = {
  id: uniprotSequenceSpace.id,
  kind: "sequence",
};
const isP04637SequenceSpace = (space: CoordinateSpace): boolean =>
  coordinateSpaceEquals(space, uniprotSequenceSpace);
const structurePoint = (row: P04637MappingRow, space: CoordinateSpace): CoordinateLocus => ({
  kind: "point",
  space,
  position: {
    kind: "label",
    value: `label:${row.labelSeqId}|auth:${row.authSeqId}`,
    ...(row.insertionCode === undefined ? {} : { insertionCode: row.insertionCode }),
  },
});
const sequencePoint = (
  position: number,
  space: CoordinateSpace = uniprotSequenceSpace,
): CoordinateLocus => ({
  kind: "point",
  space,
  position: { kind: "index", value: position },
});

export const createP04637MappingTranslators = (
  rows: readonly P04637MappingRow[],
): readonly [CoordinateTranslator, CoordinateTranslator] => {
  const exact = rows.filter(
    (row): row is P04637MappingRow & { labelSeqId: number; authSeqId: number } =>
      row.status === "exact" && row.labelSeqId !== undefined && row.authSeqId !== undefined,
  );
  const bySource = new Map(exact.map((row) => [row.sourceIndex, row]));
  const byTarget = new Map(exact.map((row) => [`${row.labelSeqId}|${row.authSeqId}`, row]));
  const forward: CoordinateTranslator = {
    id: "p41.P04637-to-1TUP-chain-A",
    source: sequencePattern,
    target: structurePattern,
    async map(request, signal) {
      const target =
        request.target !== undefined && coordinateSpaceMatches(structurePattern, request.target)
          ? request.target
          : p53StructureSpace;
      return {
        translatorIds: [this.id],
        diagnostics: [],
        associations: request.loci.map((source) => {
          if (signal.aborted || !isP04637SequenceSpace(source.space))
            return { source, targets: [], status: "unmapped" as const };
          const positions =
            source.kind === "point" && source.position.kind === "index"
              ? [source.position.value]
              : source.kind === "interval"
                ? Array.from(
                    { length: source.end - source.start },
                    (_, index) => source.start + index,
                  )
                : [];
          const targets = positions.flatMap((position) => {
            const row = bySource.get(position);
            return row === undefined ? [] : [structurePoint(row, target)];
          });
          return {
            source,
            targets,
            status:
              targets.length === 0
                ? ("unmapped" as const)
                : targets.length === positions.length
                  ? ("exact" as const)
                  : ("partial" as const),
            details: {
              sourceResidues: positions.length,
              mappedResidues: targets.length,
              omittedResidues: positions.length - targets.length,
            },
          };
        }),
      };
    },
  };
  const reverse: CoordinateTranslator = {
    id: "p41.1TUP-chain-A-to-P04637",
    source: structurePattern,
    target: sequencePattern,
    async map(request, signal) {
      const target =
        request.target !== undefined && isP04637SequenceSpace(request.target)
          ? request.target
          : uniprotSequenceSpace;
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
  return Object.freeze([forward, reverse]);
};

const tp53 =
  "MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGP" +
  "DEAPRMPEAAPPVAPAPAAPTPAAPAPAPSWPLSSSVPSQKTYQGSYGFRLGFLHSGTAK" +
  "SVTCTYSPALNKMFCQLAKTCPVQLWVDSTPPPGTRVRAMAIYKQSQHMTEVVRRCPHHE" +
  "RCSDSDGLAPPQHLIRVEGNLRVEYLDDRNTFRHSVVVPYEPPEVGSDCTTIHYNYMCNS" +
  "SCMGGMNRRPILTIITLEDSSGNLLGRNSFEVRVCACPGRDRRTEEENLRKKGEPHHELP" +
  "PGSTKRALPNNTSSSPQPKKKPLDGEYFTLQIRGRERFEMFRELNEALELKDAQAGKEPG" +
  "GSRAHSSHLKSKKGQSTSRHKKLMFKTEGPDSD";

const syntheticScore = Array.from({ length: 393 }, (_, index) =>
  Number((((index * 37 + 17) % 101) / 100).toFixed(2)),
);

export const createUniProtStructureSeqViewSpec = (
  rows: readonly P04637MappingRow[],
): SeqViewSpec => {
  const coverage = rows.map((row) => row.status === "exact");
  const document: SeqViewSpec = {
    kind: "seq-view-spec",
    version: "0.1.0",
    id: "P04637-1TUP-uniprot-structure",
    metadata: {
      label: "UniProt P04637 annotations with experimental 1TUP coverage",
      description: "Offline Case 2 document; synthetic score track is explicitly labelled.",
    },
    sequences: [
      {
        id: "P04637",
        coordinateSpace: uniprotSequenceSpace.id,
        alphabet: "protein",
        residues: tp53,
        identifiers: [{ namespace: "uniprot", value: "P04637", version: "4" }],
        provenance: { label: "Checked-in UniProtKB P04637 fixture", generatedBy: "P01" },
      },
    ],
    annotations: [
      {
        id: "p53-regions",
        kind: "loci",
        semanticType: "uniprot.feature.region",
        items: [
          {
            id: "transactivation",
            value: "regulatory",
            loci: [{ kind: "interval", space: uniprotSequenceSpace.id, start: 0, end: 61 }],
          },
          {
            id: "dna-binding",
            value: "domain",
            loci: [{ kind: "interval", space: uniprotSequenceSpace.id, start: 93, end: 293 }],
          },
          {
            id: "tetramerization",
            value: "oligomerization",
            loci: [{ kind: "interval", space: uniprotSequenceSpace.id, start: 324, end: 356 }],
          },
        ],
      },
      {
        id: "p53-sites",
        kind: "loci",
        semanticType: "uniprot.feature.site",
        items: [
          {
            id: "phosphosite-S15",
            value: "modified",
            loci: [{ kind: "point", space: uniprotSequenceSpace.id, position: 14 }],
          },
          {
            id: "binding-K120",
            value: "binding",
            loci: [{ kind: "point", space: uniprotSequenceSpace.id, position: 119 }],
          },
          {
            id: "functional-R248",
            value: "functional",
            loci: [{ kind: "point", space: uniprotSequenceSpace.id, position: 247 }],
          },
        ],
      },
      {
        id: "p53-variants",
        kind: "loci",
        semanticType: "uniprot.feature.natural-variant",
        items: [
          {
            id: "variant-R175H",
            value: "pathogenic",
            loci: [{ kind: "point", space: uniprotSequenceSpace.id, position: 174 }],
          },
          {
            id: "variant-R282W",
            value: "pathogenic",
            loci: [{ kind: "point", space: uniprotSequenceSpace.id, position: 281 }],
          },
          {
            id: "variant-R337H",
            value: "pathogenic",
            loci: [{ kind: "point", space: uniprotSequenceSpace.id, position: 336 }],
          },
        ],
      },
      {
        id: "p53-synthetic-score",
        kind: "values",
        semanticType: "seqstar.synthetic.alpha-missense-like-score",
        space: uniprotSequenceSpace.id,
        valueType: "number",
        values: { encoding: "dense", data: syntheticScore },
        provenance: {
          label: "Explicitly synthetic deterministic demonstration values",
          generatedBy: "P41",
        },
      },
      {
        id: "p53-structure-coverage",
        kind: "values",
        semanticType: "structure.observed-coverage",
        space: uniprotSequenceSpace.id,
        valueType: "boolean",
        values: { encoding: "dense", data: coverage },
        provenance: {
          label: "Exact observed-coordinate status from approved mapping TSV",
          generatedBy: "P01",
        },
      },
    ],
    views: [
      {
        id: "P04637-structure-main",
        axis: {
          segments: [{ id: "P04637-axis", space: uniprotSequenceSpace.id, start: 0, end: 393 }],
          ruler: { visible: true, numbering: "one-based" },
        },
        sections: [
          {
            id: "annotations",
            tracks: [
              {
                id: "sequence",
                label: "P04637 sequence",
                layers: [
                  {
                    id: "residues",
                    representation: "sequence",
                    sequence: "P04637",
                    showLetters: true,
                  },
                ],
              },
              {
                id: "regions",
                label: "Regions and domains",
                layers: [
                  {
                    id: "region-blocks",
                    representation: "blocks",
                    annotation: "p53-regions",
                    laneMode: "stack",
                    color: {
                      kind: "categorical",
                      field: "value",
                      colors: {
                        '"regulatory"': "#F59E0B",
                        '"domain"': "#2563EB",
                        '"oligomerization"': "#7C3AED",
                      },
                      fallback: "#64748B",
                    },
                  },
                ],
              },
              {
                id: "sites",
                label: "Sites",
                layers: [
                  {
                    id: "site-markers",
                    representation: "markers",
                    annotation: "p53-sites",
                    shape: "diamond",
                    color: {
                      kind: "categorical",
                      field: "value",
                      colors: {
                        '"modified"': "#DC2626",
                        '"binding"': "#D97706",
                        '"functional"': "#7C3AED",
                      },
                      fallback: "#64748B",
                    },
                  },
                ],
              },
              {
                id: "variants",
                label: "Natural variants",
                height: 28,
                layers: [
                  {
                    id: "variant-markers",
                    representation: "markers",
                    annotation: "p53-variants",
                    shape: "diamond",
                    color: { kind: "fixed", color: "#E11D48" },
                  },
                ],
              },
              {
                id: "missense-score",
                label: "Synthetic AlphaMissense-like score",
                layers: [
                  {
                    id: "score-heatmap",
                    representation: "heatmap",
                    annotation: "p53-synthetic-score",
                    color: {
                      kind: "continuous",
                      field: "value",
                      domain: [0, 1],
                      range: ["#FEF3C7", "#991B1B"],
                      clamp: true,
                      missing: "#CBD5E1",
                    },
                  },
                ],
              },
              {
                id: "structure-coverage",
                label: "Observed 1TUP coverage",
                layers: [
                  {
                    id: "coverage-swatch",
                    representation: "swatch",
                    annotation: "p53-structure-coverage",
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
      label: "P41 offline vertical slice",
      generatedBy: "@seq-star/integration-plugins",
    },
  };
  const checked = validateSeqViewSpec(document);
  if (!checked.ok)
    throw new Error(
      `P41 SeqViewSpec invalid: ${checked.diagnostics
        .map((item) => `${item.path}: ${item.message}`)
        .join("; ")}`,
    );
  return checked.value;
};

type ItemResult = {
  readonly itemId: string;
  readonly color: string;
  readonly status: "mapped" | "partial" | "ambiguous" | "unmapped";
  readonly originalLoci: readonly CoordinateLocus[];
  /** Exact structural identity returned by the checked coordinate translator. */
  readonly selectors: readonly MvsResidueSelector[];
};
export interface UniProtMvsGeneration {
  readonly documentId: string;
  readonly viewId: string;
  readonly trackId: string;
  readonly layerId: string;
  readonly requestId: string;
  readonly mapping: readonly ItemResult[];
  readonly counts: Readonly<Record<"mapped" | "partial" | "ambiguous" | "unmapped", number>>;
  readonly document: MvsDocument;
}

const fixedTimestamp = <T extends MvsDocument>(document: T): T =>
  JSON.parse(
    JSON.stringify({
      ...document,
      metadata: { ...document.metadata, timestamp: "2026-08-19T00:00:00Z" },
    }),
  ) as T;

export const createNeutral1TupMvs = (structureUrl: string): MvsDocument => {
  const builder = MVSData.createBuilder();
  builder.canvas({ background_color: "white" });
  const structure = builder
    .download({ url: structureUrl })
    .parse({ format: "mmcif" })
    .modelStructure();
  structure
    .component({ selector: { label_entity_id: "3", label_asym_id: "C", auth_asym_id: "A" } })
    .representation({ type: "cartoon" })
    .color({ color: "#CBD5E1" });
  return fixedTimestamp(
    builder.getState({ title: "1TUP p53 chain A — neutral", description_format: "plaintext" }),
  );
};

const palette = ["#2563EB", "#DC2626", "#059669", "#7C3AED", "#D97706"] as const;
const paletteColor = (id: string): string => {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 16777619);
  return palette[(hash >>> 0) % palette.length] ?? "#2563EB";
};

const p53ChainSelector: MvsResidueSelector = Object.freeze({
  label_entity_id: "3",
  label_asym_id: "C",
  auth_asym_id: "A",
});
const SITE_ATOMIC_DETAIL_LIMIT = 16;

/**
 * Stable semantic precedence follows the authored SeqViewSpec order. The active
 * request normally has one annotation layer, but retaining all three positions
 * keeps the rule explicit if a track later acquires multiple layers.
 */
const semanticPrecedence = (
  view: SeqViewSpec["views"][number],
  trackId: string,
  layerId: string,
  itemIndex: number,
): number => {
  const tracks = view.sections.flatMap((section) => section.tracks);
  const trackIndex = tracks.findIndex((track) => track.id === trackId);
  const track = tracks[trackIndex];
  const layerIndex = track?.layers.findIndex((layer) => layer.id === layerId) ?? -1;
  if (trackIndex < 0 || layerIndex < 0)
    throw new Error(`Cannot derive SeqViewSpec precedence for '${trackId}/${layerId}'.`);
  // Explicitly leave space for a future document with many layers or dense values.
  return trackIndex * 1_000_000 + layerIndex * 10_000 + itemIndex;
};

export const generateUniProtAnnotationMvs = async (options: {
  readonly document: SeqViewSpec;
  readonly viewId: string;
  readonly trackId: string;
  readonly layerId?: string;
  readonly structureUrl: string;
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
  const view = options.document.views.find((item) => item.id === options.viewId);
  const track = view?.sections
    .flatMap((section) => section.tracks)
    .find((item) => item.id === options.trackId);
  const candidates = track?.layers.filter((layer) => "annotation" in layer) ?? [];
  const layer =
    options.layerId === undefined
      ? candidates.length === 1
        ? candidates[0]
        : undefined
      : candidates.find((item) => item.id === options.layerId);
  if (view === undefined || track === undefined || layer === undefined || !("annotation" in layer))
    throw new Error(
      `Track '${options.trackId}' does not resolve to one activatable annotation layer.`,
    );
  const annotation = options.document.annotations?.find((item) => item.id === layer.annotation);
  if (annotation === undefined || annotation.kind === "relationships")
    throw new Error(`Annotation '${layer.annotation}' is not activatable.`);
  const items =
    annotation.kind === "loci"
      ? annotation.items.map((item) => ({
          id: item.id,
          value: item.value ?? null,
          properties: item.properties,
          loci: item.loci.map((locus) =>
            locus.kind === "point"
              ? sequencePoint(locus.position)
              : locus.kind === "interval"
                ? ({ ...locus, space: uniprotSequenceSpace } as CoordinateLocus)
                : ({ ...locus, space: uniprotSequenceSpace } as CoordinateLocus),
          ),
        }))
      : annotation.values.encoding === "dense"
        ? annotation.values.data.map((value, position) => ({
            id: `${annotation.id}:${position}`,
            value,
            loci: [sequencePoint(position)],
          }))
        : annotation.values.data.map(({ position, value }) => ({
            id: `${annotation.id}:${position}`,
            value,
            loci: [sequencePoint(position)],
          }));
  const mapped: ItemResult[] = [];
  for (const item of items) {
    if (options.signal.aborted) throw new DOMException("Generation superseded", "AbortError");
    const associations = await options.translate(item.loci, options.signal);
    const targets = associations.flatMap((entry) => entry.targets);
    const selectors = targets.flatMap((target) => {
      if (
        target.kind !== "point" ||
        target.position.kind !== "label" ||
        typeof target.position.value !== "string"
      )
        return [];
      const match = /^label:(-?\d+)\|auth:(-?\d+)$/u.exec(target.position.value);
      return match === null
        ? []
        : [
            {
              label_entity_id: "3",
              label_asym_id: "C",
              auth_asym_id: "A",
              label_seq_id: Number(match[1]),
              auth_seq_id: Number(match[2]),
              ...(target.position.insertionCode === undefined
                ? {}
                : { pdbx_PDB_ins_code: target.position.insertionCode }),
            } as MvsResidueSelector,
          ];
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
        ? paletteColor(item.id)
        : evaluateColorEncoding(
            layer.color,
            item.value ?? null,
            item.id,
            "properties" in item
              ? (item.properties as
                  | Readonly<Record<string, string | number | boolean | null>>
                  | undefined)
              : undefined,
          );
    mapped.push({ itemId: item.id, color, status, originalLoci: item.loci, selectors });
  }
  const builder = MVSData.createBuilder();
  builder.canvas({ background_color: "white" });
  const structure = builder
    .download({ url: options.structureUrl })
    .parse({ format: "mmcif" })
    .modelStructure();
  const residueColors: MvsResidueColorGroup[] = mapped.flatMap((item, itemIndex) =>
    item.status === "unmapped" || item.status === "ambiguous" || item.selectors.length === 0
      ? []
      : [
          {
            semanticId: item.itemId,
            color: item.color as `#${string}`,
            precedence: semanticPrecedence(view, track.id, layer.id, itemIndex),
            selectors: item.selectors,
          },
        ],
  );
  const siteDetailSelectorCount = new Set(
    residueColors.flatMap((group) => group.selectors.map((item) => JSON.stringify(item))),
  ).size;
  if (track.id === "sites" && siteDetailSelectorCount > SITE_ATOMIC_DETAIL_LIMIT)
    throw new Error(
      `Site activation has ${String(siteDetailSelectorCount)} mapped selectors; atomic-detail limit is ${String(SITE_ATOMIC_DETAIL_LIMIT)}.`,
    );
  appendMvsCartoonPresentation(structure, [
    {
      componentSelector: p53ChainSelector,
      baseColor: "#CBD5E1",
      residueColors,
      ...(track.id === "sites"
        ? {
            atomicDetails: residueColors.map((group) => ({
              semanticId: `${group.semanticId}-site-detail`,
              color: group.color,
              selectors: group.selectors,
            })),
          }
        : {}),
    },
  ]);
  const document = fixedTimestamp(
    builder.getState({
      title: `${track.label ?? track.id} on 1TUP`,
      description:
        track.id === "sites"
          ? `Generated from ${options.document.id}; mapped site residues are colored on the cartoon and shown as bounded ball-and-stick detail; unmapped annotations are intentionally omitted.`
          : `Generated from ${options.document.id}; unmapped annotations are intentionally omitted.`,
      description_format: "plaintext",
    }),
  );
  const issues = MVSData.validationIssues(document, { noExtra: true }) ?? [];
  if (issues.length > 0) throw new Error(`Generated MVS is invalid: ${issues.join("; ")}`);
  const counts = { mapped: 0, partial: 0, ambiguous: 0, unmapped: 0 };
  for (const item of mapped) counts[item.status]++;
  return {
    documentId: options.document.id,
    viewId: view.id,
    trackId: track.id,
    layerId: layer.id,
    requestId: options.requestId,
    mapping: mapped,
    counts,
    document,
  };
};

export interface UniProtStructurePluginOptions {
  readonly sequenceComponent: string;
  readonly structureComponent: string;
  readonly mappingTsv: string;
  readonly structureUrl: string;
}

const customSchema = <T>(check: (value: unknown) => value is T) => ({
  schema: VisualizationRequestSchema,
  check,
});
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const generationSchema = customSchema<UniProtMvsGeneration>(
  (value): value is UniProtMvsGeneration =>
    isObject(value) && typeof value.requestId === "string" && isObject(value.document),
);
type ShowIntent = {
  readonly documentId: string;
  readonly viewId: string;
  readonly trackId: string;
  readonly layerId?: string;
  readonly targetComponent: string;
};
const intentSchema = customSchema<ShowIntent>(
  (value): value is ShowIntent =>
    isObject(value) &&
    typeof value.documentId === "string" &&
    typeof value.viewId === "string" &&
    typeof value.trackId === "string" &&
    typeof value.targetComponent === "string",
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

type Projection = { readonly requestId: string; readonly document: SeqViewSpec };

export class SequenceProjectionIndex {
  private readonly documents = new Map<string, SeqViewSpec>();
  private active: Projection | undefined;
  private committed: Projection | undefined;

  index(requestId: string, document: SeqViewSpec): void {
    this.documents.set(requestId, document);
  }

  lifecycle(result: {
    readonly requestId: string;
    readonly status: string;
    readonly previousView?: string;
  }): void {
    const indexed = this.documents.get(result.requestId);
    if (result.status === "accepted") {
      this.active =
        indexed === undefined ? undefined : { requestId: result.requestId, document: indexed };
      return;
    }
    if (result.status === "rendered") {
      if (this.active?.requestId === result.requestId) this.committed = this.active;
      return;
    }
    if (result.status === "failed" && this.active?.requestId === result.requestId) {
      if (result.previousView === "retained") this.active = this.committed;
      else {
        this.active = undefined;
        this.committed = undefined;
      }
      return;
    }
    if (result.status === "superseded" && this.active?.requestId === result.requestId)
      this.active = undefined;
  }

  current(): SeqViewSpec | undefined {
    return this.active?.document;
  }

  clear(): void {
    this.documents.clear();
    this.active = undefined;
    this.committed = undefined;
  }
}

export const createUniProtStructurePlugin = (
  options: UniProtStructurePluginOptions,
): HarnessPluginSpec => ({
  id: "seqstar.uniprot-mvs",
  requires: ["seqstar:format/seqviewspec", "seqstar:format/mvs"],
  provides: [
    "seqstar:integration/uniprot-mvs",
    "seqstar:translator/sequence-structure",
    "seqstar:intent/annotation-show-in-structure",
    "seqstar:generator/molviewspec-from-sequence-annotation",
  ],
  setup(context) {
    const rows = parseP04637MappingTsv(options.mappingTsv);
    const document = createUniProtStructureSeqViewSpec(rows);
    const translators = createP04637MappingTranslators(rows);
    translators.forEach((translator) => {
      context.translators.register(translator);
    });
    context.messageSchemas.register("intent.annotation.show-in-structure", "0.1.0", intentSchema);
    context.messageSchemas.register("document.generated.mvs", "0.1.0", generationSchema);
    const projections = new SequenceProjectionIndex();
    let generation = 0;
    let generationAbort: AbortController | undefined;
    context.addProcessor({
      id: "p41.uniprot-structure",
      types: [
        "visualization.seqviewspec.request",
        "lifecycle.visualization",
        "interaction.native",
        "intent.annotation.show-in-structure",
      ],
      async process(incoming, processorContext, signal) {
        if (
          incoming.type === "visualization.seqviewspec.request" &&
          incoming.target &&
          "component" in incoming.target &&
          incoming.target.component === options.sequenceComponent
        ) {
          const payload = incoming.payload as { requestId?: string; document?: unknown };
          const checked = validateSeqViewSpec(payload.document);
          if (checked.ok && payload.requestId !== undefined)
            projections.index(payload.requestId, checked.value);
          return;
        }
        if (incoming.type === "lifecycle.visualization") {
          const payload = incoming.payload as {
            componentId?: string;
            requestId?: string;
            status?: string;
            previousView?: string;
          };
          if (payload.componentId !== options.sequenceComponent || payload.requestId === undefined)
            return;
          projections.lifecycle(
            payload as {
              requestId: string;
              status: string;
              previousView?: string;
            },
          );
          return;
        }
        if (incoming.type === "interaction.native") {
          const event = incoming.payload as unknown as InteractionEvent;
          if (
            event.interaction !== "track-activate" ||
            event.phase !== "set" ||
            event.origin.componentId !== options.sequenceComponent ||
            event.origin.trackId === undefined ||
            event.origin.documentId === undefined ||
            event.origin.viewId === undefined
          )
            return;
          const intent: ShowIntent = {
            documentId: event.origin.documentId,
            viewId: event.origin.viewId,
            trackId: event.origin.trackId,
            ...(event.origin.layerId === undefined ? {} : { layerId: event.origin.layerId }),
            targetComponent: options.structureComponent,
          };
          processorContext.fabric.publish(
            message(
              "intent.annotation.show-in-structure",
              intent,
              "seqstar.uniprot-mvs",
              incoming.correlationId,
              incoming.id,
            ),
          );
          return;
        }
        if (incoming.type !== "intent.annotation.show-in-structure") return;
        const intent = incoming.payload as ShowIntent;
        const activeDocument = projections.current();
        if (
          activeDocument === undefined ||
          intent.documentId !== activeDocument.id ||
          intent.targetComponent !== options.structureComponent
        )
          return;
        generationAbort?.abort();
        const controller = new AbortController();
        generationAbort = controller;
        const current = ++generation;
        const requestId = `P41-${intent.trackId}-${current}`;
        let generated: UniProtMvsGeneration;
        try {
          generated = await generateUniProtAnnotationMvs({
            document: activeDocument,
            viewId: intent.viewId,
            trackId: intent.trackId,
            ...(intent.layerId === undefined ? {} : { layerId: intent.layerId }),
            structureUrl: options.structureUrl,
            signal: controller.signal,
            requestId,
            translate: async (loci, localSignal) =>
              (
                await processorContext.translators.map(
                  {
                    loci,
                    target: p53StructureSpace,
                    policy: { preferredTranslatorIds: [translators[0].id], maxSteps: 1 },
                  },
                  localSignal,
                )
              ).associations,
          });
        } catch (error) {
          if (controller.signal.aborted || signal.aborted) return;
          throw error;
        }
        if (signal.aborted || controller.signal.aborted || current !== generation) return;
        const published = JSON.parse(JSON.stringify(generated)) as UniProtMvsGeneration;
        processorContext.fabric.publish(
          message(
            "document.generated.mvs",
            published,
            "seqstar.uniprot-mvs",
            incoming.correlationId,
            incoming.id,
          ),
        );
        processorContext.fabric.publish(
          message(
            "visualization.mvs.request",
            { format: "mvs", requestId, mode: "replace", document: published.document },
            "seqstar.uniprot-mvs",
            incoming.correlationId,
            incoming.id,
            { component: options.structureComponent },
          ),
        );
      },
    });
    const initialRequestId = "P41-sequence-initial";
    projections.index(initialRequestId, document);
    const correlationId = crypto.randomUUID();
    context.fabric.publish(
      message(
        "visualization.seqviewspec.request",
        {
          format: "seqviewspec",
          requestId: initialRequestId,
          mode: "replace",
          document,
          viewId: "P04637-structure-main",
        },
        "seqstar.uniprot-mvs",
        correlationId,
        undefined,
        { component: options.sequenceComponent },
      ),
    );
    context.fabric.publish(
      message(
        "visualization.mvs.request",
        {
          format: "mvs",
          requestId: "P41-structure-neutral",
          mode: "replace",
          document: createNeutral1TupMvs(options.structureUrl),
        },
        "seqstar.uniprot-mvs",
        correlationId,
        undefined,
        { component: options.structureComponent },
      ),
    );
    return {
      dispose() {
        generationAbort?.abort();
        projections.clear();
      },
    };
  },
});
