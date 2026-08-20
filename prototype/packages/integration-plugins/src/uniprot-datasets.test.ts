import {
  type ComponentFactory,
  createApplicationHarness,
  createTranslatorRegistry,
  type HarnessMessage,
} from "@seq-star/harness-core";
import { validateSeqViewSpec } from "@seq-star/seq-view-spec";
import { MVSData } from "molstar/lib/extensions/mvs/index.js";
import { describe, expect, it } from "vitest";
import alignmentAfa from "../../../fixtures/alignment-structure/expected/PF00042.29-32rows.query-centric.afa?raw";
import p69905Fasta from "../../../fixtures/alignment-structure/input/P69905.fasta?raw";
import p69905MappingTsv from "../../../fixtures/alignment-structure/mappings/P69905-1A3N-chain-A.tsv?raw";
import alignmentMappingTsv from "../../../fixtures/alignment-structure/mappings/P69905-PF00042-1A3N-chain-A.tsv?raw";
import confidenceTsv from "../../../fixtures/complex/expected/synthetic-confidence.tsv?raw";
import p00648Fasta from "../../../fixtures/complex/input/P00648.fasta?raw";
import contactsTsv from "../../../fixtures/complex/mappings/1BRS-chain-A-D-heavy-atom-contacts.tsv?raw";
import p00648MappingTsv from "../../../fixtures/complex/mappings/P00648-1BRS-chain-A.tsv?raw";
import p04637MappingTsv from "../../../fixtures/uniprot-structure/mappings/P04637-1TUP-chain-A.tsv?raw";
import {
  countMvsRepresentationTypes,
  countMvsTreeNodes,
  queryMvsTree,
} from "./mvs-presentation.js";
import {
  createUniProtDatasetCatalog,
  createUniProtDatasetsPlugin,
  createUniProtDatasetTranslators,
  DatasetSelectIntentPayloadSchema,
  DatasetStatusPayloadSchema,
  generateDatasetAnnotationMvs,
  ShowAnnotationIntentPayloadSchema,
  type UniProtDatasetAssetBundle,
  UniProtDatasetCatalogPayloadSchema,
  type UniProtDatasetDefinition,
  type UniProtDatasetId,
  UniProtMvsGenerationPayloadSchema,
} from "./uniprot-datasets.js";

const assets: UniProtDatasetAssetBundle = {
  p04637: { mappingTsv: p04637MappingTsv, structureUrl: "/fixtures/1TUP.cif" },
  p69905: {
    alignmentAfa,
    p69905Fasta,
    alignmentMappingTsv,
    structureMappingTsv: p69905MappingTsv,
    structureUrl: "/fixtures/1A3N.cif",
  },
  p00648: {
    p00648Fasta,
    mappingTsv: p00648MappingTsv,
    contactsTsv,
    confidenceTsv,
    structureUrl: "/fixtures/1BRS.cif",
  },
};

const catalog = createUniProtDatasetCatalog(assets);
const translators = createUniProtDatasetTranslators(assets);
const requireDataset = (id: UniProtDatasetId): UniProtDatasetDefinition => {
  const found = catalog.datasets.find((item) => item.id === id);
  if (found === undefined) throw new Error(`Missing test dataset '${id}'.`);
  return found;
};

const representativeTrack: Readonly<
  Record<UniProtDatasetId, { readonly trackId: string; readonly layerId: string }>
> = {
  "P04637-1TUP": { trackId: "sites", layerId: "site-markers" },
  "P69905-1A3N": { trackId: "alignment-conservation", layerId: "conservation-heatmap" },
  "P00648-1BRS-A": { trackId: "interface-residues", layerId: "interface-markers" },
};

describe("H20 offline UniProt/structure dataset catalog", () => {
  it("exposes truthful TypeBox payload schemas and rejects malformed or non-JSON values", () => {
    expect(DatasetSelectIntentPayloadSchema.check({ datasetId: "P04637-1TUP" })).toBe(true);
    expect(
      DatasetStatusPayloadSchema.check({
        datasetId: "P69905-1A3N",
        previousDatasetId: "P04637-1TUP",
        generation: 2,
        status: "active",
        sequenceRequestId: "sequence-2",
        structureRequestId: "structure-2",
      }),
    ).toBe(true);
    expect(
      DatasetStatusPayloadSchema.check({
        datasetId: "P04637-1TUP",
        generation: 1,
        status: "switching",
        sequenceRequestId: "sequence-1",
        structureRequestId: "structure-1",
      }),
    ).toBe(true);
    expect(
      ShowAnnotationIntentPayloadSchema.check({
        documentId: "document",
        viewId: "view",
        trackId: "track",
        layerId: "layer",
        targetComponent: "structure",
      }),
    ).toBe(true);
    expect(
      ShowAnnotationIntentPayloadSchema.check({
        documentId: "document",
        viewId: "view",
        trackId: "track",
        targetComponent: "structure",
      }),
    ).toBe(true);
    expect(UniProtDatasetCatalogPayloadSchema.check(catalog)).toBe(true);

    expect(DatasetSelectIntentPayloadSchema.schema).toMatchObject({
      type: "object",
      properties: { datasetId: expect.any(Object) },
      required: ["datasetId"],
      additionalProperties: false,
    });
    expect(DatasetSelectIntentPayloadSchema.schema).not.toHaveProperty("properties.format");
    expect(DatasetSelectIntentPayloadSchema.check({ datasetId: "unknown" })).toBe(false);
    expect(DatasetSelectIntentPayloadSchema.check({ datasetId: "P04637-1TUP", extra: true })).toBe(
      false,
    );
    expect(
      DatasetStatusPayloadSchema.check({
        datasetId: "P04637-1TUP",
        previousDatasetId: "unknown",
        generation: 0,
        status: "ready",
        sequenceRequestId: "",
        structureRequestId: "",
      }),
    ).toBe(false);
    expect(
      ShowAnnotationIntentPayloadSchema.check({
        documentId: "document",
        viewId: "view",
        trackId: "track",
      }),
    ).toBe(false);
    expect(
      ShowAnnotationIntentPayloadSchema.check({
        documentId: "document",
        viewId: "view",
        trackId: "track",
        layerId: "",
        targetComponent: "structure",
      }),
    ).toBe(false);
    expect(
      UniProtDatasetCatalogPayloadSchema.check({
        ...catalog,
        datasets: [{ ...catalog.datasets[0], neutralMvs: { invalid: () => undefined } }],
      }),
    ).toBe(false);
    expect(
      UniProtMvsGenerationPayloadSchema.check({
        documentId: "document",
        viewId: "view",
        trackId: "track",
        layerId: "layer",
        requestId: "request",
        mapping: [],
        counts: { mapped: 0, partial: 0, ambiguous: 0, unmapped: 0 },
        document: { invalid: () => undefined },
      }),
    ).toBe(false);
  });

  it("builds three detached JSON-safe immutable datasets with distinct tracks and provenance", () => {
    expect(catalog.initialDatasetId).toBe("P04637-1TUP");
    expect(catalog.datasets.map((item) => item.id)).toEqual([
      "P04637-1TUP",
      "P69905-1A3N",
      "P00648-1BRS-A",
    ]);
    expect(JSON.parse(JSON.stringify(catalog))).toEqual(catalog);
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(catalog.datasets)).toBe(true);
    for (const item of catalog.datasets) {
      expect(Object.isFrozen(item)).toBe(true);
      expect(Object.isFrozen(item.seqViewSpec)).toBe(true);
      expect(item.provenance.length).toBeGreaterThanOrEqual(3);
      expect(item.trackIds).toContain("sequence");
      expect(item.trackIds.length).toBeGreaterThanOrEqual(4);
      expect(validateSeqViewSpec(item.seqViewSpec).ok).toBe(true);
      expect(MVSData.validationIssues(item.neutralMvs, { noExtra: true })).toBeUndefined();
      expect(countMvsTreeNodes(item.neutralMvs)).toMatchObject({
        download: 1,
        parse: 1,
        structure: 1,
        component: 1,
        representation: 1,
      });
      expect(countMvsRepresentationTypes(item.neutralMvs)).toEqual({ cartoon: 1 });
    }
    expect(requireDataset("P04637-1TUP").trackIds).toEqual([
      "sequence",
      "regions",
      "sites",
      "variants",
      "missense-score",
      "structure-coverage",
    ]);
    expect(requireDataset("P69905-1A3N").trackIds).toEqual([
      "sequence",
      "alignment-conservation",
      "alignment-gaps",
      "structure-coverage",
    ]);
    expect(requireDataset("P00648-1BRS-A").trackIds).toEqual([
      "sequence",
      "processing",
      "interface-residues",
      "synthetic-confidence",
      "structure-coverage",
    ]);
    expect(new Set(catalog.datasets.map((item) => JSON.stringify(item.trackIds))).size).toBe(3);
  });

  it("maps both directions through one exact, disjoint translator pair per dataset", async () => {
    const positions: Readonly<Record<UniProtDatasetId, number>> = {
      "P04637-1TUP": 119,
      "P69905-1A3N": 1,
      "P00648-1BRS-A": 73,
    };
    expect(translators).toHaveLength(3);
    expect(new Set(translators.flatMap((item) => [item.forward.id, item.reverse.id])).size).toBe(6);
    const registry = createTranslatorRegistry();
    for (const pair of translators) {
      registry.register(pair.forward);
      registry.register(pair.reverse);
    }
    for (const pair of translators) {
      const item = requireDataset(pair.datasetId);
      expect(pair.forward.source).toEqual({ id: item.sequenceSpace.id, kind: "sequence" });
      expect(pair.reverse.target).toEqual({ id: item.sequenceSpace.id, kind: "sequence" });
      expect(registry.findPaths(item.sequenceSpace, item.structureSpace)).toHaveLength(1);
      expect(registry.findPaths(item.structureSpace, item.sequenceSpace)).toHaveLength(1);
      const signal = new AbortController().signal;
      const source = {
        kind: "point",
        space: item.sequenceSpace,
        position: { kind: "index", value: positions[pair.datasetId] },
      } as const;
      const forward = await pair.forward.map(
        { loci: [source], target: item.structureSpace },
        signal,
      );
      expect(forward.associations[0]?.status).toBe("exact");
      expect(forward.associations[0]?.targets).toHaveLength(1);
      const reverse = await pair.reverse.map(
        { loci: forward.associations[0]?.targets ?? [], target: item.sequenceSpace },
        signal,
      );
      expect(reverse.associations[0]?.status).toBe("exact");
      expect(reverse.associations[0]?.targets).toEqual([source]);
    }
  });

  it("validates representative activated MVS profiles and exact selectors for all datasets", async () => {
    const expectedMapped: Readonly<Record<UniProtDatasetId, number>> = {
      "P04637-1TUP": 2,
      "P69905-1A3N": 111,
      "P00648-1BRS-A": 19,
    };
    const expectedTree: Readonly<
      Record<UniProtDatasetId, { readonly component: number; readonly representation: number }>
    > = {
      "P04637-1TUP": { component: 3, representation: 3 },
      "P69905-1A3N": { component: 1, representation: 1 },
      "P00648-1BRS-A": { component: 2, representation: 2 },
    };
    for (const pair of translators) {
      const item = requireDataset(pair.datasetId);
      const representative = representativeTrack[pair.datasetId];
      const generated = await generateDatasetAnnotationMvs({
        dataset: item,
        ...representative,
        requestId: `representative-${pair.datasetId}`,
        signal: new AbortController().signal,
        translate: async (loci, signal) =>
          (await pair.forward.map({ loci, target: item.structureSpace }, signal)).associations,
      });
      expect(MVSData.validationIssues(generated.document, { noExtra: true })).toBeUndefined();
      expect(UniProtMvsGenerationPayloadSchema.check(generated)).toBe(true);
      if (pair.datasetId === "P04637-1TUP") {
        const rgba = JSON.parse(JSON.stringify(generated)) as {
          mapping: Array<{ color: string }>;
        };
        const first = rgba.mapping[0];
        if (first === undefined) throw new Error("Expected a mapped P04637 item.");
        for (const color of ["#123456", "#12345678"]) {
          first.color = color;
          expect(UniProtMvsGenerationPayloadSchema.check(rgba)).toBe(true);
        }
        for (const color of ["#12345", "#1234567", "#123456789"]) {
          first.color = color;
          expect(UniProtMvsGenerationPayloadSchema.check(rgba)).toBe(false);
        }
      }
      expect(countMvsTreeNodes(generated.document)).toMatchObject({
        download: 1,
        parse: 1,
        structure: 1,
        ...expectedTree[pair.datasetId],
      });
      expect(generated.counts.mapped).toBe(expectedMapped[pair.datasetId]);
      const selectors = generated.mapping.flatMap((mapping) => mapping.selectors);
      expect(selectors).toHaveLength(expectedMapped[pair.datasetId]);
      expect(
        selectors.every(
          (selector) =>
            selector.label_entity_id === item.structureSpace.context?.entity &&
            selector.label_asym_id === item.structureSpace.context?.["label-asym"] &&
            selector.auth_asym_id === item.structureSpace.context?.["auth-asym"] &&
            typeof selector.label_seq_id === "number" &&
            typeof selector.auth_seq_id === "number",
        ),
      ).toBe(true);
      const atomic = item.atomicDetailTrackIds.includes(representative.trackId);
      const types = countMvsRepresentationTypes(generated.document);
      expect(types.cartoon).toBe(1);
      expect(types.ball_and_stick ?? 0).toBe(
        atomic
          ? new Set(
              generated.mapping
                .filter((entry) => entry.selectors.length)
                .map((entry) => entry.color),
            ).size
          : 0,
      );
      expect(queryMvsTree(generated.document, "primitive")).toHaveLength(0);
    }
  });
});

const wait = (milliseconds = 40) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const component = (type: string, capability: string): ComponentFactory => ({
  type,
  create({ id }) {
    return {
      id,
      capabilities: [capability],
      async start() {},
      dispose() {},
    };
  },
});

const envelope = (type: string, payload: unknown): HarnessMessage => {
  const id = crypto.randomUUID();
  return {
    id,
    type,
    version: "0.1.0",
    source: { component: "test-ui" },
    correlationId: id,
    timestamp: new Date().toISOString(),
    payload: payload as never,
  };
};

describe("H20 harness-owned dataset switching", () => {
  it("orders replacements, keeps rapid latest selection, retires old activations, and disposes cleanly", async () => {
    const harness = createApplicationHarness(
      {
        id: "h20-switching",
        components: [
          { id: "sequence", type: "test.sequence" },
          { id: "structure", type: "test.structure" },
        ],
        plugins: [{ id: "datasets", plugin: "test.datasets" }],
      },
      {
        componentFactories: [
          component("test.sequence", "seqstar:format/seqviewspec"),
          component("test.structure", "seqstar:format/mvs"),
        ],
        pluginFactories: [
          {
            plugin: "test.datasets",
            create: () =>
              createUniProtDatasetsPlugin({
                sequenceComponent: "sequence",
                structureComponent: "structure",
                assets,
              }),
          },
        ],
      },
    );
    const observed: HarnessMessage[] = [];
    harness.fabric.observe().subscribe((item) => observed.push(item));
    await harness.start();
    await wait();
    expect(observed.filter((item) => item.type === "dataset.catalog.ready")).toHaveLength(1);
    expect(observed.filter((item) => item.type === "dataset.status").at(-1)?.payload).toMatchObject(
      { datasetId: "P04637-1TUP", status: "active" },
    );

    const diagnosticsBeforeMalformed = observed.filter(
      (item) => item.type === "harness.diagnostic",
    ).length;
    const statusesBeforeMalformed = observed.filter(
      (item) => item.type === "dataset.status",
    ).length;
    const malformedMessages = [
      envelope("intent.dataset.select", { datasetId: "not-a-dataset" }),
      envelope("dataset.status", { datasetId: "P04637-1TUP", status: "active" }),
      envelope("dataset.catalog.ready", { initialDatasetId: "P04637-1TUP", datasets: "bad" }),
      envelope("document.generated.mvs", { requestId: "incomplete" }),
      envelope("intent.annotation.show-in-structure", {
        documentId: "document",
        viewId: "view",
        trackId: "track",
      }),
      envelope("intent.dataset.select", {
        datasetId: "P04637-1TUP",
        invalid: () => undefined,
      }),
    ];
    for (const malformed of malformedMessages) harness.fabric.publish(malformed);
    await wait();
    expect(observed.filter((item) => item.type === "harness.diagnostic")).toHaveLength(
      diagnosticsBeforeMalformed + malformedMessages.length,
    );
    expect(observed.filter((item) => item.type === "dataset.status")).toHaveLength(
      statusesBeforeMalformed,
    );

    const activation = (
      datasetId: UniProtDatasetId,
      trackId: string,
      layerId: string,
    ): HarnessMessage => {
      const item = requireDataset(datasetId);
      return envelope("interaction.native", {
        interactionId: crypto.randomUUID(),
        interaction: "track-activate",
        phase: "set",
        origin: {
          componentId: "sequence",
          documentId: item.seqViewSpec.id,
          viewId: item.viewId,
          trackId,
          layerId,
        },
        loci: [],
      });
    };

    // Dense generation yields to translation; the immediate switch must abort it.
    harness.fabric.publish(activation("P04637-1TUP", "missense-score", "score-heatmap"));
    harness.fabric.publish(envelope("intent.dataset.select", { datasetId: "P69905-1A3N" }));
    harness.fabric.publish(envelope("intent.dataset.select", { datasetId: "P00648-1BRS-A" }));
    await wait(100);

    const activeStatuses = observed
      .filter((item) => item.type === "dataset.status")
      .map((item) => item.payload as unknown as { datasetId: string; status: string });
    expect(activeStatuses.at(-1)).toMatchObject({
      datasetId: "P00648-1BRS-A",
      status: "active",
    });
    expect(activeStatuses).toContainEqual(
      expect.objectContaining({ datasetId: "P69905-1A3N", status: "superseded" }),
    );
    expect(
      observed.some(
        (item) =>
          item.type === "document.generated.mvs" &&
          (item.payload as { trackId?: string }).trackId === "missense-score",
      ),
    ).toBe(false);

    const finalStatus = observed.filter((item) => item.type === "dataset.status").at(-1)
      ?.payload as unknown as {
      sequenceRequestId: string;
      structureRequestId: string;
    };
    const sequenceRequest = observed.findIndex(
      (item) =>
        item.type === "visualization.seqviewspec.request" &&
        (item.payload as { requestId?: string }).requestId === finalStatus.sequenceRequestId,
    );
    const structureRequest = observed.findIndex(
      (item) =>
        item.type === "visualization.mvs.request" &&
        (item.payload as { requestId?: string }).requestId === finalStatus.structureRequestId,
    );
    expect(sequenceRequest).toBeGreaterThan(-1);
    expect(structureRequest).toBeGreaterThan(sequenceRequest);

    // An event from the retired P04637 document cannot generate against the new structure.
    const generatedBeforeOldActivation = observed.filter(
      (item) => item.type === "document.generated.mvs",
    ).length;
    harness.fabric.publish(activation("P04637-1TUP", "sites", "site-markers"));
    await wait();
    expect(observed.filter((item) => item.type === "document.generated.mvs")).toHaveLength(
      generatedBeforeOldActivation,
    );

    harness.fabric.publish(activation("P00648-1BRS-A", "interface-residues", "interface-markers"));
    await wait(100);
    expect(
      observed.filter((item) => item.type === "document.generated.mvs").at(-1)?.payload,
    ).toMatchObject({
      documentId: "P00648-1BRS-chain-A-sequence-structure",
      trackId: "interface-residues",
    });
    expect(
      new Set(
        observed
          .filter((item) =>
            [
              "intent.dataset.select",
              "dataset.status",
              "dataset.catalog.ready",
              "intent.annotation.show-in-structure",
              "document.generated.mvs",
            ].includes(item.type),
          )
          .map((item) => item.type),
      ),
    ).toEqual(
      new Set([
        "intent.dataset.select",
        "dataset.status",
        "dataset.catalog.ready",
        "intent.annotation.show-in-structure",
        "document.generated.mvs",
      ]),
    );

    const beforeDispose = observed.length;
    await harness.disposeAsync();
    harness.fabric.publish(envelope("intent.dataset.select", { datasetId: "P04637-1TUP" }));
    await wait();
    expect(observed).toHaveLength(beforeDispose);
  });
});
