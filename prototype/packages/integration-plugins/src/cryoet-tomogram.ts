import {
  type HarnessMessage,
  type HarnessPluginSpec,
  type InteractionEvent,
  type PayloadSchema,
  payloadSchema,
  VisualizationRequestSchema,
} from "@seq-star/harness-core";
import type {
  CoordinateLocus,
  CoordinateSpace,
  CoordinateSpacePattern,
  CoordinateTranslator,
  MappingAssociation,
} from "@seq-star/seq-coords";
import { coordinateSpaceEquals, coordinateSpaceMatches } from "@seq-star/seq-coords";
import { type SeqViewSpec, validateSeqViewSpec } from "@seq-star/seq-view-spec";
import { MVSData } from "molstar/lib/extensions/mvs/index.js";
import type { MVSData as MvsDocument } from "molstar/lib/extensions/mvs/mvs-data.js";

export const CRYOET_LIVE_INDEX = Object.freeze({
  dataset: { id: "DS-10493", numericId: 10493, title: "PP7 virus-like particles in E. coli" },
  run: { id: "RN-34483", numericId: 34483, name: "25oct20a_Position_10" },
  tomogram: {
    id: "TM-52425",
    numericId: 52425,
    dimensions: [1230, 1230, 480] as const,
    voxelSpacingAngstrom: 4.995,
    zarrUrl:
      "https://files.cryoetdataportal.cziscience.com/10493/25oct20a_Position_10/Reconstructions/VoxelSpacing4.995/Tomograms/100/25oct20a_Position_10.zarr",
    keyPhotoUrl:
      "https://files.cryoetdataportal.cziscience.com/10493/25oct20a_Position_10/Reconstructions/VoxelSpacing4.995/Images/100/key-photo-snapshot.png",
    portalUrl: "https://cryoetdataportal.czscience.com/datasets/10493",
  },
  particleClass: {
    id: "pp7-capsid",
    name: "PP7 virus-like particle",
    annotationId: "AN-134660",
    objectId: "UniProtKB:P03630",
    annotationUrl:
      "https://files.cryoetdataportal.cziscience.com/10493/25oct20a_Position_10/Reconstructions/VoxelSpacing4.995/Annotations/100/pseudomonas_phage_pp7_vlp-1.0_orientedpoint.ndjson",
  },
  otherLiveParticleClasses: [
    {
      id: "groel",
      name: "Chaperonin GroEL",
      annotationId: "AN-134662",
      objectId: "UniProtKB:P0A6F5",
      objectCount: 1,
      molecularBundleStatus: "missing-class-linked-average",
    },
  ],
  emdb: {
    id: "EMD-77085",
    displayRelativeIsovalue: 3.7,
    metadataUrl: "https://www.ebi.ac.uk/emdb/api/entry/EMD-77085",
    volumeUrl: "https://www.ebi.ac.uk/pdbe/densities/emd/emd-77085/cell?encoding=bcif&detail=1",
    entryUrl: "https://www.ebi.ac.uk/emdb/EMD-77085",
  },
  structure: {
    id: "1DWN",
    url: "https://www.ebi.ac.uk/pdbe/entry-files/download/1dwn_updated.cif",
    entryUrl: "https://www.ebi.ac.uk/pdbe/entry/pdb/1dwn",
    siftsUrl: "https://www.ebi.ac.uk/pdbe/api/mappings/uniprot/1dwn",
  },
  uniprot: {
    id: "P03630",
    url: "https://rest.uniprot.org/uniprotkb/P03630.json",
    entryUrl: "https://www.uniprot.org/uniprotkb/P03630/entry",
  },
} as const);

export const CRYOET_PP7_PARTICLE_SETS = Object.freeze({
  oriented: Object.freeze({
    id: "oriented",
    annotationId: "AN-134660",
    objectCount: 128,
    shape: "orientedPoint" as const,
    label: "DS-10493 · PP7 capsids · 128 oriented points",
    annotationUrl: CRYOET_LIVE_INDEX.particleClass.annotationUrl,
  }),
  points: Object.freeze({
    id: "points",
    annotationId: "AN-134661",
    objectCount: 140,
    shape: "point" as const,
    label: "DS-10493 · PP7 capsids · 140 points",
    annotationUrl:
      "https://files.cryoetdataportal.cziscience.com/10493/25oct20a_Position_10/Reconstructions/VoxelSpacing4.995/Annotations/101/pseudomonas_phage_pp7_vlp-1.0_point.ndjson",
  }),
});
export type CryoEtPp7ParticleSetId = keyof typeof CRYOET_PP7_PARTICLE_SETS;

export const pp7SequenceSpace: CoordinateSpace = Object.freeze({
  id: "uniprot-P03630-sequence",
  kind: "sequence",
  length: 128,
});

export const pp7StructureSpace: CoordinateSpace = Object.freeze({
  id: "structure-residue",
  kind: "structure-residue",
  authority: "molstar",
  context: {
    entry: "1DWN",
    entity: "1",
    "label-asym": "A",
    "auth-asym": "A",
  },
});
const pp7StructurePattern: CoordinateSpacePattern = Object.freeze({
  id: "structure-residue",
  kind: "structure-residue",
  authority: "molstar",
  context: { entry: "1DWN", entity: "1", "label-asym": "A", "auth-asym": "A" },
});

export const pp7ParticleSpace: CoordinateSpace = Object.freeze({
  id: "cryoet-AN-134660-particles",
  kind: "spatial-particle",
  length: 128,
  authority: "cryoet-data-portal",
  context: { dataset_id: "DS-10493", run_id: "RN-34483", annotation_id: "AN-134660" },
});
const pp7ParticleSpaceFor = (particleSetId: CryoEtPp7ParticleSetId): CoordinateSpace => {
  const particleSet = CRYOET_PP7_PARTICLE_SETS[particleSetId];
  return Object.freeze({
    id: `cryoet-${particleSet.annotationId}-particles`,
    kind: "spatial-particle",
    length: particleSet.objectCount,
    authority: "cryoet-data-portal",
    context: {
      dataset_id: "DS-10493",
      run_id: "RN-34483",
      annotation_id: particleSet.annotationId,
    },
  });
};

export interface CryoEtParticle {
  readonly id: string;
  readonly classId: "pp7-capsid";
  readonly location: readonly [number, number, number];
  readonly orientation?: readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ];
}

export interface CryoEtLiveMetadata {
  readonly particleSet: {
    readonly id: CryoEtPp7ParticleSetId;
    readonly annotationId: string;
    readonly shape: "orientedPoint" | "point";
    readonly label: string;
  };
  readonly emdb: {
    readonly id: "EMD-77085";
    readonly title: string;
    readonly resolutionAngstrom: number;
    readonly contourLevel: number;
    readonly contourSigma: number;
  };
  readonly structure: {
    readonly id: "1DWN";
    readonly mappedChains: readonly string[];
    readonly identity: number;
    readonly coverage: number;
    readonly representativeOnly: true;
  };
  readonly protein: {
    readonly accession: "P03630";
    readonly name: string;
    readonly organism: string;
    readonly length: 128;
  };
  readonly particleCount: number;
  readonly sources: readonly string[];
}

export interface CryoEtLiveBundle {
  readonly particles: readonly CryoEtParticle[];
  readonly metadata: CryoEtLiveMetadata;
  readonly sequenceDocument: SeqViewSpec;
  readonly densityMvs: MvsDocument;
  readonly structureMvs: MvsDocument;
  readonly structureTrackMvs: Readonly<Record<Pp7StructureTrackProfile, MvsDocument>>;
  readonly tomogramDocument: Record<string, unknown>;
}

export type Pp7StructureTrackProfile =
  | "neutral"
  | "regions"
  | "sites"
  | "mutagenesis"
  | "fit-quality";

const structureProfileByTrack: Readonly<Record<string, Pp7StructureTrackProfile>> = Object.freeze({
  "P03630-sequence": "neutral",
  "P03630-regions-track": "regions",
  "P03630-sites-track": "sites",
  "P03630-mutagenesis-track": "mutagenesis",
  "P03630-fit-quality-track": "fit-quality",
});

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type UniProtFeature = {
  readonly type: string;
  readonly description?: string;
  readonly location: {
    readonly start: { readonly value: number };
    readonly end: { readonly value: number };
  };
};
type UniProtPayload = {
  readonly primaryAccession: string;
  readonly proteinDescription: {
    readonly recommendedName: { readonly fullName: { readonly value: string } };
  };
  readonly organism: { readonly scientificName: string };
  readonly sequence: { readonly length: number; readonly value: string };
  readonly features: readonly UniProtFeature[];
};

const syntheticFitQuality = (length: number): readonly number[] =>
  Object.freeze(
    Array.from({ length }, (_, index) =>
      Number((0.35 + ((index * 47 + 11) % 66) / 100).toFixed(2)),
    ),
  );

const asRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} is not an object.`);
  return value as Record<string, unknown>;
};
const asNumber = (value: unknown, label: string): number => {
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number))
    throw new Error(`${label} is not numeric.`);
  return number;
};
const asString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} is not a string.`);
  return value;
};
const fetchJson = async (
  fetcher: FetchLike,
  url: string,
  signal: AbortSignal,
): Promise<unknown> => {
  const response = await fetcher(url, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
  return response.json();
};

export const parseCryoEtParticleNdjson = (
  source: string,
  particleSetId: CryoEtPp7ParticleSetId = "oriented",
): readonly CryoEtParticle[] => {
  const particleSet = CRYOET_PP7_PARTICLE_SETS[particleSetId];
  const result = source
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      const value = asRecord(JSON.parse(line) as unknown, `particle ${index + 1}`);
      if (value.type !== particleSet.shape)
        throw new Error(`Particle ${index + 1} is not a ${particleSet.shape}.`);
      const location = asRecord(value.location, `particle ${index + 1} location`);
      const matrix = value.xyz_rotation_matrix;
      if (
        particleSet.shape === "orientedPoint" &&
        (!Array.isArray(matrix) ||
          matrix.length !== 3 ||
          !matrix.every((row) => Array.isArray(row) && row.length === 3))
      )
        throw new Error(`Particle ${index + 1} has an invalid orientation matrix.`);
      return Object.freeze({
        id: `${particleSet.annotationId}:${String(index + 1).padStart(4, "0")}`,
        classId: "pp7-capsid" as const,
        location: Object.freeze([
          asNumber(location.x, "particle x"),
          asNumber(location.y, "particle y"),
          asNumber(location.z, "particle z"),
        ]) as readonly [number, number, number],
        ...(particleSet.shape === "orientedPoint" && Array.isArray(matrix)
          ? {
              orientation: Object.freeze(
                matrix.map((row) =>
                  Object.freeze((row as unknown[]).map((item) => asNumber(item, "orientation"))),
                ) as unknown as NonNullable<CryoEtParticle["orientation"]>,
              ),
            }
          : {}),
      });
    });
  if (result.length !== particleSet.objectCount)
    throw new Error(
      `Expected ${particleSet.objectCount} live PP7 particles, received ${result.length}.`,
    );
  return Object.freeze(result);
};

const parseUniProt = (value: unknown): UniProtPayload => {
  const payload = asRecord(value, "UniProt response") as unknown as UniProtPayload;
  if (
    payload.primaryAccession !== "P03630" ||
    payload.sequence?.length !== 128 ||
    typeof payload.sequence.value !== "string" ||
    payload.sequence.value.length !== 128 ||
    !Array.isArray(payload.features)
  )
    throw new Error("UniProt response does not describe exact P03630 sequence version.");
  return payload;
};

const featureLocus = (feature: UniProtFeature) => ({
  kind: "interval" as const,
  space: pp7SequenceSpace.id,
  start: feature.location.start.value - 1,
  end: feature.location.end.value,
});
const featurePointLocus = (feature: UniProtFeature) => ({
  kind: "point" as const,
  space: pp7SequenceSpace.id,
  position: feature.location.start.value - 1,
});

export const createPp7SeqViewSpec = (payloadValue: unknown): SeqViewSpec => {
  const payload = parseUniProt(payloadValue);
  const fitQuality = syntheticFitQuality(payload.sequence.length);
  const regions = payload.features.filter((feature) =>
    ["Chain", "Sequence conflict"].includes(feature.type),
  );
  const sites = payload.features.filter((feature) =>
    ["Binding site", "Disulfide bond"].includes(feature.type),
  );
  const mutations = payload.features.filter((feature) => feature.type === "Mutagenesis");
  const document: SeqViewSpec = {
    kind: "seq-view-spec",
    version: "0.1.0",
    id: "P03630-live-cryoet-protein",
    metadata: {
      label: `${payload.proteinDescription.recommendedName.fullName.value} (${payload.primaryAccession})`,
      description: `Live UniProt annotation for ${payload.organism.scientificName}.`,
    },
    sequences: [
      {
        id: "P03630",
        coordinateSpace: pp7SequenceSpace.id,
        alphabet: "protein",
        residues: payload.sequence.value,
        identifiers: [{ namespace: "uniprot", value: payload.primaryAccession }],
        provenance: { label: "Live UniProtKB REST response", generatedBy: "rest.uniprot.org" },
      },
    ],
    annotations: [
      {
        id: "P03630-regions",
        kind: "loci",
        semanticType: "uniprot.region",
        items: regions.map((feature, index) => ({
          id: `region-${index + 1}`,
          value: `${feature.type}: ${feature.description ?? ""}`.trim(),
          loci: [featureLocus(feature)],
        })),
      },
      {
        id: "P03630-sites",
        kind: "loci",
        semanticType: "uniprot.functional-site",
        items: sites.map((feature, index) => ({
          id: `site-${index + 1}`,
          value: `${feature.type}: ${feature.description ?? ""}`.trim(),
          loci: [featurePointLocus(feature)],
        })),
      },
      {
        id: "P03630-mutagenesis",
        kind: "loci",
        semanticType: "uniprot.mutagenesis",
        items: mutations.map((feature, index) => ({
          id: `mutagenesis-${index + 1}`,
          value: feature.description ?? "Mutagenesis",
          loci: [featurePointLocus(feature)],
        })),
      },
      {
        id: "P03630-synthetic-fit-quality",
        kind: "values",
        semanticType: "seqstar.synthetic.structure-fit-quality",
        space: pp7SequenceSpace.id,
        valueType: "number",
        values: { encoding: "dense", data: fitQuality },
        provenance: {
          label: "Explicitly synthetic deterministic fit-quality demonstration",
          generatedBy: "@seq-star/integration-plugins",
        },
      },
    ],
    views: [
      {
        id: "P03630-live-main",
        axis: {
          segments: [{ id: "P03630-axis", space: pp7SequenceSpace.id, start: 0, end: 128 }],
          ruler: { visible: true, numbering: "one-based" },
        },
        sections: [
          {
            id: "P03630-live-annotations",
            tracks: [
              {
                id: "P03630-sequence",
                label: "PP7 capsid sequence",
                layers: [
                  {
                    id: "P03630-residues",
                    representation: "sequence",
                    sequence: "P03630",
                    showLetters: true,
                  },
                ],
              },
              {
                id: "P03630-regions-track",
                label: "Protein regions",
                layers: [
                  {
                    id: "P03630-regions-layer",
                    representation: "blocks",
                    annotation: "P03630-regions",
                    color: { kind: "fixed", color: "#2563EB" },
                  },
                ],
              },
              {
                id: "P03630-sites-track",
                label: "Binding and disulfide sites",
                layers: [
                  {
                    id: "P03630-sites-layer",
                    representation: "markers",
                    annotation: "P03630-sites",
                    color: { kind: "fixed", color: "#D97706" },
                  },
                ],
              },
              {
                id: "P03630-mutagenesis-track",
                label: "Mutagenesis evidence",
                layers: [
                  {
                    id: "P03630-mutagenesis-layer",
                    representation: "markers",
                    annotation: "P03630-mutagenesis",
                    color: { kind: "fixed", color: "#E11D48" },
                  },
                ],
              },
              {
                id: "P03630-fit-quality-track",
                label: "Synthetic structure fit quality",
                layers: [
                  {
                    id: "P03630-fit-quality-layer",
                    representation: "heatmap",
                    annotation: "P03630-synthetic-fit-quality",
                    color: {
                      kind: "continuous",
                      field: "value",
                      domain: [0.35, 1],
                      range: ["#DC2626", "#059669"],
                      clamp: true,
                      missing: "#CBD5E1",
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
      label: "Live P03630 REST response",
      generatedBy: "@seq-star/integration-plugins",
    },
  };
  const checked = validateSeqViewSpec(document);
  if (!checked.ok)
    throw new Error(
      `Live P03630 SeqViewSpec is invalid: ${checked.diagnostics.map((item) => item.message).join("; ")}`,
    );
  return checked.value;
};

const fixedMvs = (document: MvsDocument): MvsDocument =>
  JSON.parse(
    JSON.stringify({
      ...document,
      metadata: { ...document.metadata, timestamp: "2026-08-20T00:00:00Z" },
    }),
  ) as MvsDocument;

export const createPp7DensityMvs = (
  title: string,
  contourLevel: number,
  displayRelativeIsovalue: number,
  depositedContourSigma: number,
): MvsDocument => {
  const builder = MVSData.createBuilder();
  builder.canvas({ background_color: "white" });
  builder
    .download({ url: CRYOET_LIVE_INDEX.emdb.volumeUrl })
    .parse({ format: "bcif" })
    // PDBe's EM BCIF contains a SERVER metadata block followed by the actual
    // density block named EM. Selecting it explicitly avoids a valid but empty
    // first-block presentation.
    .volume({ channel_id: "EM" })
    .representation({
      type: "isosurface",
      // The Volume Server resamples the deposited 288³ map at detail=1, so
      // the deposited absolute contour can exceed the resampled grid maximum.
      // Use an explicit preview sigma level instead of producing an empty,
      // yet schema-valid, absolute-isovalue surface.
      relative_isovalue: displayRelativeIsovalue,
      show_wireframe: false,
      show_faces: true,
    })
    .color({ color: "#38BDF8" })
    .opacity({ opacity: 0.38 })
    .focus();
  return fixedMvs(
    builder.getState({
      title: `${CRYOET_LIVE_INDEX.emdb.id} PP7 subtomogram average`,
      description: `${title}. Live downsampled BCIF from PDBe Volume Server displayed at ${displayRelativeIsovalue.toFixed(1)} σ; the deposited full-resolution contour is ${contourLevel} (${depositedContourSigma.toFixed(2)} σ in the original map).`,
      description_format: "plaintext",
    }),
  );
};

export const createPp7StructureMvs = (): MvsDocument => {
  const builder = MVSData.createBuilder();
  builder.canvas({ background_color: "white" });
  const structure = builder
    .download({ url: CRYOET_LIVE_INDEX.structure.url })
    .parse({ format: "mmcif" })
    .modelStructure();
  const chain = structure.component({
    selector: { label_entity_id: "1", label_asym_id: "A", auth_asym_id: "A" },
  });
  chain.representation({ type: "cartoon" }).color({ color: "#94A3B8" });
  chain.focus();
  return fixedMvs(
    builder.getState({
      title: "1DWN representative PP7 capsid chain A",
      description:
        "Representative PP7 atomic structure mapped to P03630 by live SIFTS. It is not claimed as a fitted model for EMD-77085.",
      description_format: "plaintext",
    }),
  );
};

const pp7StructureSelector = Object.freeze({
  label_entity_id: "1",
  label_asym_id: "A",
  auth_asym_id: "A",
});

const featureSelector = (feature: UniProtFeature) => {
  const begin = feature.location.start.value - 1;
  const end = feature.location.end.value - 1;
  if (begin < 1 || end < begin || end > 127) return undefined;
  return begin === end
    ? { ...pp7StructureSelector, label_seq_id: begin }
    : { ...pp7StructureSelector, beg_label_seq_id: begin, end_label_seq_id: end };
};

export const createPp7TrackStructureMvs = (
  payloadValue: unknown,
  profile: Pp7StructureTrackProfile,
): MvsDocument => {
  const payload = parseUniProt(payloadValue);
  const configuration = {
    neutral: { types: [] as readonly string[], color: "#94A3B8", detail: false },
    regions: { types: ["Chain", "Sequence conflict"], color: "#2563EB", detail: false },
    sites: { types: ["Binding site", "Disulfide bond"], color: "#D97706", detail: true },
    mutagenesis: { types: ["Mutagenesis"], color: "#E11D48", detail: true },
    "fit-quality": { types: [] as readonly string[], color: "#059669", detail: false },
  } as const satisfies Readonly<
    Record<
      Pp7StructureTrackProfile,
      { readonly types: readonly string[]; readonly color: string; readonly detail: boolean }
    >
  >;
  const selected: {
    readonly types: readonly string[];
    readonly color: `#${string}`;
    readonly detail: boolean;
  } = configuration[profile];
  const selectors = payload.features
    .filter((feature) => selected.types.includes(feature.type))
    .map(featureSelector)
    .filter((selector) => selector !== undefined);
  const builder = MVSData.createBuilder();
  builder.canvas({ background_color: "white" });
  const structure = builder
    .download({ url: CRYOET_LIVE_INDEX.structure.url })
    .parse({ format: "mmcif" })
    .modelStructure();
  const chain = structure.component({ selector: pp7StructureSelector });
  const cartoon = chain.representation({ type: "cartoon" });
  cartoon.color({ color: "#94A3B8" });
  if (profile === "fit-quality") {
    const groups = new Map<
      `#${string}`,
      Array<typeof pp7StructureSelector & { readonly label_seq_id: number }>
    >([
      ["#DC2626", []],
      ["#F59E0B", []],
      ["#059669", []],
    ]);
    syntheticFitQuality(payload.sequence.length).forEach((score, index) => {
      if (index < 1 || index > 127) return;
      const color = score < 0.57 ? "#DC2626" : score < 0.79 ? "#F59E0B" : "#059669";
      groups.get(color)?.push({ ...pp7StructureSelector, label_seq_id: index });
    });
    for (const [color, group] of groups)
      cartoon.color({
        selector: group,
        color,
      });
  } else {
    for (const selector of selectors) cartoon.color({ selector, color: selected.color });
  }
  if (selected.detail && selectors.length > 0)
    structure
      .component({ selector: selectors })
      .representation({ type: "ball_and_stick" })
      .color({ color: selected.color });
  chain.focus();
  return fixedMvs(
    builder.getState({
      title: `1DWN · ${profile === "neutral" ? "PP7 capsid" : `P03630 ${profile}`}`,
      description: `Representative 1DWN chain A colored from the live P03630 ${profile} track. The structure is not claimed as fitted to EMD-77085.`,
      description_format: "plaintext",
    }),
  );
};

const neuroglancerUrl = (): string => {
  const voxelSpacingNanometer = CRYOET_LIVE_INDEX.tomogram.voxelSpacingAngstrom / 10;
  const state = {
    dimensions: {
      x: [voxelSpacingNanometer, "nm"],
      y: [voxelSpacingNanometer, "nm"],
      z: [voxelSpacingNanometer, "nm"],
    },
    position: CRYOET_LIVE_INDEX.tomogram.dimensions.map((value) => value / 2),
    crossSectionScale: 1,
    projectionScale: 1024,
    layers: [
      {
        type: "image",
        source: `zarr://${CRYOET_LIVE_INDEX.tomogram.zarrUrl}`,
        name: "DS-10493 tomogram",
      },
    ],
    selectedLayer: { layer: "DS-10493 tomogram", visible: true },
    layout: "4panel",
  };
  return `https://neuroglancer-demo.appspot.com/#!${encodeURIComponent(JSON.stringify(state))}`;
};

const emdbMetadata = (value: unknown) => {
  const root = asRecord(value, "EMDB response");
  const admin = asRecord(root.admin, "EMDB admin");
  const determinations = asRecord(
    root.structure_determination_list,
    "EMDB determination list",
  ).structure_determination;
  const first = Array.isArray(determinations)
    ? asRecord(determinations[0], "EMDB determination")
    : asRecord(determinations, "EMDB determination");
  const processingValue = first.image_processing;
  const processing = Array.isArray(processingValue)
    ? asRecord(processingValue[0], "EMDB image processing")
    : asRecord(processingValue, "EMDB image processing");
  const reconstruction = asRecord(processing.final_reconstruction, "EMDB reconstruction");
  const resolution = asRecord(reconstruction.resolution, "EMDB resolution");
  const map = asRecord(root.map, "EMDB map");
  const contourList = asRecord(map.contour_list, "EMDB contour list").contour;
  const contour = Array.isArray(contourList)
    ? asRecord(contourList[0], "EMDB contour")
    : asRecord(contourList, "EMDB contour");
  const statistics = asRecord(map.statistics, "EMDB map statistics");
  const contourLevel = asNumber(contour.level, "EMDB contour");
  const mean = asNumber(statistics.average, "EMDB map mean");
  const standardDeviation = asNumber(statistics.std, "EMDB map standard deviation");
  if (standardDeviation <= 0) throw new Error("EMDB map standard deviation must be positive.");
  return {
    title: asString(admin.title, "EMDB title"),
    resolutionAngstrom: asNumber(resolution.valueOf_, "EMDB resolution"),
    contourLevel,
    contourSigma: (contourLevel - mean) / standardDeviation,
  };
};

const siftsMetadata = (value: unknown) => {
  const entry = asRecord(asRecord(value, "SIFTS response")["1dwn"], "SIFTS 1dwn");
  const uniprot = asRecord(asRecord(entry.UniProt, "SIFTS UniProt").P03630, "SIFTS P03630");
  if (!Array.isArray(uniprot.mappings) || uniprot.mappings.length !== 3)
    throw new Error("SIFTS P03630 must map exactly three 1DWN chains.");
  const mappings = uniprot.mappings.map((mapping) => asRecord(mapping, "SIFTS mapping"));
  return {
    mappedChains: Object.freeze(
      mappings.map((mapping) => asString(mapping.chain_id, "SIFTS chain")),
    ),
    identity: asNumber(mappings[0]?.identity, "SIFTS identity"),
    coverage: asNumber(mappings[0]?.coverage, "SIFTS coverage"),
  };
};

export const loadCryoEtLiveBundle = async (
  fetcher: FetchLike = fetch,
  signal = new AbortController().signal,
  particleSetId: CryoEtPp7ParticleSetId = "oriented",
): Promise<CryoEtLiveBundle> => {
  const particleSet = CRYOET_PP7_PARTICLE_SETS[particleSetId];
  const [particlesResponse, emdbValue, uniprotValue, siftsValue] = await Promise.all([
    fetcher(particleSet.annotationUrl, { signal }),
    fetchJson(fetcher, CRYOET_LIVE_INDEX.emdb.metadataUrl, signal),
    fetchJson(fetcher, CRYOET_LIVE_INDEX.uniprot.url, signal),
    fetchJson(fetcher, CRYOET_LIVE_INDEX.structure.siftsUrl, signal),
  ]);
  if (!particlesResponse.ok)
    throw new Error(`Particle annotation returned HTTP ${particlesResponse.status}.`);
  const particles = parseCryoEtParticleNdjson(await particlesResponse.text(), particleSetId);
  const emdb = emdbMetadata(emdbValue);
  const uniprot = parseUniProt(uniprotValue);
  const sifts = siftsMetadata(siftsValue);
  const densityMvs = createPp7DensityMvs(
    emdb.title,
    emdb.contourLevel,
    CRYOET_LIVE_INDEX.emdb.displayRelativeIsovalue,
    emdb.contourSigma,
  );
  const structureMvs = createPp7StructureMvs();
  const structureTrackMvs = Object.freeze({
    neutral: createPp7TrackStructureMvs(uniprotValue, "neutral"),
    regions: createPp7TrackStructureMvs(uniprotValue, "regions"),
    sites: createPp7TrackStructureMvs(uniprotValue, "sites"),
    mutagenesis: createPp7TrackStructureMvs(uniprotValue, "mutagenesis"),
    "fit-quality": createPp7TrackStructureMvs(uniprotValue, "fit-quality"),
  });
  return Object.freeze({
    particles,
    metadata: Object.freeze({
      particleSet: Object.freeze({
        id: particleSet.id,
        annotationId: particleSet.annotationId,
        shape: particleSet.shape,
        label: particleSet.label,
      }),
      emdb: Object.freeze({ id: "EMD-77085" as const, ...emdb }),
      structure: Object.freeze({
        id: "1DWN" as const,
        ...sifts,
        representativeOnly: true as const,
      }),
      protein: Object.freeze({
        accession: "P03630" as const,
        name: uniprot.proteinDescription.recommendedName.fullName.value,
        organism: uniprot.organism.scientificName,
        length: 128 as const,
      }),
      particleCount: particles.length,
      sources: Object.freeze([
        particleSet.annotationUrl,
        CRYOET_LIVE_INDEX.emdb.metadataUrl,
        CRYOET_LIVE_INDEX.uniprot.url,
        CRYOET_LIVE_INDEX.structure.siftsUrl,
      ]),
    }),
    sequenceDocument: createPp7SeqViewSpec(uniprotValue),
    densityMvs,
    structureMvs,
    structureTrackMvs,
    tomogramDocument: Object.freeze({
      kind: "tomogram-particle-view",
      version: "0.1.0",
      id: `DS-10493-RN-34483-PP7-${particleSet.id}`,
      title: "PP7 particles in an E. coli tomogram",
      description:
        "Live XY particle projection; z and orientation are retained per particle. The complete tomogram opens in an external read-only Neuroglancer.",
      datasetId: "DS-10493",
      runId: "RN-34483",
      tomogramId: "TM-52425",
      neuroglancerUrl: neuroglancerUrl(),
      keyPhotoUrl: CRYOET_LIVE_INDEX.tomogram.keyPhotoUrl,
      sourceUrl: CRYOET_LIVE_INDEX.tomogram.portalUrl,
      dimensions: CRYOET_LIVE_INDEX.tomogram.dimensions,
      voxelSpacingAngstrom: CRYOET_LIVE_INDEX.tomogram.voxelSpacingAngstrom,
      coordinateSpace: pp7ParticleSpaceFor(particleSetId),
      particleClass: Object.freeze({
        id: CRYOET_LIVE_INDEX.particleClass.id,
        name: CRYOET_LIVE_INDEX.particleClass.name,
        annotationId: particleSet.annotationId,
        objectId: CRYOET_LIVE_INDEX.particleClass.objectId,
      }),
      particles,
    }),
  });
};

const exactAssociation = (
  source: CoordinateLocus,
  targets: readonly CoordinateLocus[],
): MappingAssociation => ({
  source,
  targets,
  status: targets.length === 0 ? "unmapped" : "exact",
  confidence: targets.length === 0 ? 0 : 1,
});
const sequenceToStructure = (): CoordinateTranslator => ({
  id: "cryoet.P03630-to-1DWN-A",
  source: { id: pp7SequenceSpace.id, kind: "sequence" },
  target: pp7StructurePattern,
  async map(request) {
    const target =
      request.target !== undefined && coordinateSpaceMatches(pp7StructurePattern, request.target)
        ? request.target
        : pp7StructureSpace;
    return {
      translatorIds: [this.id],
      associations: request.loci.map((source) => {
        if (!coordinateSpaceEquals(source.space, pp7SequenceSpace))
          return exactAssociation(source, []);
        const positions =
          source.kind === "point" && source.position.kind === "index"
            ? [source.position.value]
            : source.kind === "interval"
              ? Array.from(
                  { length: source.end - source.start },
                  (_, index) => source.start + index,
                )
              : [];
        return exactAssociation(
          source,
          positions.flatMap((index) =>
            index < 1 || index > 127
              ? []
              : [
                  {
                    kind: "point" as const,
                    space: target,
                    position: {
                      kind: "label" as const,
                      value: `label:${index}|auth:${index}`,
                    },
                  },
                ],
          ),
        );
      }),
      diagnostics: [],
    };
  },
});
const structureToSequence = (): CoordinateTranslator => ({
  id: "cryoet.1DWN-A-to-P03630",
  source: pp7StructurePattern,
  target: { id: pp7SequenceSpace.id, kind: "sequence" },
  async map(request) {
    const target =
      request.target !== undefined && coordinateSpaceEquals(request.target, pp7SequenceSpace)
        ? request.target
        : pp7SequenceSpace;
    return {
      translatorIds: [this.id],
      associations: request.loci.map((source) => {
        const match =
          coordinateSpaceMatches(pp7StructurePattern, source.space) &&
          source.kind === "point" &&
          source.position.kind === "label" &&
          typeof source.position.value === "string"
            ? /^label:(-?\d+)\|auth:(-?\d+)$/u.exec(source.position.value)
            : null;
        const label = match === null ? undefined : Number(match[1]);
        const auth = match === null ? undefined : Number(match[2]);
        return exactAssociation(
          source,
          label === undefined || auth !== label || label < 1 || label > 127
            ? []
            : [{ kind: "point", space: target, position: { kind: "index", value: label } }],
        );
      }),
      diagnostics: [],
    };
  },
});

export const createPp7StructureTranslators = (): readonly CoordinateTranslator[] =>
  Object.freeze([sequenceToStructure(), structureToSequence()]);

export interface CryoEtTomogramPluginOptions {
  readonly tomogramComponent: string;
  readonly sequenceComponent: string;
  readonly structureComponent: string;
  readonly particleSetId?: CryoEtPp7ParticleSetId;
  readonly fetcher?: FetchLike;
}
export interface CryoEtPresentationIntent {
  readonly view: "density" | "structure";
}

const objectSchema = (
  properties: Readonly<Record<string, unknown>>,
  required: readonly string[],
) => ({ type: "object", properties, required, additionalProperties: false });
const checkedSchema = <T>(schema: Readonly<Record<string, unknown>>): PayloadSchema<T> =>
  payloadSchema(schema as never);
export const CryoEtPresentationIntentSchema = checkedSchema<CryoEtPresentationIntent>(
  objectSchema({ view: { anyOf: [{ const: "density" }, { const: "structure" }] } }, ["view"]),
);
export const CryoEtReadySchema = checkedSchema<CryoEtLiveMetadata>(
  objectSchema(
    {
      particleSet: objectSchema(
        {
          id: { anyOf: [{ const: "oriented" }, { const: "points" }] },
          annotationId: { type: "string", minLength: 1 },
          shape: { anyOf: [{ const: "orientedPoint" }, { const: "point" }] },
          label: { type: "string", minLength: 1 },
        },
        ["id", "annotationId", "shape", "label"],
      ),
      emdb: objectSchema(
        {
          id: { const: "EMD-77085" },
          title: { type: "string", minLength: 1 },
          resolutionAngstrom: { type: "number", exclusiveMinimum: 0 },
          contourLevel: { type: "number" },
          contourSigma: { type: "number", exclusiveMinimum: 0 },
        },
        ["id", "title", "resolutionAngstrom", "contourLevel", "contourSigma"],
      ),
      structure: objectSchema(
        {
          id: { const: "1DWN" },
          mappedChains: {
            type: "array",
            items: { type: "string", minLength: 1 },
            minItems: 1,
            uniqueItems: true,
          },
          identity: { type: "number", minimum: 0, maximum: 1 },
          coverage: { type: "number", minimum: 0, maximum: 1 },
          representativeOnly: { const: true },
        },
        ["id", "mappedChains", "identity", "coverage", "representativeOnly"],
      ),
      protein: objectSchema(
        {
          accession: { const: "P03630" },
          name: { type: "string", minLength: 1 },
          organism: { type: "string", minLength: 1 },
          length: { const: 128 },
        },
        ["accession", "name", "organism", "length"],
      ),
      particleCount: { type: "integer", minimum: 1 },
      sources: {
        type: "array",
        items: { type: "string", minLength: 1 },
        minItems: 4,
        uniqueItems: true,
      },
    },
    ["particleSet", "emdb", "structure", "protein", "particleCount", "sources"],
  ),
);
export const CryoEtParticleSelectionSchema = checkedSchema<{
  readonly particleId: string;
  readonly index: number;
  readonly location: readonly number[];
  readonly classId: string;
}>(
  objectSchema(
    {
      particleId: { type: "string", minLength: 1 },
      index: { type: "integer", minimum: 0 },
      location: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 },
      classId: { type: "string", minLength: 1 },
    },
    ["particleId", "index", "location", "classId"],
  ),
);

const envelope = (
  type: string,
  payload: unknown,
  correlationId: HarnessMessage["correlationId"],
  target?: string,
  causationId?: HarnessMessage["id"],
): HarnessMessage => ({
  id: crypto.randomUUID(),
  type,
  version: "0.1.0",
  source: { plugin: "seqstar.cryoet-tomogram" },
  ...(target === undefined ? {} : { target: { component: target } }),
  correlationId,
  ...(causationId === undefined ? {} : { causationId }),
  timestamp: new Date().toISOString(),
  payload: payload as never,
});

export const createCryoEtTomogramPlugin = (
  options: CryoEtTomogramPluginOptions,
): HarnessPluginSpec => ({
  id: "seqstar.cryoet-tomogram",
  requires: [
    "seqstar:format/tomogram-particle-view",
    "seqstar:format/seqviewspec",
    "seqstar:format/mvs",
  ],
  provides: ["seqstar:integration/cryoet-live", "seqstar:translator/sequence-structure"],
  setup(context) {
    const controller = new AbortController();
    const disposables = [
      context.messageSchemas.register(
        "visualization.tomogram.request",
        "0.1.0",
        payloadSchema(VisualizationRequestSchema),
      ),
      context.messageSchemas.register(
        "intent.cryoet.presentation.select",
        "0.1.0",
        CryoEtPresentationIntentSchema,
      ),
      context.messageSchemas.register("cryoet.data.ready", "0.1.0", CryoEtReadySchema),
      context.messageSchemas.register(
        "cryoet.particle.selected",
        "0.1.0",
        CryoEtParticleSelectionSchema,
      ),
      ...createPp7StructureTranslators().map((translator) =>
        context.translators.register(translator),
      ),
    ];
    let bundle: CryoEtLiveBundle | undefined;
    let presentation: "density" | "structure" = "density";
    let generation = 0;
    const publishMvs = (
      view: "density" | "structure",
      correlationId: HarnessMessage["correlationId"] = crypto.randomUUID(),
      causationId?: HarnessMessage["id"],
      profile?: Pp7StructureTrackProfile,
    ) => {
      if (bundle === undefined) return;
      presentation = view;
      const requestId = `cryoet-${view}${profile === undefined ? "" : `-${profile}`}-${++generation}`;
      context.fabric.publish(
        envelope(
          "visualization.mvs.request",
          {
            format: "mvs",
            requestId,
            mode: "replace",
            document:
              view === "density"
                ? bundle.densityMvs
                : profile === undefined
                  ? bundle.structureMvs
                  : bundle.structureTrackMvs[profile],
          },
          correlationId,
          options.structureComponent,
          causationId,
        ),
      );
    };
    const processor = context.addProcessor({
      id: "cryoet-live-intents",
      types: ["intent.cryoet.presentation.select", "interaction.native"],
      process(message) {
        if (message.type === "intent.cryoet.presentation.select") {
          publishMvs(
            (message.payload as unknown as CryoEtPresentationIntent).view,
            message.correlationId,
            message.id,
          );
          return;
        }
        const event = message.payload as unknown as InteractionEvent;
        const profile =
          event.origin.trackId === undefined
            ? undefined
            : structureProfileByTrack[event.origin.trackId];
        if (
          event.interaction === "track-activate" &&
          event.phase === "set" &&
          event.origin.componentId === options.sequenceComponent &&
          event.origin.documentId === "P03630-live-cryoet-protein" &&
          event.origin.viewId === "P03630-live-main" &&
          profile !== undefined
        ) {
          publishMvs("structure", message.correlationId, message.id, profile);
          return;
        }
        if (
          message.source.component !== options.tomogramComponent ||
          event.interaction !== "select" ||
          event.phase !== "set" ||
          bundle === undefined
        )
          return;
        const locus = event.loci[0];
        const index =
          locus?.kind === "point" && locus.position.kind === "index" ? locus.position.value : -1;
        const particle = bundle.particles[index];
        if (particle === undefined) return;
        context.fabric.publish(
          envelope(
            "cryoet.particle.selected",
            {
              particleId: particle.id,
              index,
              location: particle.location,
              classId: particle.classId,
            },
            message.correlationId,
            undefined,
            message.id,
          ),
        );
        if (presentation !== "density") publishMvs("density", message.correlationId, message.id);
      },
    });
    disposables.push(processor);
    void loadCryoEtLiveBundle(
      options.fetcher,
      controller.signal,
      options.particleSetId ?? "oriented",
    ).then(
      (loaded) => {
        if (controller.signal.aborted) return;
        bundle = loaded;
        const correlationId = crypto.randomUUID();
        context.fabric.publish(envelope("cryoet.data.ready", loaded.metadata, correlationId));
        context.fabric.publish(
          envelope(
            "visualization.tomogram.request",
            {
              format: "tomogram-particle-view",
              requestId: "cryoet-tomogram-initial",
              mode: "replace",
              document: loaded.tomogramDocument,
            },
            correlationId,
            options.tomogramComponent,
          ),
        );
        context.fabric.publish(
          envelope(
            "visualization.seqviewspec.request",
            {
              format: "seqviewspec",
              requestId: "cryoet-sequence-initial",
              mode: "replace",
              document: loaded.sequenceDocument,
              viewId: "P03630-live-main",
            },
            correlationId,
            options.sequenceComponent,
          ),
        );
        publishMvs("density", correlationId);
      },
      (reason: unknown) => {
        if (controller.signal.aborted) return;
        context.fabric.publish(
          envelope(
            "harness.diagnostic",
            {
              diagnostics: [
                {
                  code: "cryoet.live-data.failed",
                  severity: "error",
                  message:
                    reason instanceof Error ? reason.message : "Live cryo-ET data loading failed.",
                },
              ],
            },
            crypto.randomUUID(),
          ),
        );
      },
    );
    return {
      dispose() {
        controller.abort();
        for (const disposable of disposables.reverse()) disposable.dispose();
        bundle = undefined;
      },
    };
  },
});
