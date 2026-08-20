import type { HarnessMessage } from "@seq-star/harness-core";
import { describe, expect, it } from "vitest";
import {
  commitInspectValidation,
  emptyInspectPanelState,
  type InspectPanelState,
  prepareInspectDownload,
  reduceInspectPanelMessage,
  safeInspectJson,
} from "./inspect-panel-state";

const targets = { sequenceComponent: "sequence", structureComponent: "structure" };
const id = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const message = (
  index: number,
  type: string,
  payload: unknown,
  options: {
    readonly target?: string;
    readonly correlation?: number;
    readonly causation?: number;
    readonly sourcePlugin?: string;
    readonly sourceComponent?: string;
  } = {},
): HarnessMessage => ({
  id: id(index),
  type,
  version: "0.1.0",
  source:
    options.sourceComponent === undefined
      ? { plugin: options.sourcePlugin ?? "datasets" }
      : { component: options.sourceComponent },
  ...(options.target === undefined ? {} : { target: { component: options.target } }),
  correlationId: id(options.correlation ?? index),
  ...(options.causation === undefined ? {} : { causationId: id(options.causation) }),
  timestamp: "2026-08-20T00:00:00.000Z",
  payload: payload as never,
});

const request = (
  index: number,
  format: "seqviewspec" | "mvs",
  requestId: string,
  documentId: string,
  correlation = index,
): HarnessMessage =>
  message(
    index,
    `visualization.${format}.request`,
    {
      requestId,
      document: { id: documentId, root: { kind: "root" } },
      ...(format === "seqviewspec" ? { viewId: `${documentId}-view` } : {}),
    },
    {
      target: format === "seqviewspec" ? "sequence" : "structure",
      correlation,
      causation: correlation,
    },
  );

const lifecycle = (
  index: number,
  requestMessage: HarnessMessage,
  componentId: "sequence" | "structure",
  status: string,
  extra: Readonly<Record<string, unknown>> = {},
): HarnessMessage =>
  message(
    index,
    "lifecycle.visualization",
    {
      requestId: (requestMessage.payload as { requestId: string }).requestId,
      generation: index,
      componentId,
      status,
      ...extra,
    },
    {
      correlation: Number(requestMessage.correlationId.slice(-12)),
      causation: Number(requestMessage.id.slice(-12)),
      sourceComponent: componentId,
    },
  );

const reduce = (state: InspectPanelState, ...messages: readonly HarnessMessage[]) =>
  messages.reduce(
    (current, incoming) => reduceInspectPanelMessage(current, incoming, targets),
    state,
  );

const rendered = (
  state: InspectPanelState,
  requestMessage: HarnessMessage,
  component: "sequence" | "structure",
  start: number,
): InspectPanelState =>
  reduce(
    state,
    requestMessage,
    lifecycle(start, requestMessage, component, "accepted"),
    lifecycle(start + 1, requestMessage, component, "rendered", {
      generation: start,
      visibleRequestId: (requestMessage.payload as { requestId: string }).requestId,
    }),
  );

const activeSequenceState = (): InspectPanelState => {
  const sequence = request(10, "seqviewspec", "sequence-A", "dataset-A", 9);
  return reduce(
    rendered(emptyInspectPanelState(), sequence, "sequence", 11),
    message(13, "dataset.catalog.ready", {
      initialDatasetId: "A",
      datasets: [
        {
          id: "A",
          label: "Dataset A",
          viewId: "dataset-A-view",
          seqViewSpec: { id: "dataset-A" },
        },
      ],
    }),
    message(14, "dataset.status", {
      datasetId: "A",
      generation: 1,
      status: "active",
      sequenceRequestId: "sequence-A",
      structureRequestId: "structure-A",
    }),
  );
};

describe("inspect panel visible-document state", () => {
  it("keeps visible A while B is accepted and when B fails with the prior view retained", () => {
    const a = request(20, "mvs", "A", "mvs-A");
    const b = request(30, "mvs", "B", "mvs-B");
    let state = rendered(activeSequenceState(), a, "structure", 21);
    state = reduce(state, b, lifecycle(31, b, "structure", "accepted"));
    expect(state.structureDocument).toMatchObject({ requestId: "A", lifecycle: "rendered" });
    expect(state.pendingStructureDocument).toMatchObject({ requestId: "B", lifecycle: "accepted" });
    state = reduce(
      state,
      lifecycle(32, b, "structure", "failed", {
        generation: 31,
        previousView: "retained",
        visibleRequestId: "A",
      }),
    );
    expect(state.structureDocument?.requestId).toBe("A");
    expect(state.pendingStructureDocument).toBeUndefined();
  });

  it("clears a visible document only when a matching failure reports cleared", () => {
    const a = request(40, "mvs", "A", "mvs-A");
    const b = request(50, "mvs", "B", "mvs-B");
    let state = rendered(activeSequenceState(), a, "structure", 41);
    state = reduce(
      state,
      b,
      lifecycle(51, b, "structure", "accepted"),
      lifecycle(52, b, "structure", "failed", {
        generation: 51,
        previousView: "cleared",
      }),
    );
    expect(state.structureDocument).toBeUndefined();
    expect(state.pendingStructureDocument).toBeUndefined();
  });

  it("promotes B only on matching rendered/degraded lifecycle and preserves envelope identity", () => {
    const a = request(60, "mvs", "A", "mvs-A");
    const b = request(70, "mvs", "B", "mvs-B");
    let state = rendered(activeSequenceState(), a, "structure", 61);
    state = reduce(state, b, lifecycle(71, b, "structure", "accepted"));
    expect(state.structureDocument?.requestId).toBe("A");
    state = reduce(
      state,
      lifecycle(72, b, "structure", "rendered", { generation: 71, visibleRequestId: "B" }),
    );
    expect(state.structureDocument).toMatchObject({
      requestId: "B",
      identity: b.id,
      lifecycle: "rendered",
    });
    expect(state.pendingStructureDocument).toBeUndefined();
  });

  it("discards a superseded candidate and honors visibleRequestId truth", () => {
    const a = request(80, "mvs", "A", "mvs-A");
    const b = request(90, "mvs", "B", "mvs-B");
    let state = rendered(activeSequenceState(), a, "structure", 81);
    state = reduce(
      state,
      b,
      lifecycle(91, b, "structure", "accepted"),
      lifecycle(92, b, "structure", "rendered", {
        generation: 91,
        visibleRequestId: "A",
      }),
    );
    expect(state.structureDocument?.requestId).toBe("A");
    expect(state.pendingStructureDocument?.requestId).toBe("B");
    state = reduce(state, lifecycle(93, b, "structure", "superseded", { generation: 91 }));
    expect(state.structureDocument?.requestId).toBe("A");
    expect(state.pendingStructureDocument).toBeUndefined();
  });

  it("rejects stale lifecycle when request IDs are reused but envelope causation differs", () => {
    const old = request(100, "mvs", "same", "old", 100);
    const current = request(110, "mvs", "same", "new", 110);
    let state = reduce(activeSequenceState(), old, current);
    state = reduce(
      state,
      lifecycle(111, old, "structure", "rendered", { visibleRequestId: "same" }),
    );
    expect(state.structureDocument).toBeUndefined();
    expect(state.pendingStructureDocument?.identity).toBe(current.id);
  });
});

describe("inspect panel generation binding", () => {
  const generationPayload = {
    documentId: "dataset-A",
    viewId: "dataset-A-view",
    trackId: "track",
    layerId: "layer",
    requestId: "generated",
    counts: { mapped: 1, partial: 0, ambiguous: 0, unmapped: 0 },
    mapping: [],
  };

  it("binds generated-before-request only by active document, source, correlation and causation", () => {
    let state = activeSequenceState();
    const generation = message(120, "document.generated.mvs", generationPayload, {
      correlation: 119,
      causation: 118,
    });
    const mvs = request(121, "mvs", "generated", "generated-mvs", 119);
    // Match the plugin intent causation shared by generated and request messages.
    const exactMvs = { ...mvs, causationId: id(118) };
    state = reduce(state, generation, exactMvs);
    expect(state.boundGeneration?.generation.requestId).toBe("generated");
    expect(state.unboundGenerations).toHaveLength(0);
    expect(state.generation).toBeUndefined();
    state = reduce(
      state,
      lifecycle(122, exactMvs, "structure", "accepted"),
      lifecycle(123, exactMvs, "structure", "rendered", {
        generation: 122,
        visibleRequestId: "generated",
      }),
    );
    expect(state.generation?.requestId).toBe("generated");
    expect(state.structureDocument?.identity).toBe(exactMvs.id);
  });

  it("replaces pending A with generated-before-request B and rejects late A generation", () => {
    const prior = request(200, "mvs", "prior", "prior-mvs", 199);
    const requestA = request(210, "mvs", "A", "mvs-A", 209);
    const generationB = message(
      220,
      "document.generated.mvs",
      { ...generationPayload, requestId: "B" },
      { correlation: 219, causation: 218 },
    );
    const requestB = {
      ...request(221, "mvs", "B", "mvs-B", 219),
      causationId: id(218),
    };
    let state = rendered(activeSequenceState(), prior, "structure", 201);
    state = reduce(state, requestA, generationB);
    expect(state.structureDocument?.requestId).toBe("prior");
    expect(state.pendingStructureDocument?.requestId).toBe("A");
    expect(state.boundGeneration).toBeUndefined();
    expect(state.unboundGenerations.map((item) => item.generation.requestId)).toEqual(["B"]);

    state = reduce(state, requestB);
    expect(state.pendingStructureDocument?.requestId).toBe("B");
    expect(state.boundGeneration?.generation.requestId).toBe("B");
    expect(state.unboundGenerations).toHaveLength(0);

    const lateGenerationA = message(
      222,
      "document.generated.mvs",
      { ...generationPayload, requestId: "A" },
      { correlation: 209, causation: 209 },
    );
    state = reduce(state, lateGenerationA);
    expect(state.boundGeneration?.generation.requestId).toBe("B");
    expect(state.unboundGenerations.map((item) => item.generation.requestId)).toEqual(["A"]);

    state = reduce(
      state,
      lifecycle(223, requestB, "structure", "accepted"),
      lifecycle(224, requestB, "structure", "rendered", {
        generation: 223,
        visibleRequestId: "B",
      }),
    );
    expect(state.structureDocument).toMatchObject({ requestId: "B", identity: requestB.id });
    expect(state.generation?.requestId).toBe("B");
  });

  it("does not bind generated B when the following targeted request does not match", () => {
    const generationB = message(
      230,
      "document.generated.mvs",
      { ...generationPayload, requestId: "B" },
      { correlation: 229, causation: 228 },
    );
    const unrelated = request(231, "mvs", "C", "mvs-C", 231);
    let state = reduce(activeSequenceState(), generationB);
    expect(state.unboundGenerations.map((item) => item.generation.requestId)).toEqual(["B"]);
    state = reduce(state, unrelated);
    expect(state.boundGeneration).toBeUndefined();
    expect(state.unboundGenerations.map((item) => item.generation.requestId)).toEqual(["B"]);
    state = reduce(
      state,
      lifecycle(232, unrelated, "structure", "accepted"),
      lifecycle(233, unrelated, "structure", "rendered", {
        generation: 232,
        visibleRequestId: "C",
      }),
    );
    expect(state.structureDocument?.requestId).toBe("C");
    expect(state.generation).toBeUndefined();
  });

  it("keeps bound B through request-history eviction and a late generation for A", () => {
    const prior = request(300, "mvs", "prior", "prior-mvs", 299);
    const requestA = request(310, "mvs", "A", "mvs-A", 309);
    const generationB = message(
      320,
      "document.generated.mvs",
      { ...generationPayload, requestId: "B", trackId: "track-B" },
      { correlation: 319, causation: 318 },
    );
    let currentB: HarnessMessage = {
      ...request(321, "mvs", "B", "mvs-B", 319),
      causationId: id(318),
    };
    let state = rendered(activeSequenceState(), prior, "structure", 301);
    state = reduce(state, requestA, generationB, currentB);
    expect(state.boundGeneration?.generation.trackId).toBe("track-B");

    for (let index = 0; index < 66; index += 1) {
      const unrelated = request(400 + index * 2, "mvs", `churn-${index}`, `mvs-${index}`);
      currentB = {
        ...request(401 + index * 2, "mvs", "B", "mvs-B", 319),
        causationId: id(318),
      };
      state = reduce(state, unrelated, currentB);
    }
    expect(state.structureRequestHistory).toHaveLength(64);
    expect(state.structureRequestHistory.some((item) => item.identity === requestA.id)).toBe(false);
    expect(state.boundGeneration?.generation.trackId).toBe("track-B");

    const lateA = message(
      600,
      "document.generated.mvs",
      { ...generationPayload, requestId: "A", trackId: "late-A" },
      { correlation: 309, causation: 309 },
    );
    state = reduce(state, lateA);
    expect(state.boundGeneration?.generation.trackId).toBe("track-B");
    expect(state.unboundGenerations.some((item) => item.generation.trackId === "late-A")).toBe(
      true,
    );

    state = reduce(
      state,
      lifecycle(601, currentB, "structure", "accepted"),
      lifecycle(602, currentB, "structure", "rendered", {
        generation: 601,
        visibleRequestId: "B",
      }),
    );
    expect(state.structureDocument?.requestId).toBe("B");
    expect(state.generation?.trackId).toBe("track-B");
  });

  it("bounds the unbound pool and never cross-binds reused request IDs", () => {
    let state = activeSequenceState();
    for (let index = 0; index < 70; index += 1)
      state = reduce(
        state,
        message(
          700 + index,
          "document.generated.mvs",
          {
            ...generationPayload,
            requestId: `pool-${index}`,
            trackId: `pool-${index}`,
          },
          { correlation: 800 + index, causation: 900 + index },
        ),
      );
    expect(state.unboundGenerations).toHaveLength(64);
    expect(state.unboundGenerations[0]?.generation.requestId).toBe("pool-6");

    const first = message(
      1000,
      "document.generated.mvs",
      { ...generationPayload, requestId: "same", trackId: "first-envelope" },
      { correlation: 1001, causation: 1002 },
    );
    const second = message(
      1010,
      "document.generated.mvs",
      { ...generationPayload, requestId: "same", trackId: "second-envelope" },
      { correlation: 1011, causation: 1012 },
    );
    state = reduce(state, first, second);
    const matchingSecond = {
      ...request(1020, "mvs", "same", "same-mvs", 1011),
      causationId: id(1012),
    };
    state = reduce(state, matchingSecond);
    expect(state.boundGeneration?.generation.trackId).toBe("second-envelope");
    expect(
      state.unboundGenerations.some((item) => item.generation.trackId === "first-envelope"),
    ).toBe(true);
  });

  it("ignores unrelated plugin generations and mismatched active documents", () => {
    let state = activeSequenceState();
    state = reduce(
      state,
      message(130, "document.generated.mvs", generationPayload, {
        correlation: 129,
        causation: 128,
        sourcePlugin: "other-plugin",
      }),
    );
    expect(state.boundGeneration).toBeUndefined();
    expect(state.unboundGenerations).toHaveLength(0);
    state = reduce(
      state,
      message(131, "document.generated.mvs", {
        ...generationPayload,
        documentId: "unrelated-document",
      }),
    );
    const mvs = request(132, "mvs", "generated", "generated-mvs", 129);
    state = reduce(state, { ...mvs, causationId: id(128) });
    expect(state.boundGeneration).toBeUndefined();
    expect(state.unboundGenerations).toHaveLength(0);
    expect(state.generation).toBeUndefined();
  });
});

describe("inspect panel safety", () => {
  it("clears pending request and generation pools on a newer dataset switch", () => {
    const generation = message(
      1100,
      "document.generated.mvs",
      {
        documentId: "dataset-A",
        viewId: "dataset-A-view",
        trackId: "track",
        layerId: "layer",
        requestId: "generated",
        counts: { mapped: 1, partial: 0, ambiguous: 0, unmapped: 0 },
        mapping: [],
      },
      { correlation: 1101, causation: 1102 },
    );
    const matching = {
      ...request(1103, "mvs", "generated", "mvs", 1101),
      causationId: id(1102),
    };
    let state = reduce(activeSequenceState(), generation, matching);
    expect(state.boundGeneration).toBeDefined();
    expect(state.pendingStructureDocument).toBeDefined();
    state = reduce(
      state,
      message(1104, "dataset.status", {
        datasetId: "B",
        previousDatasetId: "A",
        generation: 2,
        status: "switching",
        sequenceRequestId: "sequence-B",
        structureRequestId: "structure-B",
      }),
    );
    expect(state.pendingSequenceDocument).toBeUndefined();
    expect(state.pendingStructureDocument).toBeUndefined();
    expect(state.boundGeneration).toBeUndefined();
    expect(state.unboundGenerations).toHaveLength(0);
    expect(state.structureRequestHistory).toHaveLength(0);
  });

  it("keeps latest dataset generation when superseded statuses arrive late", () => {
    let state = emptyInspectPanelState();
    const status = (generation: number, datasetId: string, value: string) => ({
      generation,
      datasetId,
      status: value,
      sequenceRequestId: `s${generation}`,
      structureRequestId: `m${generation}`,
    });
    state = reduce(
      state,
      message(1, "dataset.status", status(2, "B", "switching")),
      message(2, "dataset.status", status(1, "A", "superseded")),
    );
    expect(state.datasetStatus).toMatchObject({ generation: 2, datasetId: "B" });
  });

  it("bounds traffic and safely redacts visible document downloads", () => {
    let state = emptyInspectPanelState();
    for (let index = 0; index < 2001; index += 1)
      state = reduce(state, message(index, "harness.diagnostic", {}));
    expect(state.rows).toHaveLength(2000);
    const unsafe = Object.create(null) as Record<string, unknown>;
    unsafe.apiToken = "private";
    unsafe.value = Number.POSITIVE_INFINITY;
    expect(JSON.parse(safeInspectJson(unsafe))).toEqual({
      apiToken: "[redacted]",
      value: "[unsupported number]",
    });
    const document = {
      format: "seqviewspec" as const,
      identity: id(9),
      requestId: "request",
      targetComponent: "sequence",
      correlationId: id(9),
      source: { plugin: "test" },
      document: unsafe,
      lifecycle: "rendered" as const,
    };
    const validation = { identity: id(9), valid: true, diagnostics: [] };
    expect(JSON.parse(prepareInspectDownload(document, validation)?.text ?? "null")).toEqual({
      apiToken: "[redacted]",
      value: "[unsupported number]",
    });
    expect(
      prepareInspectDownload({ ...document, lifecycle: "accepted" }, validation),
    ).toBeUndefined();
  });

  it("rejects stale asynchronous validation and download identities", () => {
    const document = {
      format: "mvs" as const,
      identity: id(2),
      requestId: "new",
      targetComponent: "structure",
      correlationId: id(2),
      source: { plugin: "test" },
      document: {},
      lifecycle: "rendered" as const,
    };
    const current = { identity: id(2), valid: true, diagnostics: [] };
    const stale = { ...current, identity: id(1) };
    expect(commitInspectValidation(document, stale, current)).toBe(current);
    expect(prepareInspectDownload(document, stale)).toBeUndefined();
  });
});

describe("inspect panel generic generated-document binding", () => {
  const genericSequence = () =>
    request(1200, "seqviewspec", "complex-sequence", "complex-doc", 1199);
  const genericGeneration = (index = 1203, options: { readonly sourcePlugin?: string } = {}) =>
    message(
      index,
      "document.generated.mvs",
      {
        requestId: "complex-profile",
        activation: "contact",
        relationshipId: "43",
        endpointRoles: [
          { role: "barnase", selectors: [{ label_asym_id: "A" }] },
          { role: "barstar", selectors: [{ label_asym_id: "D" }] },
        ],
        mappedContactIds: ["43"],
      },
      { correlation: 1201, causation: 1202, sourcePlugin: options.sourcePlugin ?? "datasets" },
    );
  const genericRequest = (index = 1204) => ({
    ...request(index, "mvs", "complex-profile", "complex-mvs", 1201),
    causationId: id(1202),
  });

  it("binds a catalog-free profile only to the matching lifecycle-confirmed MVS", () => {
    const sequence = genericSequence();
    const generated = genericGeneration();
    const mvs = genericRequest();
    let state = rendered(emptyInspectPanelState(), sequence, "sequence", 1201);
    state = reduce(state, generated, mvs);
    expect(state.generation).toBeUndefined();
    expect(state.boundGeneration).toMatchObject({ generation: { profile: "contact" } });
    state = reduce(
      state,
      lifecycle(1205, mvs, "structure", "accepted"),
      lifecycle(1206, mvs, "structure", "rendered", {
        generation: 1205,
        visibleRequestId: "complex-profile",
      }),
    );
    expect(state.structureDocument?.identity).toBe(mvs.id);
    expect(state.generation).toMatchObject({
      requestId: "complex-profile",
      profile: "contact",
      relationshipId: "43",
      mappedContactCount: 1,
      endpointRoles: [
        { role: "barnase", selectorCount: 1 },
        { role: "barstar", selectorCount: 1 },
      ],
    });
  });

  it("rejects forged generations and lifecycle envelopes without replacing the visible document", () => {
    const sequence = genericSequence();
    const generated = genericGeneration();
    const mvs = genericRequest();
    let state = rendered(emptyInspectPanelState(), sequence, "sequence", 1201);
    state = reduce(state, genericGeneration(1207, { sourcePlugin: "forged" }), mvs);
    expect(state.boundGeneration).toBeUndefined();
    state = reduce(state, generated);
    const forgedLifecycle = message(
      1208,
      "lifecycle.visualization",
      {
        requestId: "complex-profile",
        generation: 1208,
        componentId: "structure",
        status: "rendered",
        visibleRequestId: "complex-profile",
      },
      { correlation: 1201, causation: 1204, sourcePlugin: "forged" },
    );
    state = reduce(state, forgedLifecycle);
    expect(state.structureDocument).toBeUndefined();
    expect(state.generation).toBeUndefined();
  });

  it("does not cross-bind a reused request ID with a different envelope", () => {
    const sequence = genericSequence();
    const generated = genericGeneration();
    const reused = {
      ...request(1210, "mvs", "complex-profile", "different-mvs", 1211),
      causationId: id(1212),
    };
    let state = rendered(emptyInspectPanelState(), sequence, "sequence", 1201);
    state = reduce(state, generated, reused);
    expect(state.boundGeneration).toBeUndefined();
    state = reduce(
      state,
      lifecycle(1213, reused, "structure", "accepted"),
      lifecycle(1214, reused, "structure", "rendered", {
        generation: 1213,
        visibleRequestId: "complex-profile",
      }),
    );
    expect(state.structureDocument?.identity).toBe(reused.id);
    expect(state.generation).toBeUndefined();
  });

  it("drops a late generic generation after its matching request was superseded", () => {
    const sequence = genericSequence();
    const mvs = genericRequest();
    let state = rendered(emptyInspectPanelState(), sequence, "sequence", 1201);
    state = reduce(
      state,
      mvs,
      lifecycle(1215, mvs, "structure", "accepted"),
      lifecycle(1216, mvs, "structure", "superseded", { generation: 1215 }),
      genericGeneration(1217),
    );
    expect(state.pendingStructureDocument).toBeUndefined();
    expect(state.boundGeneration).toBeUndefined();
    expect(state.unboundGenerations).toHaveLength(0);
    expect(state.generation).toBeUndefined();
  });
});
