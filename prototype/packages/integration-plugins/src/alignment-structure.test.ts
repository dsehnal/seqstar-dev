import {
  type ComponentContext,
  type ComponentFactory,
  createApplicationHarness,
  createTranslatorRegistry,
  type HarnessMessage,
} from "@seq-star/harness-core";
import {
  type CoordinateLocus,
  type CoordinateSpace,
  validateCoordinateLocus,
} from "@seq-star/seq-coords";
import { consensus, conservation, normalizeAlignment, parseAlignedFasta } from "@seq-star/seq-core";
import { validateSeqViewSpec } from "@seq-star/seq-view-spec";
import { MVSData } from "molstar/lib/extensions/mvs/index.js";
import { describe, expect, it } from "vitest";
import alignmentAfa from "../../../fixtures/alignment-structure/expected/PF00042.29-32rows.query-centric.afa?raw";
import p69905Fasta from "../../../fixtures/alignment-structure/input/P69905.fasta?raw";
import structureMappingTsv from "../../../fixtures/alignment-structure/mappings/P69905-1A3N-chain-A.tsv?raw";
import alignmentMappingTsv from "../../../fixtures/alignment-structure/mappings/P69905-PF00042-1A3N-chain-A.tsv?raw";
import a0a2y9dez0Mapping from "../../../fixtures/alignment-structure/mappings/PF00042.29-A0A2Y9DEZ0-AF-A0A2Y9DEZ0-F1-model_v6.tsv?raw";
import a0a5e4c8d4Mapping from "../../../fixtures/alignment-structure/mappings/PF00042.29-A0A5E4C8D4-AF-A0A5E4C8D4-F1-model_v6.tsv?raw";
import p02197Mapping from "../../../fixtures/alignment-structure/mappings/PF00042.29-P02197-AF-P02197-F1-model_v6.tsv?raw";
import a0a2y9dez0Transform from "../../../fixtures/alignment-structure/transforms/A0A2Y9DEZ0-AF-A0A2Y9DEZ0-F1-to-P69905-1A3N-chain-A.transform.json" with {
  type: "json",
};
import a0a5e4c8d4Transform from "../../../fixtures/alignment-structure/transforms/A0A5E4C8D4-AF-A0A5E4C8D4-F1-to-P69905-1A3N-chain-A.transform.json" with {
  type: "json",
};
import p02197Transform from "../../../fixtures/alignment-structure/transforms/P02197-AF-P02197-F1-to-P69905-1A3N-chain-A.transform.json" with {
  type: "json",
};
import {
  type AlignmentEnsembleMember,
  alignmentColumnSpace,
  createAlignmentEnsembleMvs,
  createAlignmentStructurePlugin,
  createAlignmentStructureSeqViewSpec,
  createAlignmentStructureTranslators,
  createNeutral1A3nMvs,
  p69905SequenceSpace,
  p69905StructureSpace,
  parseAlignmentStructureMappingTsv,
  parseP69905StructureMappingTsv,
} from "./alignment-structure.js";

const source = {
  alignmentAfa,
  p69905Fasta,
  alignmentMappingTsv,
  structureMappingTsv,
};
const matrix = (source: {
  readonly matrix: { readonly values: readonly number[] };
}): readonly number[] => source.matrix.values;
const approvedEnsemble: readonly AlignmentEnsembleMember[] = [
  {
    id: "P69905-1A3N",
    memberId: "HBA_HUMAN-27-137:member",
    label: "P69905 / 1A3N",
    provenanceLabel: "experimental test fixture",
    url: "/input/1A3N.cif",
    color: "#2563EB",
    predicted: false,
    mappingTsv: alignmentMappingTsv,
  },
  {
    id: "P02197-AFDB-v6",
    memberId: "MYG_CHICK-27-143:member",
    label: "P02197 AlphaFold DB v6",
    provenanceLabel: "AlphaFold DB v6 predicted model — theoretical; not experimental",
    url: "/input/AF-P02197-F1-model_v6.cif",
    color: "#F97316",
    predicted: true,
    mappingTsv: p02197Mapping,
    transform: matrix(p02197Transform),
  },
  {
    id: "A0A5E4C8D4-AFDB-v6",
    memberId: "A0A5E4C8D4_MARMO-27-137:member",
    label: "A0A5E4C8D4 AlphaFold DB v6",
    provenanceLabel: "AlphaFold DB v6 predicted model — theoretical; not experimental",
    url: "/input/AF-A0A5E4C8D4-F1-model_v6.cif",
    color: "#10B981",
    predicted: true,
    mappingTsv: a0a5e4c8d4Mapping,
    transform: matrix(a0a5e4c8d4Transform),
  },
  {
    id: "A0A2Y9DEZ0-AFDB-v6",
    memberId: "A0A2Y9DEZ0_TRIMA-27-137:member",
    label: "A0A2Y9DEZ0 AlphaFold DB v6",
    provenanceLabel: "AlphaFold DB v6 predicted model — theoretical; not experimental",
    url: "/input/AF-A0A2Y9DEZ0-F1-model_v6.cif",
    color: "#A855F7",
    predicted: true,
    mappingTsv: a0a2y9dez0Mapping,
    transform: matrix(a0a2y9dez0Transform),
  },
];
const document = createAlignmentStructureSeqViewSpec(source);
const columnRows = parseAlignmentStructureMappingTsv(alignmentMappingTsv);
const structureRows = parseP69905StructureMappingTsv(structureMappingTsv);
const point = (space: CoordinateSpace, value: number): CoordinateLocus => ({
  kind: "point",
  space,
  position: { kind: "index", value },
});
const deferred = () => {
  let resolve = (): void => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
type MvsNode = {
  readonly kind: string;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly children?: readonly MvsNode[];
};
const mvsNodes = (value: unknown): readonly MvsNode[] => {
  const root = (value as { readonly root: MvsNode }).root;
  const visit = (node: MvsNode): readonly MvsNode[] => [
    node,
    ...(node.children ?? []).flatMap(visit),
  ];
  return visit(root);
};
const colorCounts = (value: unknown): Readonly<Record<string, number>> => {
  const counts: Record<string, number> = {};
  for (const node of mvsNodes(value).filter((item) => item.kind === "color")) {
    const color = String(node.params?.color);
    counts[color] = (counts[color] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
};

describe("P60 PF00042.29 / P69905 / 1A3N integration", () => {
  it("uses the checked AFA through Seq* normalization and produces one valid 32-row alignment", () => {
    const parsed = parseAlignedFasta(alignmentAfa);
    if (!parsed.ok) throw new Error("checked AFA failed to parse");
    const normalized = normalizeAlignment(parsed.value, {
      alignmentId: "PF00042.29",
      coordinateSpace: alignmentColumnSpace.id,
      alphabet: "protein",
    });
    if (!normalized.ok) throw new Error("checked AFA failed to normalize");
    const alignment = document.alignments?.[0];
    expect(validateSeqViewSpec(document).ok).toBe(true);
    expect(document.assemblies).toBeUndefined();
    expect(alignment).toMatchObject({
      id: "PF00042.29",
      coordinateSpace: alignmentColumnSpace.id,
      length: 118,
    });
    expect(alignment?.members).toHaveLength(32);
    expect(new Set(alignment?.members.map((member) => member.id)).size).toBe(32);
    expect(alignment?.members[0]).toMatchObject({
      id: "HBA_HUMAN-27-137:member",
      sequence: "P69905",
    });
    expect(alignment?.members[0]?.positions.filter((value) => value === null)).toHaveLength(7);
    expect(alignment?.members[0]?.positions.filter((value) => value !== null)).toHaveLength(111);
    expect(normalized.value.alignment.members).toHaveLength(32);
    expect(normalized.value.alignment.length).toBe(118);
  });

  it("computes actual deterministic consensus and conservation from the normalized rows", () => {
    const parsed = parseAlignedFasta(alignmentAfa);
    if (!parsed.ok) throw new Error("checked AFA failed to parse");
    const normalized = normalizeAlignment(parsed.value, {
      alignmentId: "PF00042.29",
      coordinateSpace: alignmentColumnSpace.id,
      alphabet: "protein",
    });
    if (!normalized.ok) throw new Error("checked AFA failed to normalize");
    const expectedConsensus = consensus(normalized.value.alignment).values;
    const expectedConservation = conservation(normalized.value.alignment).values;
    const annotations = new Map((document.annotations ?? []).map((item) => [item.id, item]));
    const consensusAnnotation = annotations.get("PF00042.29-consensus");
    const conservationAnnotation = annotations.get("PF00042.29-conservation");
    const subgroupAnnotation = annotations.get("PF00042.29-subgroups");
    expect(consensusAnnotation?.kind === "values" && consensusAnnotation.values.data).toEqual(
      expectedConsensus,
    );
    expect(conservationAnnotation?.kind === "values" && conservationAnnotation.values.data).toEqual(
      expectedConservation,
    );
    expect(subgroupAnnotation?.kind === "loci" && subgroupAnnotation.items).toEqual([
      {
        id: "query-helix-rich-core",
        label: "Query globin core",
        value: "query-subgroup",
        loci: [{ kind: "interval", space: alignmentColumnSpace.id, start: 26, end: 91 }],
      },
      {
        id: "insertion-edge-columns",
        label: "Query insertion/deletion edges",
        value: "gap-edge",
        loci: [
          { kind: "interval", space: alignmentColumnSpace.id, start: 21, end: 25 },
          { kind: "interval", space: alignmentColumnSpace.id, start: 56, end: 59 },
        ],
      },
    ]);
    expect(expectedConsensus).toHaveLength(118);
    expect(expectedConservation).toHaveLength(118);
    expect(
      new Set(expectedConservation.filter((value): value is number => typeof value === "number"))
        .size,
    ).toBeGreaterThan(2);
  });

  it("matches every frozen mapping row, retains seven source gaps, and has 141 observed structure rows", () => {
    expect(columnRows).toHaveLength(118);
    expect(columnRows.filter((row) => row.status === "query_gap")).toHaveLength(7);
    expect(columnRows.filter((row) => row.status === "exact")).toHaveLength(111);
    expect(structureRows).toHaveLength(142);
    expect(structureRows.filter((row) => row.status === "exact")).toHaveLength(141);
    for (const row of columnRows) {
      if (row.status === "query_gap") {
        expect(row.sourceIndex).toBeUndefined();
        continue;
      }
      const structure = structureRows[row.sourceIndex ?? -1];
      expect(structure).toMatchObject({
        status: "exact",
        labelSeqId: row.labelSeqId,
        authSeqId: row.authSeqId,
      });
    }
  });

  it("composes column -> P69905 sequence -> 1A3N and reverses it without a shortcut", async () => {
    const translators = createAlignmentStructureTranslators({ document, structureRows });
    const registry = createTranslatorRegistry();
    translators.all.forEach((translator) => {
      registry.register(translator);
    });
    const queryMember = document.alignments?.[0]?.members[0];
    if (queryMember === undefined) throw new Error("query row missing");
    const forward = await registry.map({
      loci: [point(alignmentColumnSpace, 0)],
      target: p69905StructureSpace,
    });
    expect(forward.paths[0]?.translatorIds).toEqual([
      `p60.PF00042.29.column-to-${queryMember.id}`,
      "p60.P69905.sequence-to-1A3N-chain-A",
    ]);
    const direct = await translators.sequenceToStructure.map(
      { loci: [point(p69905SequenceSpace, 26)], target: p69905StructureSpace },
      new AbortController().signal,
    );
    expect(
      validateCoordinateLocus({
        kind: "point",
        space: p69905StructureSpace,
        position: { kind: "label", value: "label:26|auth:26" },
      }).ok,
    ).toBe(true);
    expect(direct.diagnostics).toEqual([]);
    expect(direct.associations[0]?.targets).toHaveLength(1);
    const actualMolstarSpace: CoordinateSpace = {
      ...p69905StructureSpace,
      id: "molstar-state-1A3N",
      context: {
        ...p69905StructureSpace.context,
        structure: "state-ref-1A3N",
        model: "model-0",
        "model-index": "0",
        "model-number": "1",
        unit: "7",
        operator: "1_555",
        instance: "1_555",
      },
    };
    const actualForward = await registry.map({
      loci: [point(alignmentColumnSpace, 0)],
      target: actualMolstarSpace,
    });
    expect(actualForward.associations[0]?.targets[0]?.space).toEqual(actualMolstarSpace);
    const actualReverse = await registry.map({
      loci: actualForward.associations[0]?.targets ?? [],
      target: alignmentColumnSpace,
    });
    expect(actualReverse.associations[0]?.targets).toEqual([point(alignmentColumnSpace, 0)]);
    expect(forward.associations[0]?.targets).toEqual([
      {
        kind: "point",
        space: p69905StructureSpace,
        position: { kind: "label", value: "label:26|auth:26" },
      },
    ]);
    expect(forward.paths[0]?.translatorIds).toEqual([
      `p60.PF00042.29.column-to-${queryMember.id}`,
      "p60.P69905.sequence-to-1A3N-chain-A",
    ]);
    expect(forward.paths[0]?.translatorIds).not.toContain("p60.PF00042.29.column-to-1A3N-chain-A");
    const gap = await registry.map({
      loci: [point(alignmentColumnSpace, 21)],
      target: p69905StructureSpace,
    });
    expect(gap.associations[0]).toMatchObject({ status: "unmapped", targets: [] });
    expect(gap.paths[0]?.translatorIds).toHaveLength(2);
    const reverse = await registry.map({
      loci: forward.associations[0]?.targets ?? [],
      target: alignmentColumnSpace,
    });
    expect(reverse.associations[0]?.targets).toEqual([point(alignmentColumnSpace, 0)]);
    expect(reverse.paths[0]?.translatorIds).toEqual([
      "p60.1A3N-chain-A-to-P69905.sequence",
      `p60.${queryMember.id}-to-PF00042.29.column`,
    ]);
    const selectedColumn = await Promise.all(
      document.alignments?.[0]?.members.map(async (member) => {
        const sequence = document.sequences.find((item) => item.id === member.sequence);
        if (sequence === undefined) return [];
        return (
          await registry.map({
            loci: [point(alignmentColumnSpace, 0)],
            target:
              sequence.id === "P69905"
                ? p69905SequenceSpace
                : {
                    id: sequence.coordinateSpace,
                    kind: "sequence",
                    length: [...sequence.residues].length,
                  },
            policy: {
              preferredTranslatorIds: [`p60.PF00042.29.column-to-${member.id}`],
              maxSteps: 1,
            },
          })
        ).associations.flatMap((association) => association.targets);
      }) ?? [],
    );
    expect(selectedColumn.flat()).toHaveLength(
      document.alignments?.[0]?.members.filter((member) => member.positions[0] !== null).length ??
        0,
    );
  });

  it("generates a complete local neutral MVS from the pinned Mol* package", () => {
    const mvs = createNeutral1A3nMvs("/fixtures/1A3N.cif");
    expect(MVSData.validationIssues(mvs, { noExtra: true })).toBeUndefined();
    expect(JSON.stringify(mvs)).toContain("/fixtures/1A3N.cif");
  });

  it("generates distinct validated profile and checked four-root ensemble MVS trees", () => {
    const normalized = normalizeAlignment(
      (() => {
        const parsed = parseAlignedFasta(alignmentAfa);
        if (!parsed.ok) throw new Error("alignment parse failed");
        return parsed.value;
      })(),
      { alignmentId: "PF00042.29", coordinateSpace: alignmentColumnSpace.id, alphabet: "protein" },
    );
    if (!normalized.ok) throw new Error("alignment normalization failed");
    const create = (profile?: "consensus" | "conservation" | "subgroup") =>
      createAlignmentEnsembleMvs({
        members: approvedEnsemble,
        ...(profile === undefined ? {} : { profile }),
        alignment: normalized.value.alignment,
        title: `checked ${profile ?? "all"}`,
        description: "checked test document",
      });
    const all = create();
    const consensusMvs = create("consensus");
    const conservationMvs = create("conservation");
    const subgroupMvs = create("subgroup");
    for (const mvs of [all, consensusMvs, conservationMvs, subgroupMvs])
      expect(MVSData.validationIssues(mvs, { noExtra: true })).toBeUndefined();
    const allNodes = mvsNodes(all);
    expect(
      allNodes.filter((node) => node.kind === "download").map((node) => node.params?.url),
    ).toEqual(approvedEnsemble.map((member) => member.url));
    expect(
      allNodes.filter((node) => node.kind === "transform").map((node) => node.params?.matrix),
    ).toEqual(approvedEnsemble.slice(1).map((member) => member.transform));
    expect(allNodes.filter((node) => node.kind === "component")).toHaveLength(4);
    expect(colorCounts(all)).toEqual({
      "#10B981": 1,
      "#2563EB": 1,
      "#A855F7": 1,
      "#F97316": 1,
    });
    for (const profile of [consensusMvs, conservationMvs, subgroupMvs]) {
      const nodes = mvsNodes(profile);
      expect(nodes.filter((node) => node.kind === "download")).toHaveLength(4);
      expect(nodes.filter((node) => node.kind === "transform")).toHaveLength(3);
      expect(nodes.filter((node) => node.kind === "component")).toHaveLength(448);
      expect(nodes.filter((node) => node.kind === "representation")).toHaveLength(448);
      expect(nodes.filter((node) => node.kind === "color")).toHaveLength(448);
      expect(
        nodes.filter(
          (node) => node.kind === "component" && typeof node.params?.selector === "object",
        ),
      ).toHaveLength(448);
      const roots = ((profile as unknown as { readonly root: MvsNode }).root.children ?? []).filter(
        (node) => node.kind === "download",
      );
      expect(
        roots.map((root) => mvsNodes({ root }).filter((node) => node.kind === "component").length),
      ).toEqual([112, 113, 112, 111]);
      expect(
        nodes.filter((node) => {
          if (node.kind !== "component" || typeof node.params?.selector !== "object") return false;
          return "label_seq_id" in (node.params.selector as object);
        }),
      ).toHaveLength(444);
    }
    expect(colorCounts(consensusMvs)).toEqual({
      "#2563EB": 216,
      "#CBD5E1": 4,
      "#DC2626": 228,
    });
    expect(colorCounts(conservationMvs)).toEqual({
      "#0EA5E9": 95,
      "#2563EB": 8,
      "#312E81": 14,
      "#94A3B8": 327,
      "#CBD5E1": 4,
    });
    expect(colorCounts(subgroupMvs)).toEqual({
      "#64748B": 192,
      "#7C3AED": 248,
      "#CBD5E1": 4,
      "#D97706": 4,
    });
    const p02197Root = ((subgroupMvs as unknown as { readonly root: MvsNode }).root.children ?? [])
      .filter((node) => node.kind === "download")
      .find((node) => node.params?.url === "/input/AF-P02197-F1-model_v6.cif");
    if (p02197Root === undefined) throw new Error("P02197 subgroup root missing");
    const colorAtLabelSeqId = (labelSeqId: number): unknown => {
      const component = mvsNodes({ root: p02197Root }).find(
        (node) =>
          node.kind === "component" &&
          typeof node.params?.selector === "object" &&
          node.params.selector !== null &&
          "label_seq_id" in node.params.selector &&
          node.params.selector.label_seq_id === labelSeqId,
      );
      return component === undefined
        ? undefined
        : mvsNodes({ root: component }).find((node) => node.kind === "color")?.params?.color;
    };
    // Exact fixture-backed boundary selectors: [21,25) is orange through
    // column 24, while columns 25 and 91 are outside their half-open ranges.
    // Column 59 is past the gap-edge end but remains in the broad core.
    expect({
      column24: colorAtLabelSeqId(53),
      column25: colorAtLabelSeqId(54),
      column59: colorAtLabelSeqId(85),
      column90: colorAtLabelSeqId(116),
      column91: colorAtLabelSeqId(117),
    }).toEqual({
      column24: "#D97706",
      column25: "#64748B",
      column59: "#7C3AED",
      column90: "#7C3AED",
      column91: "#64748B",
    });
    expect(JSON.stringify(consensusMvs)).not.toEqual(JSON.stringify(conservationMvs));
    expect(JSON.stringify(conservationMvs)).not.toEqual(JSON.stringify(subgroupMvs));
    expect(JSON.stringify(consensusMvs)).toContain("#DC2626");
    expect(JSON.stringify(conservationMvs)).toContain("#312E81");
    expect(JSON.stringify(subgroupMvs)).toContain("#7C3AED");
  });

  it("fails predicted interaction closed until the exact member structure is active", async () => {
    const predictedSpace: CoordinateSpace = {
      id: "structure-p02197-active",
      kind: "structure-residue",
      authority: "molstar",
      context: {
        entry: "AF-P02197-F1-model_v6",
        structure: "p02197-state",
        model: "model-0",
        "model-index": "0",
        "model-number": "1",
        entity: "1",
        "label-asym": "A",
        "auth-asym": "A",
        unit: "1",
        operator: "1_555",
        instance: "1_555",
        numbering: "label-and-auth",
      },
    };
    let reportStructureSpaces: ComponentContext["reportCoordinateSpaces"] = () => undefined;
    const passive = (
      type: string,
      capabilities: readonly string[],
      start: (context: ComponentContext) => void,
    ): ComponentFactory => ({
      type,
      create({ id }) {
        return {
          id,
          capabilities,
          async start(context) {
            start(context);
          },
          dispose() {},
        };
      },
    });
    const harness = createApplicationHarness(
      {
        id: "m50-predicted-lifecycle",
        components: [
          { id: "alignment", type: "test.alignment" },
          { id: "structure", type: "test.structure" },
        ],
        plugins: [{ id: "alignment-structure", plugin: "test.alignment-structure" }],
      },
      {
        componentFactories: [
          passive("test.alignment", ["seqstar:format/seqviewspec"], (context) =>
            context.reportCoordinateSpaces([alignmentColumnSpace]),
          ),
          passive("test.structure", ["seqstar:format/mvs"], (context) => {
            reportStructureSpaces = context.reportCoordinateSpaces;
            reportStructureSpaces([]);
          }),
        ],
        pluginFactories: [
          {
            plugin: "test.alignment-structure",
            create: () =>
              createAlignmentStructurePlugin({
                alignmentComponent: "alignment",
                structureComponent: "structure",
                ...source,
                structureUrl: "/input/1A3N.cif",
                ensemble: approvedEnsemble,
                ensembleId: "PF00042.29-P69905-1A3N-plus-AFDB-v6-3",
              }),
          },
        ],
      },
    );
    const observed: HarnessMessage[] = [];
    harness.fabric.observe().subscribe((message) => observed.push(message));
    await harness.start();
    const publishNative = (
      interaction: "hover" | "select",
      phase: "set" | "clear",
      column: number,
    ) => {
      const id = crypto.randomUUID();
      harness.fabric.publish({
        id,
        type: "interaction.native",
        version: "0.1.0",
        source: { component: "alignment" },
        correlationId: id,
        timestamp: new Date().toISOString(),
        payload: {
          interactionId: id,
          interaction,
          phase,
          origin: {
            componentId: "alignment",
            documentId: document.id,
            viewId: "PF00042.29-main",
            alignmentId: "PF00042.29",
            alignmentMemberId: "MYG_CHICK-27-143:member",
          },
          loci: phase === "clear" ? [] : [point(alignmentColumnSpace, column)],
        } as never,
      });
      return id;
    };
    const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
    const before = publishNative("hover", "set", 1);
    await settle();
    expect(
      observed.filter(
        (message) =>
          message.correlationId === before &&
          message.type === "interaction.highlight.apply" &&
          message.target !== undefined &&
          "component" in message.target &&
          message.target.component === "structure",
      ),
    ).toHaveLength(0);
    expect(
      observed.find(
        (message) =>
          message.correlationId === before && message.type === "alignment-structure.mapping",
      )?.payload,
    ).toMatchObject({ status: "unmapped", targetCount: 0 });

    const actionId = crypto.randomUUID();
    harness.fabric.publish({
      id: actionId,
      type: "alignment.structure.show-member",
      version: "0.1.0",
      source: { component: "alignment" },
      correlationId: actionId,
      timestamp: new Date().toISOString(),
      payload: { memberId: "MYG_CHICK-27-143:member" } as never,
    });
    await settle();
    const request = observed.find(
      (message) =>
        message.correlationId === actionId && message.type === "visualization.mvs.request",
    );
    expect(JSON.stringify(request?.payload)).toContain("/input/AF-P02197-F1-model_v6.cif");
    reportStructureSpaces([predictedSpace]);

    const hover = publishNative("hover", "set", 1);
    const select = publishNative("select", "set", 1);
    await settle();
    for (const [correlationId, type] of [
      [hover, "interaction.highlight.apply"],
      [select, "interaction.selection.apply"],
    ] as const) {
      const apply = observed.find(
        (message) =>
          message.correlationId === correlationId &&
          message.type === type &&
          message.target !== undefined &&
          "component" in message.target &&
          message.target.component === "structure",
      );
      expect(apply).toBeDefined();
      if (apply === undefined) throw new Error("predicted structure application missing");
      expect((apply.payload as { loci?: readonly CoordinateLocus[] }).loci?.[0]?.space).toEqual(
        predictedSpace,
      );
    }
    const clear = publishNative("select", "clear", 1);
    const gap = publishNative("hover", "set", 0);
    await settle();
    expect(
      observed.find(
        (message) =>
          message.correlationId === clear && message.type === "interaction.selection.clear",
      ),
    ).toBeDefined();
    expect(
      observed.find(
        (message) =>
          message.correlationId === gap && message.type === "alignment-structure.mapping",
      )?.payload,
    ).toMatchObject({ status: "unmapped", targetCount: 0 });
    expect(
      observed.filter(
        (message) =>
          message.correlationId === gap && message.type === "interaction.highlight.apply",
      ),
    ).toHaveLength(0);
    await harness.disposeAsync();
  });

  it("routes real harness native events through the gated two-step seam without echo", async () => {
    const actualMolstarSpace: CoordinateSpace = {
      ...p69905StructureSpace,
      id: "molstar-state-1A3N-test",
      context: {
        ...p69905StructureSpace.context,
        structure: "state-ref-1A3N",
        model: "model-0",
        "model-index": "0",
        "model-number": "1",
        unit: "7",
        operator: "1_555",
        instance: "1_555",
      },
    };
    const sequenceSpaces = document.sequences.map((sequence) => ({
      id: sequence.coordinateSpace,
      kind: "sequence",
      length: [...sequence.residues].length,
    }));
    const component = (
      type: string,
      capabilities: readonly string[],
      spaces: readonly CoordinateSpace[],
    ): ComponentFactory => ({
      type,
      create({ id }) {
        return {
          id,
          capabilities,
          async start(context) {
            context.reportCoordinateSpaces(spaces);
          },
          dispose() {},
        };
      },
    });
    const harness = createApplicationHarness(
      {
        id: "p60-harness-test",
        components: [
          { id: "alignment", type: "test.alignment" },
          { id: "structure", type: "test.structure" },
        ],
        plugins: [{ id: "p60", plugin: "test.p60" }],
      },
      {
        componentFactories: [
          component(
            "test.alignment",
            ["seqstar:format/seqviewspec"],
            [alignmentColumnSpace, ...sequenceSpaces],
          ),
          component("test.structure", ["seqstar:format/mvs"], [actualMolstarSpace]),
        ],
        pluginFactories: [
          {
            plugin: "test.p60",
            create: () =>
              createAlignmentStructurePlugin({
                alignmentComponent: "alignment",
                structureComponent: "structure",
                ...source,
                structureUrl: "/fixtures/1A3N.cif",
                ensemble: approvedEnsemble,
                ensembleId: "test-ensemble",
              }),
          },
        ],
      },
    );
    const observed: HarnessMessage[] = [];
    harness.fabric.observe().subscribe((item) => observed.push(item));
    type MappingGate = {
      readonly targetKind: CoordinateSpace["kind"];
      readonly entered: ReturnType<typeof deferred>;
      readonly release: ReturnType<typeof deferred>;
    };
    let mappingGate: MappingGate | undefined;
    const mapImmediately = harness.translators.map.bind(harness.translators);
    harness.translators.map = async (request, signal) => {
      const gate = mappingGate;
      if (gate !== undefined && request.target.kind === gate.targetKind) {
        mappingGate = undefined;
        gate.entered.resolve();
        await gate.release.promise;
      }
      return mapImmediately(request, signal);
    };
    const delayNextMapTo = (targetKind: CoordinateSpace["kind"]): MappingGate => {
      const gate = { targetKind, entered: deferred(), release: deferred() };
      mappingGate = gate;
      return gate;
    };
    await harness.start();
    const query = document.alignments?.[0]?.members[0];
    const other = document.alignments?.[0]?.members[1];
    if (query === undefined || other === undefined) throw new Error("alignment members missing");
    const publish = (options: {
      readonly componentId: "alignment" | "structure";
      readonly interaction: "hover" | "select";
      readonly phase: "set" | "clear";
      readonly loci: readonly CoordinateLocus[];
      readonly memberId?: string;
    }): string => {
      const correlationId = crypto.randomUUID();
      harness.fabric.publish({
        id: crypto.randomUUID(),
        type: "interaction.native",
        version: "0.1.0",
        source: { component: options.componentId },
        correlationId,
        timestamp: new Date().toISOString(),
        payload: {
          interactionId: `p60-${correlationId}`,
          interaction: options.interaction,
          phase: options.phase,
          origin: {
            componentId: options.componentId,
            ...(options.componentId === "alignment"
              ? {
                  documentId: document.id,
                  viewId: "PF00042.29-main",
                  alignmentId: "PF00042.29",
                  ...(options.memberId === undefined
                    ? {}
                    : { alignmentMemberId: options.memberId }),
                }
              : {}),
          },
          loci: options.loci,
        } as never,
      });
      return correlationId;
    };
    const byCorrelation = (correlationId: string, type: string, target?: string) =>
      observed.filter(
        (item) =>
          item.correlationId === correlationId &&
          item.type === type &&
          (target === undefined ||
            (item.target !== undefined &&
              "component" in item.target &&
              item.target.component === target)),
      );
    const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

    const queryForward = publish({
      componentId: "alignment",
      interaction: "hover",
      phase: "set",
      memberId: query.id,
      loci: [point(alignmentColumnSpace, 0), point(p69905SequenceSpace, 26)],
    });
    await settle();
    const forwardApply = byCorrelation(queryForward, "interaction.highlight.apply", "structure");
    expect(forwardApply).toHaveLength(1);
    const forwardMessage = forwardApply[0];
    if (forwardMessage === undefined) throw new Error("forward application missing");
    expect(
      (forwardMessage.payload as { loci?: readonly CoordinateLocus[] }).loci?.[0]?.space,
    ).toEqual(actualMolstarSpace);
    expect(
      byCorrelation(queryForward, "alignment-structure.mapping")[0]?.payload as {
        status?: string;
        translatorIds?: readonly string[];
      },
    ).toMatchObject({
      status: "exact",
      translatorIds: [
        `p60.PF00042.29.column-to-${query.id}`,
        "p60.P69905.sequence-to-1A3N-chain-A",
      ],
    });

    const nonQuery = publish({
      componentId: "alignment",
      interaction: "hover",
      phase: "set",
      memberId: other.id,
      loci: [point(alignmentColumnSpace, 0)],
    });
    await settle();
    expect(byCorrelation(nonQuery, "interaction.highlight.apply", "structure")).toHaveLength(0);
    expect(
      byCorrelation(nonQuery, "alignment-structure.mapping")[0]?.payload as { status?: string },
    ).toMatchObject({ status: "unmapped" });

    const queryGap = publish({
      componentId: "alignment",
      interaction: "hover",
      phase: "set",
      memberId: query.id,
      loci: [point(alignmentColumnSpace, 21)],
    });
    await settle();
    expect(byCorrelation(queryGap, "interaction.highlight.apply", "structure")).toHaveLength(0);
    expect(byCorrelation(queryGap, "interaction.highlight.clear", "structure")).toHaveLength(1);
    expect(
      byCorrelation(queryGap, "alignment-structure.mapping")[0]?.payload as {
        status?: string;
        translatorIds?: readonly string[];
      },
    ).toMatchObject({ status: "unmapped", translatorIds: expect.any(Array) });

    const structureLocus: CoordinateLocus = {
      kind: "point",
      space: actualMolstarSpace,
      position: { kind: "label", value: "label:26|auth:26" },
    };
    const reverse = publish({
      componentId: "structure",
      interaction: "hover",
      phase: "set",
      loci: [structureLocus],
    });
    await settle();
    const reverseApply = byCorrelation(reverse, "interaction.highlight.apply", "alignment");
    expect(reverseApply).toHaveLength(1);
    const reverseMessage = reverseApply[0];
    if (reverseMessage === undefined) throw new Error("reverse application missing");
    expect((reverseMessage.payload as { loci?: readonly CoordinateLocus[] }).loci).toEqual([
      point(alignmentColumnSpace, 0),
      point(p69905SequenceSpace, 26),
    ]);
    const reverseMapping = byCorrelation(reverse, "alignment-structure.mapping")[0];
    if (reverseMapping === undefined) throw new Error("reverse mapping diagnostic missing");
    expect((reverseMapping.payload as { translatorIds?: readonly string[] }).translatorIds).toEqual(
      ["p60.1A3N-chain-A-to-P69905.sequence", `p60.${query.id}-to-PF00042.29.column`],
    );

    const selection = publish({
      componentId: "alignment",
      interaction: "select",
      phase: "set",
      memberId: query.id,
      loci: [point(alignmentColumnSpace, 0), point(p69905SequenceSpace, 26)],
    });
    await settle();
    const localSelection = byCorrelation(selection, "interaction.selection.apply", "alignment");
    expect(localSelection).toHaveLength(1);
    const selectionMessage = localSelection[0];
    if (selectionMessage === undefined) throw new Error("local selection missing");
    const selectionLoci = (selectionMessage.payload as { loci?: readonly CoordinateLocus[] }).loci;
    expect(selectionLoci?.[0]).toEqual(point(alignmentColumnSpace, 0));
    expect(selectionLoci?.some((locus) => locus.space.kind === "sequence")).toBe(true);
    expect(byCorrelation(selection, "interaction.selection.apply", "structure")).toHaveLength(1);

    const clear = publish({
      componentId: "alignment",
      interaction: "select",
      phase: "clear",
      memberId: query.id,
      loci: [],
    });
    await settle();
    expect(byCorrelation(clear, "interaction.selection.clear", "alignment")).toHaveLength(1);
    expect(byCorrelation(clear, "interaction.selection.clear", "structure")).toHaveLength(1);
    expect(observed.filter((item) => item.type === "interaction.native")).toHaveLength(6);

    const appliedQuery = publish({
      componentId: "alignment",
      interaction: "hover",
      phase: "set",
      memberId: query.id,
      loci: [point(alignmentColumnSpace, 0)],
    });
    await settle();
    expect(byCorrelation(appliedQuery, "interaction.highlight.apply", "structure")).toHaveLength(1);
    const replacementByNonQuery = publish({
      componentId: "alignment",
      interaction: "hover",
      phase: "set",
      memberId: other.id,
      loci: [point(alignmentColumnSpace, 0)],
    });
    await settle();
    expect(
      byCorrelation(replacementByNonQuery, "interaction.highlight.apply", "structure"),
    ).toHaveLength(0);
    const replacementClear = byCorrelation(
      replacementByNonQuery,
      "interaction.highlight.clear",
      "structure",
    );
    expect(replacementClear).toHaveLength(1);
    const replacementClearMessage = replacementClear[0];
    if (replacementClearMessage === undefined) throw new Error("replacement clear missing");
    expect(
      (replacementClearMessage.payload as { owner?: { correlationId?: string } }).owner
        ?.correlationId,
    ).toBe(appliedQuery);

    const slowForwardGate = delayNextMapTo("structure-residue");
    const slowForward = publish({
      componentId: "alignment",
      interaction: "hover",
      phase: "set",
      memberId: query.id,
      loci: [point(alignmentColumnSpace, 0)],
    });
    await slowForwardGate.entered.promise;
    const cancelForward = publish({
      componentId: "alignment",
      interaction: "hover",
      phase: "clear",
      memberId: query.id,
      loci: [],
    });
    await settle();
    slowForwardGate.release.resolve();
    await settle();
    expect(byCorrelation(cancelForward, "interaction.highlight.clear", "structure")).toHaveLength(
      1,
    );
    expect(byCorrelation(slowForward, "interaction.highlight.apply", "structure")).toHaveLength(0);

    const cleanReverse = publish({
      componentId: "structure",
      interaction: "hover",
      phase: "clear",
      loci: [],
    });
    await settle();
    expect(byCorrelation(cleanReverse, "interaction.highlight.clear", "alignment")).toHaveLength(1);
    const slowReverseGate = delayNextMapTo("sequence");
    const slowReverse = publish({
      componentId: "structure",
      interaction: "hover",
      phase: "set",
      loci: [structureLocus],
    });
    await slowReverseGate.entered.promise;
    const cancelReverse = publish({
      componentId: "structure",
      interaction: "hover",
      phase: "clear",
      loci: [],
    });
    await settle();
    slowReverseGate.release.resolve();
    await settle();
    expect(byCorrelation(cancelReverse, "interaction.highlight.clear", "alignment")).toHaveLength(
      1,
    );
    expect(byCorrelation(slowReverse, "interaction.highlight.apply", "alignment")).toHaveLength(0);

    await harness.disposeAsync();
    const afterDispose = observed.length;
    publish({
      componentId: "alignment",
      interaction: "hover",
      phase: "set",
      memberId: query.id,
      loci: [point(alignmentColumnSpace, 0)],
    });
    await settle();
    expect(observed).toHaveLength(afterDispose);
  });
});
