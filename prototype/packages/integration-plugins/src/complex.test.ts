import {
  type ComponentFactory,
  createApplicationHarness,
  type HarnessMessage,
} from "@seq-star/harness-core";
import type { CoordinateLocus } from "@seq-star/seq-coords";
import { MVSData } from "molstar/lib/extensions/mvs/index.js";
import { describe, expect, it } from "vitest";
import confidenceText from "../../../fixtures/complex/expected/synthetic-confidence.tsv?raw";
import contactsText from "../../../fixtures/complex/mappings/1BRS-chain-A-D-heavy-atom-contacts.tsv?raw";
import barnaseText from "../../../fixtures/complex/mappings/P00648-1BRS-chain-A.tsv?raw";
import barstarText from "../../../fixtures/complex/mappings/P11540-1BRS-chain-D.tsv?raw";
import {
  barnaseSequenceSpace,
  barnaseStructureSpace,
  barstarSequenceSpace,
  barstarStructureSpace,
  type ComplexMvsGeneration,
  createComplexMappingTranslators,
  createComplexPlugin,
  createComplexSeqViewSpec,
  generateComplexMvs,
  parseComplexContactsTsv,
  parseComplexMappingTsv,
  parseSyntheticConfidenceTsv,
} from "./complex.js";
import {
  countMvsRepresentationTypes,
  countMvsTreeNodes,
  queryMvsTree,
} from "./mvs-presentation.js";

const barnaseRows = parseComplexMappingTsv(barnaseText);
const barstarRows = parseComplexMappingTsv(barstarText);
const contacts = parseComplexContactsTsv(contactsText);
const confidence = parseSyntheticConfidenceTsv(confidenceText);

describe("P50 frozen 1BRS complex integration", () => {
  it("uses the approved transforms exactly, including missing coordinates and verified construct conflicts", () => {
    expect(barnaseRows).toHaveLength(157);
    expect(barstarRows).toHaveLength(90);
    expect(barnaseRows.filter((row) => row.status === "exact")).toHaveLength(108);
    expect(
      barnaseRows
        .filter((row) => row.status === "missing_coordinate")
        .map((row) => row.sourceIndex + 1),
    ).toEqual([48, 49]);
    expect(
      barstarRows
        .filter((row) => row.status === "missing_coordinate")
        .map((row) => row.sourceIndex + 1),
    ).toEqual([65, 66]);
    expect(
      barstarRows
        .filter((row) => row.status === "exact_conflict")
        .map((row) => ({
          position: row.sourceIndex + 1,
          residue: row.sourceResidue,
          structure: row.structureResidue,
        })),
    ).toEqual([
      { position: 41, residue: "C", structure: "ALA" },
      { position: 83, residue: "C", structure: "ALA" },
    ]);
    expect(contacts).toHaveLength(43);
    expect(new Set(contacts.map((contact) => contact.barnaseIndex)).size).toBe(19);
    expect(new Set(contacts.map((contact) => contact.barstarIndex)).size).toBe(16);
    expect(confidence).toHaveLength(199);
    for (const row of confidence) {
      const seed = row.polymerId === "barnase" ? 11 : 23;
      expect(row.score).toBe(70 + ((row.maturePosition * 37 + seed) % 31));
    }
    expect(confidence[0]).toEqual({
      polymerId: "barnase",
      accession: "P00648",
      maturePosition: 1,
      sourceIndex: 47,
      score: 87,
    });
    expect(
      confidence.find((row) => row.polymerId === "barstar" && row.maturePosition === 1)?.score,
    ).toBe(99);
  });

  it("maps only registered named polymer/chain pairs and preserves missing and conflict semantics", async () => {
    const [barnaseForward, barnaseReverse] = createComplexMappingTranslators(barnaseRows);
    const [barstarForward, barstarReverse] = createComplexMappingTranslators(barstarRows);
    const signal = new AbortController().signal;
    const barnase = await barnaseForward.map(
      {
        loci: [{ kind: "interval", space: barnaseSequenceSpace, start: 47, end: 51 }],
        target: barnaseStructureSpace,
      },
      signal,
    );
    expect(barnase.associations[0]).toMatchObject({ status: "partial" });
    expect(barnase.associations[0]?.targets).toHaveLength(2);
    const missing = await barstarForward.map(
      {
        loci: [
          { kind: "point", space: barstarSequenceSpace, position: { kind: "index", value: 64 } },
        ],
        target: barstarStructureSpace,
      },
      signal,
    );
    expect(missing.associations[0]).toMatchObject({ status: "unmapped", targets: [] });
    const conflict = await barstarForward.map(
      {
        loci: [
          { kind: "point", space: barstarSequenceSpace, position: { kind: "index", value: 40 } },
        ],
        target: barstarStructureSpace,
      },
      signal,
    );
    expect(conflict.associations[0]).toMatchObject({
      status: "exact",
      details: { residueConflicts: 1 },
    });
    const reverse = await barstarReverse.map(
      { loci: conflict.associations[0]?.targets ?? [], target: barstarSequenceSpace },
      signal,
    );
    expect(reverse.associations[0]).toMatchObject({
      status: "exact",
      details: { residueConflict: true },
    });
    const wrongChain = await barnaseForward.map(
      {
        loci: [
          { kind: "point", space: barstarSequenceSpace, position: { kind: "index", value: 40 } },
        ],
        target: barnaseStructureSpace,
      },
      signal,
    );
    expect(wrongChain.associations[0]).toMatchObject({ status: "unmapped", targets: [] });
    expect(barnaseReverse.id).not.toBe(barstarReverse.id);
  });

  it("builds an assembly, not an alignment, with 43 role-preserving contacts and exact synthetic labelling", () => {
    const document = createComplexSeqViewSpec({
      barnaseResidues: "A".repeat(157),
      barstarResidues: "A".repeat(90),
      confidence,
      contacts,
    });
    expect(document.alignments).toBeUndefined();
    expect(document.assemblies?.[0]?.members.map((member) => member.id)).toEqual([
      "barnase-chain-A",
      "barstar-chain-D",
    ]);
    expect(document.views[0]?.context).toEqual({ assembly: "complex-1BRS-assembly" });
    expect(document.views[0]?.axis.segments.map((segment) => segment.space)).toEqual([
      barnaseSequenceSpace.id,
      barstarSequenceSpace.id,
    ]);
    expect(document.views[0]?.axis.gap).toBe(32);
    const annotations = document.annotations ?? [];
    const barnaseRegions = annotations.find((annotation) => annotation.id === "barnase-regions");
    const barstarRegions = annotations.find((annotation) => annotation.id === "barstar-regions");
    expect(barnaseRegions).toMatchObject({
      kind: "loci",
      provenance: {
        label: "P00648 precursor, signal peptide, propeptide, and mature-chain boundaries",
      },
    });
    expect(barstarRegions).toMatchObject({
      kind: "loci",
      provenance: { label: "P11540 initiator-methionine and mature-chain boundaries" },
    });
    if (barnaseRegions?.kind !== "loci" || barstarRegions?.kind !== "loci")
      throw new Error("Missing named polymer region annotations.");
    expect(barnaseRegions.items.map((item) => item.loci[0])).toEqual([
      { kind: "interval", space: barnaseSequenceSpace.id, start: 0, end: 34 },
      { kind: "interval", space: barnaseSequenceSpace.id, start: 34, end: 47 },
      { kind: "interval", space: barnaseSequenceSpace.id, start: 47, end: 157 },
    ]);
    expect(barstarRegions.items.map((item) => item.loci[0])).toEqual([
      { kind: "interval", space: barstarSequenceSpace.id, start: 0, end: 1 },
      { kind: "interval", space: barstarSequenceSpace.id, start: 1, end: 90 },
    ]);
    expect(
      document.views[0]?.sections
        .flatMap((section) => section.tracks)
        .find((track) => track.id === "polymer-regions")
        ?.layers.map((layer) => ("annotation" in layer ? layer.annotation : undefined)),
    ).toEqual(["barnase-regions", "barstar-regions"]);
    expect(
      annotations.find((annotation) => annotation.id === "barnase-confidence")?.provenance?.label,
    ).toBe("Synthetic confidence — deterministic prototype values, not a biological prediction");
    const relationship = annotations.find(
      (annotation) => annotation.id === "barnase-barstar-contacts",
    );
    expect(relationship).toMatchObject({ kind: "relationships" });
    if (relationship?.kind !== "relationships")
      throw new Error("Missing relationships annotation.");
    expect(relationship.items).toHaveLength(43);
    expect(relationship.items[0]?.properties?.frozenContactId).toBe("1brs-A-D-001");
    expect(relationship.items[0]?.endpoints.map((endpoint) => endpoint.role)).toEqual([
      "barnase",
      "barstar",
    ]);
    expect(relationship.items[0]?.endpoints.flatMap((endpoint) => endpoint.loci)).toEqual([
      { kind: "point", space: barnaseSequenceSpace.id, position: 73 },
      { kind: "point", space: barstarSequenceSpace.id, position: 38 },
    ]);
  });

  it("fails closed for contradictory activation and relationship inputs", () => {
    const common = {
      contacts,
      structureUrl: "/fixtures/1BRS.cif",
      requestId: "invalid",
    };
    expect(() =>
      generateComplexMvs({
        ...common,
        activation: "unknown",
      } as unknown as Parameters<typeof generateComplexMvs>[0]),
    ).toThrow("Unsupported complex MVS activation 'unknown'");
    expect(() =>
      generateComplexMvs({
        ...common,
        activation: null,
      } as unknown as Parameters<typeof generateComplexMvs>[0]),
    ).toThrow("Unsupported complex MVS activation 'null'");
    expect(() =>
      generateComplexMvs({
        ...common,
        activation: "interface",
        relationshipId: "1brs-A-D-001",
      } as unknown as Parameters<typeof generateComplexMvs>[0]),
    ).toThrow("Interface activation must not include a relationship ID");
    expect(() =>
      generateComplexMvs({
        ...common,
        activation: "contact",
      } as unknown as Parameters<typeof generateComplexMvs>[0]),
    ).toThrow("Contact activation requires a nonempty relationship ID");
    expect(() =>
      generateComplexMvs({
        ...common,
        activation: "contact",
        relationshipId: "   ",
      }),
    ).toThrow("Contact activation requires a nonempty relationship ID");
  });

  it("uses proportional, deterministic MVS profiles for every frozen interface endpoint or one contact", () => {
    const interfaceMvs = generateComplexMvs({
      contacts,
      structureUrl: "/fixtures/1BRS.cif",
      requestId: "interface",
      activation: "interface",
    });
    expect(MVSData.validationIssues(interfaceMvs.document, { noExtra: true })).toBeUndefined();
    expect(interfaceMvs.document.metadata.description).toBe(
      "Two role-colored cartoons with all mapped interface endpoints recolored and no atomic-detail representation.",
    );
    expect(interfaceMvs.mappedContactIds).toEqual(contacts.map((contact) => contact.id));
    expect(
      interfaceMvs.endpointRoles.map((endpoint) => [endpoint.role, endpoint.selectors.length]),
    ).toEqual([
      ["barnase", 19],
      ["barstar", 16],
    ]);
    expect(interfaceMvs.endpointRoles).toEqual([
      {
        role: "barnase",
        selectors: expect.arrayContaining(
          contacts.map((contact) => ({
            label_entity_id: "1",
            label_asym_id: "A",
            auth_asym_id: "A",
            label_seq_id: contact.barnaseLabelSeqId,
            auth_seq_id: contact.barnaseAuthSeqId,
          })),
        ),
      },
      {
        role: "barstar",
        selectors: expect.arrayContaining(
          contacts.map((contact) => ({
            label_entity_id: "2",
            label_asym_id: "D",
            auth_asym_id: "D",
            label_seq_id: contact.barstarLabelSeqId,
            auth_seq_id: contact.barstarAuthSeqId,
          })),
        ),
      },
    ]);
    expect(countMvsRepresentationTypes(interfaceMvs.document)).toEqual({ cartoon: 2 });
    expect(countMvsTreeNodes(interfaceMvs.document)).toMatchObject({ component: 2 });
    expect(countMvsTreeNodes(interfaceMvs.document).focus ?? 0).toBe(0);
    expect(queryMvsTree(interfaceMvs.document, "color").map((node) => node.params)).toEqual([
      { color: "#BFDBFE" },
      { color: "#2563EB", selector: interfaceMvs.endpointRoles[0]?.selectors },
      { color: "#FDE68A" },
      { color: "#D97706", selector: interfaceMvs.endpointRoles[1]?.selectors },
    ]);
    const selected = generateComplexMvs({
      contacts,
      structureUrl: "/fixtures/1BRS.cif",
      requestId: "contact",
      activation: "contact",
      relationshipId: "1brs-A-D-001",
    });
    expect(selected.relationshipId).toBe("1brs-A-D-001");
    expect(selected.document.metadata.description).toBe(
      "Two role-colored cartoons with bounded ball-and-stick atomic detail for both endpoints of contact 1brs-A-D-001 and a union focus.",
    );
    expect(selected.endpointRoles.map((endpoint) => endpoint.selectors[0])).toEqual([
      {
        label_entity_id: "1",
        label_asym_id: "A",
        auth_asym_id: "A",
        label_seq_id: 27,
        auth_seq_id: 27,
      },
      {
        label_entity_id: "2",
        label_asym_id: "D",
        auth_asym_id: "D",
        label_seq_id: 38,
        auth_seq_id: 38,
      },
    ]);
    expect(MVSData.validationIssues(selected.document, { noExtra: true })).toBeUndefined();
    expect(countMvsRepresentationTypes(selected.document)).toEqual({
      ball_and_stick: 2,
      cartoon: 2,
    });
    expect(countMvsTreeNodes(selected.document)).toMatchObject({ component: 5, focus: 1 });
    const focus = queryMvsTree(selected.document, "focus")[0];
    expect(focus).toBeDefined();
    const focusParent = queryMvsTree(selected.document, "component").find((component) =>
      component.children?.some((child) => child.kind === "focus"),
    );
    expect(focusParent?.params).toEqual({
      selector: selected.endpointRoles.flatMap((endpoint) => endpoint.selectors),
    });
    const reordered = generateComplexMvs({
      contacts: [...contacts].reverse(),
      structureUrl: "/fixtures/1BRS.cif",
      requestId: "contact-reordered",
      activation: "contact",
      relationshipId: "1brs-A-D-001",
    });
    expect(JSON.stringify(queryMvsTree(selected.document))).toBe(
      JSON.stringify(queryMvsTree(reordered.document)),
    );
  });

  it("publishes each inspectable complete document before its targeted MVS request in replacement order", async () => {
    const factory = (type: string, capabilities: readonly string[]): ComponentFactory => ({
      type,
      create({ id }) {
        return {
          id,
          capabilities,
          async start(componentContext) {
            if (type === "test.sequence")
              componentContext.reportCoordinateSpaces([barnaseSequenceSpace, barstarSequenceSpace]);
            else
              componentContext.reportCoordinateSpaces([
                barnaseStructureSpace,
                barstarStructureSpace,
              ]);
          },
          dispose() {},
        };
      },
    });
    const harness = createApplicationHarness(
      {
        id: "p50-test",
        components: [
          { id: "sequence", type: "test.sequence" },
          { id: "structure", type: "test.structure" },
        ],
        plugins: [{ id: "p50", plugin: "test.p50" }],
        synchronization: [
          {
            id: "p50-selection",
            interaction: "select",
            between: ["sequence", "structure"],
            unmapped: "preserve",
          },
        ],
      },
      {
        componentFactories: [
          factory("test.sequence", ["seqstar:format/seqviewspec"]),
          factory("test.structure", ["seqstar:format/mvs"]),
        ],
        pluginFactories: [
          {
            plugin: "test.p50",
            create: () =>
              createComplexPlugin({
                sequenceComponent: "sequence",
                structureComponent: "structure",
                barnaseMappingTsv: barnaseText,
                barstarMappingTsv: barstarText,
                contactsTsv: contactsText,
                confidenceTsv: confidenceText,
                barnaseResidues: "A".repeat(157),
                barstarResidues: "A".repeat(90),
                structureUrl: "/fixtures/1BRS.cif",
              }),
          },
        ],
      },
    );
    const observed: HarnessMessage[] = [];
    harness.fabric.observe().subscribe((item) => observed.push(item));
    await harness.start();
    const publish = (type: string, payload: unknown, correlationId = crypto.randomUUID()) =>
      harness.fabric.publish({
        id: crypto.randomUUID(),
        type,
        version: "0.1.0",
        source: { component: "sequence" },
        correlationId,
        timestamp: new Date().toISOString(),
        payload: payload as never,
      });
    publish("lifecycle.visualization", {
      requestId: "P50-sequence-initial",
      generation: 1,
      componentId: "sequence",
      status: "accepted",
      diagnostics: [],
    });
    const activate = (trackId: "interface" | "contacts") => {
      const correlationId = crypto.randomUUID();
      publish(
        "interaction.native",
        {
          interactionId: crypto.randomUUID(),
          interaction: "track-activate",
          phase: "set",
          origin: {
            componentId: "sequence",
            documentId: "complex-1BRS-barnase-barstar",
            viewId: "complex-1BRS-main",
            trackId,
          },
          loci: [],
        },
        correlationId,
      );
    };
    activate("interface");
    activate("contacts");
    await new Promise((resolve) => setTimeout(resolve, 40));
    const generated = observed.filter((item) => item.type === "document.generated.mvs");
    const requests = observed.filter(
      (item) =>
        item.type === "visualization.mvs.request" &&
        (item.payload as { requestId?: string }).requestId?.startsWith("P50-interface-"),
    );
    expect(generated).toHaveLength(2);
    expect(requests).toHaveLength(2);
    const latest = generated[1];
    const latestRequest = requests[1];
    if (latest === undefined || latestRequest === undefined)
      throw new Error("Expected generated MVS messages.");
    expect((latest.payload as unknown as ComplexMvsGeneration).requestId).toContain(
      "P50-interface-2",
    );
    expect(observed.indexOf(latest)).toBeLessThan(observed.indexOf(latestRequest));
    expect((latestRequest.payload as { requestId?: string }).requestId).toBe(
      (latest.payload as unknown as ComplexMvsGeneration).requestId,
    );

    const relationshipCorrelation = crypto.randomUUID();
    const relationshipInteraction = crypto.randomUUID();
    publish(
      "interaction.native",
      {
        interactionId: relationshipInteraction,
        interaction: "select",
        phase: "set",
        origin: {
          componentId: "sequence",
          documentId: "complex-1BRS-barnase-barstar",
          viewId: "complex-1BRS-main",
          trackId: "contacts",
          layerId: "contact-links",
        },
        semanticTarget: {
          annotationId: "barnase-barstar-contacts",
          itemId: "contact-1brs-A-D-001",
          endpointRole: "barnase",
          locusIndex: 0,
        },
        loci: [
          {
            kind: "point",
            space: barnaseSequenceSpace,
            position: { kind: "index", value: 73 },
          },
        ],
      },
      relationshipCorrelation,
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    const relationshipGenerated = observed.find(
      (item) =>
        item.correlationId === relationshipCorrelation && item.type === "document.generated.mvs",
    );
    const relationshipRequest = observed.find(
      (item) =>
        item.correlationId === relationshipCorrelation && item.type === "visualization.mvs.request",
    );
    if (relationshipGenerated === undefined || relationshipRequest === undefined)
      throw new Error("Expected relationship MVS generation and request.");
    const relationshipDocument = relationshipGenerated.payload as unknown as ComplexMvsGeneration;
    expect(relationshipDocument.relationshipId).toBe("1brs-A-D-001");
    expect(relationshipDocument.endpointRoles.map((endpoint) => endpoint.role)).toEqual([
      "barnase",
      "barstar",
    ]);
    expect(observed.indexOf(relationshipGenerated)).toBeLessThan(
      observed.indexOf(relationshipRequest),
    );
    expect(
      observed.filter(
        (item) =>
          item.correlationId === relationshipCorrelation && item.type === "interaction.focus.apply",
      ),
    ).toHaveLength(0);
    publish(
      "lifecycle.visualization",
      {
        requestId: relationshipDocument.requestId,
        generation: 1,
        componentId: "structure",
        status: "rendered",
        visibleRequestId: relationshipDocument.requestId,
        diagnostics: [],
      },
      relationshipCorrelation,
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    const focus = observed.filter(
      (item) =>
        item.correlationId === relationshipCorrelation &&
        item.type === "interaction.focus.apply" &&
        item.target !== undefined &&
        "component" in item.target &&
        item.target.component === "structure",
    );
    expect(focus).toHaveLength(2);
    expect(observed.indexOf(relationshipRequest)).toBeLessThan(
      observed.indexOf(focus[0] as HarnessMessage),
    );
    expect(
      focus.map((item) => {
        const payload = item.payload as unknown as {
          interactionId: string;
          owner: { correlationId: string; sourceComponent: string };
          loci: readonly CoordinateLocus[];
          semanticTarget: { relationshipId: string; endpointRole: string };
        };
        return {
          interactionId: payload.interactionId,
          owner: payload.owner,
          relationshipId: payload.semanticTarget.relationshipId,
          role: payload.semanticTarget.endpointRole,
          chain: payload.loci[0]?.space.context?.["label-asym"],
          position:
            payload.loci[0] !== undefined && payload.loci[0].kind === "point"
              ? payload.loci[0].position
              : undefined,
          locusCount: payload.loci.length,
        };
      }),
    ).toEqual([
      {
        interactionId: `${relationshipInteraction}:barnase`,
        owner: { correlationId: relationshipCorrelation, sourceComponent: "sequence" },
        relationshipId: "1brs-A-D-001",
        role: "barnase",
        chain: "A",
        position: { kind: "label", value: "label:27|auth:27" },
        locusCount: 1,
      },
      {
        interactionId: `${relationshipInteraction}:barstar`,
        owner: { correlationId: relationshipCorrelation, sourceComponent: "sequence" },
        relationshipId: "1brs-A-D-001",
        role: "barstar",
        chain: "D",
        position: { kind: "label", value: "label:38|auth:38" },
        locusCount: 1,
      },
    ]);
    publish(
      "lifecycle.visualization",
      {
        requestId: relationshipDocument.requestId,
        generation: 1,
        componentId: "structure",
        status: "rendered",
        visibleRequestId: relationshipDocument.requestId,
        diagnostics: [],
      },
      relationshipCorrelation,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(
      observed.filter(
        (item) =>
          item.correlationId === relationshipCorrelation && item.type === "interaction.focus.apply",
      ),
    ).toHaveLength(2);
    publish(
      "interaction.native",
      {
        interactionId: relationshipInteraction,
        interaction: "select",
        phase: "clear",
        origin: { componentId: "sequence" },
        loci: [],
      },
      relationshipCorrelation,
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    const clears = observed.filter(
      (item) =>
        item.correlationId === relationshipCorrelation && item.type === "interaction.focus.clear",
    );
    expect(clears).toHaveLength(2);
    expect(
      clears.map((item) => (item.payload as unknown as { interactionId: string }).interactionId),
    ).toEqual([`${relationshipInteraction}:barnase`, `${relationshipInteraction}:barstar`]);
    expect(
      observed.filter(
        (item) =>
          item.correlationId === relationshipCorrelation && item.type === "document.generated.mvs",
      ),
    ).toHaveLength(1);
    expect(
      observed.filter(
        (item) =>
          item.correlationId === relationshipCorrelation &&
          item.type === "interaction.native" &&
          item.source !== undefined &&
          "component" in item.source &&
          item.source.component === "structure",
      ),
    ).toHaveLength(0);
    await harness.disposeAsync();
  });
});
