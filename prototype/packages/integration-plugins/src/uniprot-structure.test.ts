import {
  type ComponentFactory,
  createApplicationHarness,
  type HarnessMessage,
} from "@seq-star/harness-core";
import type { CoordinateLocus } from "@seq-star/seq-coords";
import { MVSData } from "molstar/lib/extensions/mvs/index.js";
import { describe, expect, it } from "vitest";
import mappingText from "../../../fixtures/uniprot-structure/mappings/P04637-1TUP-chain-A.tsv?raw";
import {
  countMvsRepresentationTypes,
  countMvsTreeNodes,
  queryMvsTree,
} from "./mvs-presentation.js";
import {
  createP04637MappingTranslators,
  createUniProtStructurePlugin,
  createUniProtStructureSeqViewSpec,
  generateUniProtAnnotationMvs,
  p53StructureSpace,
  parseP04637MappingTsv,
  SequenceProjectionIndex,
  uniprotSequenceSpace,
} from "./uniprot-structure.js";

const rows = parseP04637MappingTsv(mappingText);
const actualMolstarSpace = {
  ...p53StructureSpace,
  id: "molstar-state-ref-42",
  context: {
    ...p53StructureSpace.context,
    structure: "state-ref-42",
    model: "model-0",
    "model-index": "0",
    "model-number": "1",
    unit: "7",
    operator: "1_555",
    instance: "1_555",
  },
} as const;

const colorNodes = (document: Parameters<typeof queryMvsTree>[0]) =>
  queryMvsTree(document, "color").map((node) => node.params as Record<string, unknown>);

const selectorColors = (document: Parameters<typeof queryMvsTree>[0]) =>
  colorNodes(document).flatMap((params) =>
    Array.isArray(params.selector) ? (params.selector as readonly Record<string, unknown>[]) : [],
  );

const sortedSelectors = (values: readonly Record<string, unknown>[]) =>
  [...values].sort(
    (left, right) =>
      Number(left.label_seq_id ?? -1) - Number(right.label_seq_id ?? -1) ||
      Number(left.auth_seq_id ?? -1) - Number(right.auth_seq_id ?? -1),
  );

const selectorIdentity = (selector: Record<string, unknown>): string =>
  [
    selector.label_entity_id,
    selector.label_asym_id,
    selector.auth_asym_id,
    selector.label_seq_id,
    selector.auth_seq_id,
    selector.pdbx_PDB_ins_code ?? "",
  ].join("|");

const colorsBySelector = (document: Parameters<typeof queryMvsTree>[0]) =>
  Object.fromEntries(
    colorNodes(document)
      .flatMap(({ color, selector }) =>
        typeof color !== "string" || !Array.isArray(selector)
          ? []
          : selector.map(
              (item) => [selectorIdentity(item as Record<string, unknown>), color] as const,
            ),
      )
      .sort(([left], [right]) => left.localeCompare(right)),
  );

const assertOneCartoonProfile = (document: Parameters<typeof queryMvsTree>[0]) => {
  expect(MVSData.validationIssues(document, { noExtra: true })).toBeUndefined();
  expect(countMvsTreeNodes(document)).toMatchObject({
    download: 1,
    parse: 1,
    structure: 1,
    component: 1,
    representation: 1,
  });
  expect(countMvsRepresentationTypes(document)).toEqual({ cartoon: 1 });
  expect(queryMvsTree(document, "primitive")).toHaveLength(0);
};

const generateTrack = async (trackId: string, layerId: string) => {
  const [forward] = createP04637MappingTranslators(rows);
  const controller = new AbortController();
  return generateUniProtAnnotationMvs({
    document: createUniProtStructureSeqViewSpec(rows),
    viewId: "P04637-structure-main",
    trackId,
    layerId,
    structureUrl: "/fixtures/1TUP.cif",
    signal: controller.signal,
    requestId: `${trackId}-test`,
    translate: async (loci, signal) =>
      (await forward.map({ loci, target: p53StructureSpace }, signal)).associations,
  });
};

describe("P41 P04637 / 1TUP integration", () => {
  it("tracks accepted, rendered, retained, cleared, superseded, and disposed projections", () => {
    const index = new SequenceProjectionIndex();
    const a = createUniProtStructureSeqViewSpec(rows);
    const b = { ...a, id: "P04637-1TUP-projection-B" };
    const c = { ...a, id: "P04637-1TUP-projection-C" };
    index.index("A", a);
    index.index("B", b);
    index.index("C", c);
    index.lifecycle({ requestId: "A", status: "accepted" });
    index.lifecycle({ requestId: "A", status: "rendered" });
    expect(index.current()?.id).toBe(a.id);
    index.lifecycle({ requestId: "B", status: "accepted" });
    expect(index.current()?.id).toBe(b.id);
    index.lifecycle({ requestId: "B", status: "failed", previousView: "retained" });
    expect(index.current()?.id).toBe(a.id);
    index.lifecycle({ requestId: "B", status: "accepted" });
    index.lifecycle({ requestId: "B", status: "failed", previousView: "cleared" });
    expect(index.current()).toBeUndefined();
    index.lifecycle({ requestId: "A", status: "accepted" });
    index.lifecycle({ requestId: "A", status: "rendered" });
    index.lifecycle({ requestId: "B", status: "accepted" });
    index.lifecycle({ requestId: "B", status: "rendered" });
    expect(index.current()?.id).toBe(b.id);
    index.lifecycle({ requestId: "C", status: "accepted" });
    index.lifecycle({ requestId: "C", status: "superseded" });
    expect(index.current()).toBeUndefined();
    index.clear();
    expect(index.current()).toBeUndefined();
  });

  it("derives exact forward/reverse and partial interval mappings from every TSV row", async () => {
    expect(rows).toHaveLength(393);
    expect(rows.filter((row) => row.status === "exact")).toHaveLength(196);
    expect(rows.filter((row) => row.status === "missing_coordinate")).toHaveLength(23);
    expect(rows.filter((row) => row.status === "outside_construct")).toHaveLength(174);
    const [forward, reverse] = createP04637MappingTranslators(rows);
    const controller = new AbortController();
    const partial = await forward.map(
      {
        loci: [{ kind: "interval", space: uniprotSequenceSpace, start: 93, end: 312 }],
        target: p53StructureSpace,
      },
      controller.signal,
    );
    expect(partial.associations[0]).toMatchObject({ status: "partial" });
    expect(partial.associations[0]?.targets).toHaveLength(196);
    expect(partial.associations[0]?.source).toEqual({
      kind: "interval",
      space: uniprotSequenceSpace,
      start: 93,
      end: 312,
    });
    const firstExact = rows.find((row) => row.status === "exact");
    expect(firstExact).toBeDefined();
    const reversed = await reverse.map(
      {
        loci: [
          {
            kind: "point",
            space: p53StructureSpace,
            position: {
              kind: "label",
              value: `label:${firstExact?.labelSeqId}|auth:${firstExact?.authSeqId}`,
            },
          },
        ],
        target: uniprotSequenceSpace,
      },
      controller.signal,
    );
    expect(reversed.associations[0]?.targets).toEqual([
      {
        kind: "point",
        space: uniprotSequenceSpace,
        position: { kind: "index", value: firstExact?.sourceIndex },
      },
    ]);
    const realForward = await forward.map(
      {
        loci: [
          {
            kind: "point",
            space: { id: "uniprot-P04637-sequence", kind: "sequence", length: 393 },
            position: { kind: "index", value: 119 },
          },
        ],
        target: actualMolstarSpace,
      },
      controller.signal,
    );
    expect(realForward.associations[0]?.targets[0]?.space).toEqual(actualMolstarSpace);
    const realReverse = await reverse.map(
      {
        loci: realForward.associations[0]?.targets ?? [],
        target: { id: "uniprot-P04637-sequence", kind: "sequence", length: 393 },
      },
      controller.signal,
    );
    expect(realReverse.associations[0]?.targets[0]?.space).toEqual({
      id: "uniprot-P04637-sequence",
      kind: "sequence",
      length: 393,
    });
  });

  it("maps every authored P04637 semantic region, site, variant, and score locus", async () => {
    const document = createUniProtStructureSeqViewSpec(rows);
    const variantTrack = document.views[0]?.sections
      .flatMap((section) => section.tracks)
      .find((track) => track.id === "variants");
    expect(variantTrack).toMatchObject({
      label: "Natural variants",
      height: 28,
      layers: [{ id: "variant-markers", representation: "markers", shape: "diamond" }],
    });
    const [forward] = createP04637MappingTranslators(rows);
    const signal = new AbortController().signal;
    const loci = (annotationId: string): readonly CoordinateLocus[] => {
      const annotation = document.annotations?.find((item) => item.id === annotationId);
      if (annotation === undefined) throw new Error(`Missing '${annotationId}'.`);
      if (annotation.kind === "loci")
        return annotation.items.flatMap((item) =>
          item.loci.map((locus) =>
            locus.kind === "point"
              ? {
                  kind: "point" as const,
                  space: uniprotSequenceSpace,
                  position: { kind: "index" as const, value: locus.position },
                }
              : locus.kind === "interval"
                ? {
                    kind: "interval" as const,
                    space: uniprotSequenceSpace,
                    start: locus.start,
                    end: locus.end,
                  }
                : {
                    kind: "boundary" as const,
                    space: uniprotSequenceSpace,
                    position: locus.position,
                  },
          ),
        );
      if (annotation.kind === "relationships")
        throw new Error(`'${annotationId}' is not a one-sequence annotation.`);
      const positions =
        annotation.values.encoding === "dense"
          ? annotation.values.data.map((_, position) => position)
          : annotation.values.data.map(({ position }) => position);
      return positions.map((position) => ({
        kind: "point" as const,
        space: uniprotSequenceSpace,
        position: { kind: "index" as const, value: position },
      }));
    };
    const mapped = async (annotationId: string) =>
      forward.map({ loci: loci(annotationId), target: p53StructureSpace }, signal);

    const regions = await mapped("p53-regions");
    expect(regions.associations.map((item) => item.status)).toEqual([
      "unmapped",
      "partial",
      "unmapped",
    ]);
    expect(regions.associations.flatMap((item) => item.targets)).toHaveLength(196);

    const sites = await mapped("p53-sites");
    expect(sites.associations.map((item) => item.status)).toEqual(["unmapped", "exact", "exact"]);
    expect(sites.associations.flatMap((item) => item.targets)).toHaveLength(2);

    const variants = await mapped("p53-variants");
    expect(variants.associations.map((item) => item.status)).toEqual([
      "exact",
      "exact",
      "unmapped",
    ]);
    expect(variants.associations.flatMap((item) => item.targets)).toHaveLength(2);

    const score = await mapped("p53-synthetic-score");
    expect(score.associations).toHaveLength(393);
    expect(score.associations.filter((item) => item.status === "exact")).toHaveLength(196);
    expect(score.associations.filter((item) => item.status === "unmapped")).toHaveLength(197);
    expect(score.associations.flatMap((item) => item.targets)).toHaveLength(196);
  });

  it("uses one cartoon-only profile for variants while retaining exact mapped selectors", async () => {
    const [forward] = createP04637MappingTranslators(rows);
    const controller = new AbortController();
    const generation = await generateUniProtAnnotationMvs({
      document: createUniProtStructureSeqViewSpec(rows),
      viewId: "P04637-structure-main",
      trackId: "variants",
      layerId: "variant-markers",
      structureUrl: "/fixtures/1TUP.cif",
      signal: controller.signal,
      requestId: "variants-test",
      translate: async (loci, signal) =>
        (await forward.map({ loci, target: p53StructureSpace }, signal)).associations,
    });
    assertOneCartoonProfile(generation.document);
    expect(
      generation.mapping.map(({ itemId, status, color }) => ({ itemId, status, color })),
    ).toEqual([
      { itemId: "variant-R175H", status: "mapped", color: "#E11D48" },
      { itemId: "variant-R282W", status: "mapped", color: "#E11D48" },
      { itemId: "variant-R337H", status: "unmapped", color: "#E11D48" },
    ]);
    const expected = [174, 281].map((index) => {
      const row = rows[index];
      return {
        label_entity_id: "3",
        label_asym_id: "C",
        auth_asym_id: "A",
        label_seq_id: row?.labelSeqId,
        auth_seq_id: row?.authSeqId,
      };
    });
    expect(generation.mapping.flatMap((item) => item.selectors)).toEqual(expected);
    expect(sortedSelectors(selectorColors(generation.document))).toEqual(expected);
    expect(colorNodes(generation.document).map((node) => node.color)).toEqual([
      "#CBD5E1",
      "#E11D48",
    ]);
    expect(generation.mapping[2]?.originalLoci).toEqual([
      { kind: "point", space: uniprotSequenceSpace, position: { kind: "index", value: 336 } },
    ]);
  });

  it("keeps regions cartoon-only and adds selector-colored atomic detail for mapped sites", async () => {
    const [forward] = createP04637MappingTranslators(rows);
    const build = (trackId: string, layerId: string) => {
      const controller = new AbortController();
      return generateUniProtAnnotationMvs({
        document: createUniProtStructureSeqViewSpec(rows),
        viewId: "P04637-structure-main",
        trackId,
        layerId,
        structureUrl: "/fixtures/1TUP.cif",
        signal: controller.signal,
        requestId: `${trackId}-test`,
        translate: async (loci, signal) =>
          (await forward.map({ loci, target: p53StructureSpace }, signal)).associations,
      });
    };
    const regions = await build("regions", "region-blocks");
    expect(
      regions.mapping.map(({ itemId, status, color, selectors: itemSelectors }) => ({
        itemId,
        status,
        color,
        count: itemSelectors.length,
      })),
    ).toEqual([
      { itemId: "transactivation", status: "unmapped", color: "#F59E0B", count: 0 },
      { itemId: "dna-binding", status: "partial", color: "#2563EB", count: 196 },
      { itemId: "tetramerization", status: "unmapped", color: "#7C3AED", count: 0 },
    ]);
    const expectedRegion = rows
      .slice(93, 293)
      .filter((row) => row.status === "exact")
      .map((row) => ({
        label_entity_id: "3",
        label_asym_id: "C",
        auth_asym_id: "A",
        label_seq_id: row.labelSeqId,
        auth_seq_id: row.authSeqId,
      }));
    assertOneCartoonProfile(regions.document);
    expect(sortedSelectors(selectorColors(regions.document))).toEqual(expectedRegion);
    expect(colorNodes(regions.document).map((node) => node.color)).toEqual(["#CBD5E1", "#2563EB"]);

    const sites = await build("sites", "site-markers");
    expect(sites.mapping.map(({ itemId, status, color }) => ({ itemId, status, color }))).toEqual([
      { itemId: "phosphosite-S15", status: "unmapped", color: "#DC2626" },
      { itemId: "binding-K120", status: "mapped", color: "#D97706" },
      { itemId: "functional-R248", status: "mapped", color: "#7C3AED" },
    ]);
    const expectedSites = [119, 247].map((index) => ({
      label_entity_id: "3",
      label_asym_id: "C",
      auth_asym_id: "A",
      label_seq_id: rows[index]?.labelSeqId,
      auth_seq_id: rows[index]?.authSeqId,
    }));
    expect(MVSData.validationIssues(sites.document, { noExtra: true })).toBeUndefined();
    expect(countMvsTreeNodes(sites.document)).toMatchObject({
      component: 3,
      representation: 3,
    });
    expect(countMvsRepresentationTypes(sites.document)).toEqual({
      ball_and_stick: 2,
      cartoon: 1,
    });
    expect(sortedSelectors(selectorColors(sites.document))).toEqual(expectedSites);
    expect(colorNodes(sites.document).map((node) => node.color)).toEqual([
      "#CBD5E1",
      "#7C3AED",
      "#D97706",
      "#7C3AED",
      "#D97706",
    ]);
    const siteDetails = queryMvsTree(sites.document, "component")
      .filter((component) =>
        component.children?.some(
          (child) =>
            child.kind === "representation" &&
            (child.params as { type?: unknown } | undefined)?.type === "ball_and_stick",
        ),
      )
      .map((component) => ({
        selector: (component.params as { selector?: unknown } | undefined)?.selector,
        color: component.children?.[0]?.children?.[0]?.params,
      }));
    expect(siteDetails).toEqual([
      { selector: [expectedSites[1]], color: { color: "#7C3AED" } },
      { selector: [expectedSites[0]], color: { color: "#D97706" } },
    ]);
  });

  it("colors the exact AlphaMissense-like score on one cartoon without atomic geometry", async () => {
    const score = await generateTrack("missense-score", "score-heatmap");
    assertOneCartoonProfile(score.document);
    expect(score.counts).toEqual({ mapped: 196, partial: 0, ambiguous: 0, unmapped: 197 });
    const mapped = score.mapping.filter((item) => item.status === "mapped");
    expect(mapped).toHaveLength(196);
    const checkedTsvSelectors = rows
      .filter(
        (row): row is (typeof rows)[number] & { labelSeqId: number; authSeqId: number } =>
          row.status === "exact" && row.labelSeqId !== undefined && row.authSeqId !== undefined,
      )
      .map((row) => ({
        label_entity_id: "3",
        label_asym_id: "C",
        auth_asym_id: "A",
        label_seq_id: row.labelSeqId,
        auth_seq_id: row.authSeqId,
        ...(row.insertionCode === undefined ? {} : { pdbx_PDB_ins_code: row.insertionCode }),
      }));
    expect(sortedSelectors(selectorColors(score.document))).toEqual(
      sortedSelectors(checkedTsvSelectors),
    );
    const evaluatedColors = new Set(mapped.map((item) => item.color));
    const scoreColors = colorNodes(score.document);
    expect(scoreColors[0]).toEqual({ color: "#CBD5E1" });
    expect(scoreColors.slice(1)).toHaveLength(evaluatedColors.size);
    expect(scoreColors.slice(1).every((node) => typeof node.selector !== "undefined")).toBe(true);
    expect(colorsBySelector(score.document)).toEqual(
      Object.fromEntries(
        mapped
          .flatMap((item) =>
            item.selectors.map((selector) => [selectorIdentity(selector), item.color] as const),
          )
          .sort(([left], [right]) => left.localeCompare(right)),
      ),
    );
  });

  it("keeps missing and unmapped coverage neutral on the one P04637 cartoon", async () => {
    const coverage = await generateTrack("structure-coverage", "coverage-swatch");
    assertOneCartoonProfile(coverage.document);
    expect(coverage.counts).toEqual({ mapped: 196, partial: 0, ambiguous: 0, unmapped: 197 });
    expect(colorNodes(coverage.document).map((node) => node.color)).toEqual(["#CBD5E1", "#059669"]);
    expect(selectorColors(coverage.document)).toHaveLength(196);
    expect(coverage.mapping.filter((item) => item.status === "unmapped")).toHaveLength(197);
  });

  it("publishes the inspectable generated document first and retains only rapid latest activation", async () => {
    const component = (type: string, capabilities: readonly string[]): ComponentFactory => ({
      type,
      create({ id }) {
        return {
          id,
          capabilities,
          async start(context) {
            context.reportCoordinateSpaces(
              type === "test.sequence" ? [uniprotSequenceSpace] : [actualMolstarSpace],
            );
          },
          dispose() {},
        };
      },
    });
    const harness = createApplicationHarness(
      {
        id: "p41-test",
        components: [
          { id: "sequence", type: "test.sequence" },
          { id: "structure", type: "test.structure" },
        ],
        plugins: [{ id: "p41", plugin: "test.p41" }],
        synchronization: [
          {
            id: "real-hover",
            interaction: "hover",
            between: ["sequence", "structure"],
            unmapped: "clear",
          },
          {
            id: "real-select",
            interaction: "select",
            between: ["sequence", "structure"],
            unmapped: "preserve",
          },
        ],
      },
      {
        componentFactories: [
          component("test.sequence", ["seqstar:format/seqviewspec"]),
          component("test.structure", ["seqstar:format/mvs"]),
        ],
        pluginFactories: [
          {
            plugin: "test.p41",
            create: () =>
              createUniProtStructurePlugin({
                sequenceComponent: "sequence",
                structureComponent: "structure",
                mappingTsv: mappingText,
                structureUrl: "/fixtures/1TUP.cif",
              }),
          },
        ],
      },
    );
    const observed: HarnessMessage[] = [];
    harness.fabric.observe().subscribe((item) => observed.push(item));
    await harness.start();
    const acceptedId = crypto.randomUUID();
    harness.fabric.publish({
      id: acceptedId,
      type: "lifecycle.visualization",
      version: "0.1.0",
      source: { component: "sequence" },
      correlationId: acceptedId,
      timestamp: new Date().toISOString(),
      payload: {
        requestId: "P41-sequence-initial",
        generation: 1,
        componentId: "sequence",
        status: "accepted",
        diagnostics: [],
      },
    });
    await Promise.resolve();
    const renderedId = crypto.randomUUID();
    harness.fabric.publish({
      id: renderedId,
      type: "lifecycle.visualization",
      version: "0.1.0",
      source: { component: "sequence" },
      correlationId: renderedId,
      timestamp: new Date().toISOString(),
      payload: {
        requestId: "P41-sequence-initial",
        generation: 1,
        componentId: "sequence",
        status: "rendered",
        visibleRequestId: "P41-sequence-initial",
        diagnostics: [],
      },
    });
    const publishInteraction = (
      componentId: string,
      interaction: "hover" | "select",
      phase: "set" | "clear",
      loci: readonly unknown[],
      semanticTarget?: {
        readonly annotationId?: string;
        readonly itemId?: string;
        readonly trackId?: string;
      },
    ): { readonly messageId: string; readonly interactionId: string } => {
      const id = crypto.randomUUID();
      const interactionId = crypto.randomUUID();
      harness.fabric.publish({
        id,
        type: "interaction.native",
        version: "0.1.0",
        source: { component: componentId },
        correlationId: id,
        timestamp: new Date().toISOString(),
        payload: {
          interactionId,
          interaction,
          phase,
          origin: { componentId },
          ...(semanticTarget === undefined ? {} : { semanticTarget }),
          loci,
        } as never,
      });
      return { messageId: id, interactionId };
    };
    const sourcePoint = {
      kind: "point",
      space: uniprotSequenceSpace,
      position: { kind: "index", value: 119 },
    } as const;
    const row120 = rows[119];
    const structurePoint = {
      kind: "point",
      space: actualMolstarSpace,
      position: {
        kind: "label",
        value: `label:${row120?.labelSeqId}|auth:${row120?.authSeqId}`,
      },
    } as const;
    const dnaBindingRange = {
      kind: "interval",
      space: uniprotSequenceSpace,
      start: 93,
      end: 293,
    } as const;
    const reflected = (correlationId: string, type: string, target: string) =>
      observed.filter(
        (item) =>
          item.correlationId === correlationId &&
          item.type === type &&
          item.target !== undefined &&
          "component" in item.target &&
          item.target.component === target,
      );
    // These are the public native-envelope shapes emitted by the two renderer
    // wrappers. A structure hover first reflects to the sequence renderer.
    const molstarHover = publishInteraction("structure", "hover", "set", [structurePoint]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const initialReflection = reflected(
      molstarHover.messageId,
      "interaction.highlight.apply",
      "sequence",
    );
    expect(initialReflection).toHaveLength(1);
    const initialMessage = initialReflection[0];
    if (initialMessage === undefined) throw new Error("Expected initial Mol* hover reflection.");
    expect(
      (initialMessage.payload as { loci?: readonly { readonly space: unknown }[] }).loci,
    ).toEqual([sourcePoint]);

    // A Reference or Nightingale feature hit carries the complete semantic
    // interval, never just the pointer column. The globally replace-only hover
    // lease must clear the previous sequence reflection before applying all
    // mappable DNA-binding residues to Mol*.
    const sequenceHover = publishInteraction("sequence", "hover", "set", [dnaBindingRange], {
      annotationId: "p53-regions",
      itemId: "dna-binding",
      trackId: "regions",
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const transferClear = observed.filter(
      (item) =>
        item.type === "interaction.highlight.clear" &&
        item.target !== undefined &&
        "component" in item.target &&
        item.target.component === "sequence" &&
        item.causationId === sequenceHover.messageId,
    );
    expect(transferClear).toHaveLength(1);
    const fullFeature = reflected(
      sequenceHover.messageId,
      "interaction.highlight.apply",
      "structure",
    );
    expect(fullFeature).toHaveLength(1);
    const fullFeaturePayload = fullFeature[0]?.payload as {
      readonly loci: readonly { readonly space: unknown }[];
      readonly semanticTarget?: unknown;
    };
    expect(fullFeaturePayload.semanticTarget).toEqual({
      annotationId: "p53-regions",
      itemId: "dna-binding",
      trackId: "regions",
    });
    expect(fullFeaturePayload.loci).toHaveLength(196);
    expect(
      fullFeaturePayload.loci.every(
        (locus) => JSON.stringify(locus.space) === JSON.stringify(actualMolstarSpace),
      ),
    ).toBe(true);
    expect(
      observed.some(
        (item) =>
          item.type === "harness.diagnostic" &&
          JSON.stringify(item.payload).includes("harness.translation.partial"),
      ),
    ).toBe(true);

    // Transfer back to Mol* proves that the feature highlight was retired;
    // there is no stale 196-residue union alongside the current one-residue
    // structure hover in the sequence renderer.
    const latestMolstarHover = publishInteraction("structure", "hover", "set", [structurePoint]);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const latestSequence = reflected(
      latestMolstarHover.messageId,
      "interaction.highlight.apply",
      "sequence",
    );
    expect(latestSequence).toHaveLength(1);
    const latestMessage = latestSequence[0];
    if (latestMessage === undefined) throw new Error("Expected latest Mol* hover reflection.");
    expect((latestMessage.payload as { readonly loci: readonly unknown[] }).loci).toEqual([
      sourcePoint,
    ]);
    expect(
      observed.filter(
        (item) =>
          item.type === "interaction.highlight.clear" &&
          item.target !== undefined &&
          "component" in item.target &&
          item.target.component === "structure" &&
          item.causationId === latestMolstarHover.messageId,
      ),
    ).toHaveLength(1);

    const forwardSelect = publishInteraction("sequence", "select", "set", [sourcePoint]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(
      reflected(forwardSelect.messageId, "interaction.selection.apply", "structure"),
    ).toHaveLength(1);
    const activate = (trackId: string, layerId: string): void => {
      const id = crypto.randomUUID();
      harness.fabric.publish({
        id,
        type: "interaction.native",
        version: "0.1.0",
        source: { component: "sequence" },
        correlationId: id,
        timestamp: new Date().toISOString(),
        payload: {
          interactionId: crypto.randomUUID(),
          interaction: "track-activate",
          phase: "set",
          origin: {
            componentId: "sequence",
            documentId: "P04637-1TUP-uniprot-structure",
            viewId: "P04637-structure-main",
            trackId,
            layerId,
          },
          loci: [],
        },
      });
    };
    activate("regions", "region-blocks");
    activate("variants", "variant-markers");
    await new Promise((resolve) => setTimeout(resolve, 250));
    const generated = observed.filter((item) => item.type === "document.generated.mvs");
    const requests = observed.filter(
      (item) =>
        item.type === "visualization.mvs.request" &&
        (item.payload as { requestId?: string }).requestId?.startsWith("P41-") &&
        (item.payload as { requestId?: string }).requestId !== "P41-structure-neutral",
    );
    expect(generated).toHaveLength(1);
    expect(requests).toHaveLength(1);
    const generatedMessage = generated[0];
    const requestMessage = requests[0];
    if (generatedMessage === undefined || requestMessage === undefined)
      throw new Error("Expected the latest generated document and request.");
    expect((generatedMessage.payload as { trackId?: string }).trackId).toBe("variants");
    expect(observed.indexOf(generatedMessage)).toBeLessThan(observed.indexOf(requestMessage));
    expect((requestMessage.payload as { requestId?: string }).requestId).toBe(
      (generatedMessage.payload as { requestId?: string }).requestId,
    );
    await harness.disposeAsync();
  });
});
