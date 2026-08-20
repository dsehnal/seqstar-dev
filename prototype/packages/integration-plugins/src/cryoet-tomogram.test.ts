import { MVSData } from "molstar/lib/extensions/mvs/index.js";
import { describe, expect, it } from "vitest";
import {
  CRYOET_LIVE_INDEX,
  CryoEtReadySchema,
  createPp7DensityMvs,
  createPp7SeqViewSpec,
  createPp7StructureMvs,
  createPp7StructureTranslators,
  createPp7TrackStructureMvs,
  loadCryoEtLiveBundle,
  parseCryoEtParticleNdjson,
  pp7SequenceSpace,
} from "./cryoet-tomogram.js";
import {
  countMvsRepresentationTypes,
  countMvsTreeNodes,
  queryMvsTree,
} from "./mvs-presentation.js";

const particles = Array.from({ length: 128 }, (_, index) =>
  JSON.stringify({
    type: "orientedPoint",
    location: { x: index + 0.25, y: index + 0.5, z: index + 0.75 },
    xyz_rotation_matrix: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
  }),
).join("\n");

const uniprot = {
  primaryAccession: "P03630",
  proteinDescription: { recommendedName: { fullName: { value: "Capsid protein" } } },
  organism: { scientificName: "Pseudomonas phage PP7" },
  sequence: {
    length: 128,
    value:
      "MSKTIVLSVGEATRTLTEIQSTADRQIFEEKVGPLVGRLRLTASLRQNGAKTAYRVNLKLDQADVVDCSTSVCGELPKVRYTQVWSHDVTIVANSTEASRKSLYDLTKSLVATSQVEDLVVNLVPLGR",
  },
  features: [
    {
      type: "Chain",
      description: "Capsid protein",
      location: { start: { value: 2 }, end: { value: 127 } },
    },
    {
      type: "Binding site",
      description: "",
      location: { start: { value: 40 }, end: { value: 40 } },
    },
    {
      type: "Disulfide bond",
      description: "Interchain",
      location: { start: { value: 68 }, end: { value: 68 } },
    },
    {
      type: "Mutagenesis",
      description: "Loss of activity",
      location: { start: { value: 46 }, end: { value: 46 } },
    },
  ],
};
const emdb = {
  admin: { title: "Live PP7 average" },
  structure_determination_list: {
    structure_determination: [
      { image_processing: [{ final_reconstruction: { resolution: { valueOf_: "3.0" } } }] },
    ],
  },
  map: {
    contour_list: { contour: [{ level: 0.0231 }] },
    statistics: { average: 0, std: 0.0046222196 },
  },
};
const sifts = {
  "1dwn": {
    UniProt: {
      P03630: {
        mappings: ["A", "B", "C"].map((chain_id) => ({ chain_id, identity: 1, coverage: 0.992 })),
      },
    },
  },
};

describe("live cryo-ET adapters", () => {
  it("parses exactly 128 oriented points with stable line-derived identities", () => {
    const parsed = parseCryoEtParticleNdjson(particles);
    expect(parsed).toHaveLength(128);
    expect(parsed[0]).toMatchObject({
      id: "AN-134660:0001",
      classId: "pp7-capsid",
      location: [0.25, 0.5, 0.75],
    });
    expect(parsed[127]?.id).toBe("AN-134660:0128");
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it("builds the live UniProt tracks and the two honest MolViewSpec presentations", () => {
    const sequence = createPp7SeqViewSpec(uniprot);
    expect(sequence.sequences[0]?.residues).toHaveLength(128);
    expect(sequence.views[0]?.sections[0]?.tracks.map((track) => track.id)).toEqual([
      "P03630-sequence",
      "P03630-regions-track",
      "P03630-sites-track",
      "P03630-mutagenesis-track",
    ]);
    const density = createPp7DensityMvs("Live PP7 average", 0.0231, 3.7, 4.9976);
    const structure = createPp7StructureMvs();
    expect(MVSData.validationIssues(density, { noExtra: true })).toBeUndefined();
    expect(MVSData.validationIssues(structure, { noExtra: true })).toBeUndefined();
    expect(countMvsTreeNodes(density)).toMatchObject({ download: 1, parse: 1, volume: 1 });
    expect(countMvsTreeNodes(density)).toMatchObject({ volume_representation: 1 });
    expect(JSON.stringify(density)).toContain('"channel_id":"EM"');
    expect(JSON.stringify(density)).toContain('"relative_isovalue":3.7');
    expect(JSON.stringify(density)).not.toContain("absolute_isovalue");
    expect(JSON.stringify(density)).toContain("deposited full-resolution contour");
    expect(countMvsRepresentationTypes(structure)).toEqual({ cartoon: 1 });
    expect(JSON.stringify(structure)).toContain("not claimed as a fitted model");
  });

  it("turns each sequence track into an exact, bounded structure presentation", () => {
    const neutral = createPp7TrackStructureMvs(uniprot, "neutral");
    const regions = createPp7TrackStructureMvs(uniprot, "regions");
    const sites = createPp7TrackStructureMvs(uniprot, "sites");
    const mutagenesis = createPp7TrackStructureMvs(uniprot, "mutagenesis");
    for (const document of [neutral, regions, sites, mutagenesis]) {
      expect(MVSData.validationIssues(document, { noExtra: true })).toBeUndefined();
      expect(countMvsRepresentationTypes(document).cartoon).toBe(1);
    }
    expect(countMvsRepresentationTypes(neutral)).toEqual({ cartoon: 1 });
    expect(countMvsRepresentationTypes(regions)).toEqual({ cartoon: 1 });
    expect(countMvsRepresentationTypes(sites)).toEqual({ ball_and_stick: 1, cartoon: 1 });
    expect(countMvsRepresentationTypes(mutagenesis)).toEqual({
      ball_and_stick: 1,
      cartoon: 1,
    });
    expect(JSON.stringify(queryMvsTree(regions, "color"))).toContain('"beg_label_seq_id":1');
    expect(JSON.stringify(queryMvsTree(regions, "color"))).toContain('"color":"#2563EB"');
    expect(JSON.stringify(queryMvsTree(sites, "component"))).toContain('"label_seq_id":39');
    expect(JSON.stringify(queryMvsTree(sites, "component"))).toContain('"label_seq_id":67');
    expect(JSON.stringify(queryMvsTree(sites, "color"))).toContain('"color":"#D97706"');
    expect(JSON.stringify(queryMvsTree(mutagenesis, "component"))).toContain('"label_seq_id":45');
    expect(JSON.stringify(queryMvsTree(mutagenesis, "color"))).toContain('"color":"#E11D48"');
  });

  it("loads every scientific record from its official live URL while keeping only the join index local", async () => {
    const calls: string[] = [];
    const values = new Map<string, BodyInit>([
      [CRYOET_LIVE_INDEX.particleClass.annotationUrl, particles],
      [CRYOET_LIVE_INDEX.emdb.metadataUrl, JSON.stringify(emdb)],
      [CRYOET_LIVE_INDEX.uniprot.url, JSON.stringify(uniprot)],
      [CRYOET_LIVE_INDEX.structure.siftsUrl, JSON.stringify(sifts)],
    ]);
    const fetcher = async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      const body = values.get(url);
      return new Response(body ?? "missing", { status: body === undefined ? 404 : 200 });
    };
    const bundle = await loadCryoEtLiveBundle(fetcher);
    expect(calls).toEqual([
      CRYOET_LIVE_INDEX.particleClass.annotationUrl,
      CRYOET_LIVE_INDEX.emdb.metadataUrl,
      CRYOET_LIVE_INDEX.uniprot.url,
      CRYOET_LIVE_INDEX.structure.siftsUrl,
    ]);
    expect(bundle.metadata).toMatchObject({
      emdb: {
        id: "EMD-77085",
        resolutionAngstrom: 3,
        contourLevel: 0.0231,
      },
      structure: { id: "1DWN", mappedChains: ["A", "B", "C"], representativeOnly: true },
      protein: { accession: "P03630", length: 128 },
      particleCount: 128,
    });
    expect(bundle.metadata.emdb.contourSigma).toBeCloseTo(4.997599, 6);
    expect(bundle.tomogramDocument).toMatchObject({
      datasetId: "DS-10493",
      runId: "RN-34483",
      tomogramId: "TM-52425",
      coordinateSpace: { id: "cryoet-AN-134660-particles", length: 128 },
    });
    const neuroglancerState = JSON.parse(
      decodeURIComponent(String(bundle.tomogramDocument.neuroglancerUrl).split("#!")[1] ?? ""),
    ) as { dimensions: { x: [number, string] } };
    expect(neuroglancerState.dimensions.x).toEqual([0.4995, "nm"]);
  });

  it("fails closed when a live particle response is incomplete", () => {
    expect(() => parseCryoEtParticleNdjson(particles.split("\n").slice(0, 127).join("\n"))).toThrow(
      "Expected 128 live PP7 particles",
    );
  });

  it("rejects incomplete or misleading public live-data summaries", () => {
    expect(
      CryoEtReadySchema.check({
        emdb: { id: "EMD-77085" },
        structure: { id: "1DWN" },
        protein: { accession: "P03630", length: 128 },
        particleCount: 128,
        sources: ["a", "b", "c", "d"],
      }),
    ).toBe(false);
  });

  it("preserves the actual Molstar generation target in both mapping directions", async () => {
    const [forward, reverse] = createPp7StructureTranslators();
    if (forward === undefined || reverse === undefined)
      throw new Error("Expected two translators.");
    const dynamicStructure = {
      id: "structure-residue",
      kind: "structure-residue",
      authority: "pdb",
      context: {
        entry_id: "1DWN",
        entity_id: "1",
        label_asym_id: "A",
        auth_asym_id: "A",
        model_id: "model-1",
        unit_id: "unit-7",
      },
    } as const;
    const mapped = await forward.map(
      {
        loci: [
          {
            kind: "point",
            space: pp7SequenceSpace,
            position: { kind: "index", value: 39 },
          },
        ],
        target: dynamicStructure,
      },
      new AbortController().signal,
    );
    expect(mapped.associations[0]?.targets[0]).toMatchObject({
      space: dynamicStructure,
      position: { kind: "label", value: 39 },
    });
    const roundTrip = await reverse.map(
      { loci: mapped.associations[0]?.targets ?? [], target: pp7SequenceSpace },
      new AbortController().signal,
    );
    expect(roundTrip.associations[0]?.targets[0]).toEqual({
      kind: "point",
      space: pp7SequenceSpace,
      position: { kind: "index", value: 39 },
    });
  });
});
