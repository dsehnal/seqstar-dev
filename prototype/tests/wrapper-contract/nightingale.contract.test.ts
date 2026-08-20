import type { CoordinateLocus } from "@seq-star/seq-coords";
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  class TestResizeObserver {
    observe(): void {}
    disconnect(): void {}
  }
  Object.assign(globalThis, { ResizeObserver: TestResizeObserver });
});

import {
  composeNightingaleNativeId,
  NightingaleIdentityTable,
  type NightingaleLoadResult,
  type NightingaleNativeDriver,
  type NightingaleNativeInteraction,
  NightingalePresentationError,
  NightingaleWrapper,
  snapshotNightingalePresentation,
} from "../../packages/wrapper-nightingale/src/index.js";
import { createHarnessContext, message, runWrapperConformance, uuid } from "./contract-kit.js";

const document = {
  kind: "seq-view-spec",
  version: "0.1.0",
  id: "nightingale-contract-document",
  sequences: [
    { id: "sequence", coordinateSpace: "sequence-space", alphabet: "protein", residues: "MKTAY" },
  ],
  views: [
    {
      id: "main",
      axis: { segments: [{ id: "axis", space: "sequence-space", start: 0, end: 5 }] },
      sections: [
        {
          id: "section",
          tracks: [
            {
              id: "track",
              layers: [{ id: "letters", representation: "sequence", sequence: "sequence" }],
            },
          ],
        },
      ],
    },
  ],
} as const;
const locus: CoordinateLocus = {
  kind: "point",
  space: { id: "sequence-space", kind: "sequence", length: 5 },
  position: { kind: "index", value: 1 },
};

class ControlledDriver implements NightingaleNativeDriver {
  private readonly listeners = new Set<(event: NightingaleNativeInteraction) => void>();
  readonly interactions = {
    subscribe: (next: (event: NightingaleNativeInteraction) => void) => {
      this.listeners.add(next);
      return { unsubscribe: () => this.listeners.delete(next) };
    },
  };
  readonly loads: Array<{
    readonly signal: AbortSignal;
    resolve(value: NightingaleLoadResult): void;
    reject(reason: unknown): void;
  }> = [];
  applied = 0;
  cleared = 0;
  readonly appliedCommands: Array<{
    readonly family: "highlight" | "selection";
    readonly owner: string;
    readonly loci: readonly CoordinateLocus[];
  }> = [];
  readonly clearedCommands: Array<{
    readonly family: "highlight" | "selection";
    readonly owner: string;
  }> = [];
  render(options: { readonly signal: AbortSignal }): Promise<NightingaleLoadResult> {
    return new Promise((resolve, reject) =>
      this.loads.push({ signal: options.signal, resolve, reject }),
    );
  }
  setApplied(family: "highlight" | "selection", owner: string, loci: readonly CoordinateLocus[]) {
    this.applied++;
    this.appliedCommands.push({ family, owner, loci });
  }
  clearApplied(family: "highlight" | "selection", owner: string) {
    this.cleared++;
    this.clearedCommands.push({ family, owner });
  }
  resize() {}
  dispose() {}
  emit(
    event: NightingaleNativeInteraction = { interaction: "hover", phase: "set", loci: [locus] },
  ) {
    for (const listener of this.listeners) listener(event);
  }
  get listenerCount() {
    return this.listeners.size;
  }
}

const result = (): NightingaleLoadResult => ({
  status: "rendered",
  diagnostics: [],
  identities: {
    add() {},
    getNative() {
      return undefined;
    },
    entries() {
      return [];
    },
  },
});
const request = (requestId: string) => ({
  format: "seqviewspec",
  requestId,
  mode: "replace" as const,
  document,
  viewId: "main",
});

runWrapperConformance({
  name: "Nightingale",
  requestTopic: "visualization.seqviewspec.request",
  create: () => {
    const native = new ControlledDriver();
    return {
      wrapper: new NightingaleWrapper({
        id: "nightingale",
        target: {} as HTMLElement,
        driverFactory: () => native,
      }),
      driver: {
        listenerCount: () => native.listenerCount,
        loadSignal: (index) => native.loads[index]?.signal,
        resolveLoad: (index) => native.loads[index]?.resolve(result()),
        emitNative: () =>
          native.emit({ interaction: "track-activate", phase: "set", loci: [locus] }),
        appliedCount: () => native.applied,
        clearCount: () => native.cleared,
      },
    };
  },
  makeValidRequest: request,
  makeApplyMessage: (owner, target) =>
    message(
      "interaction.highlight.apply",
      { interactionId: "owned", owner, mode: "replace", loci: [locus] },
      { component: target },
    ),
  makeClearMessage: (owner, target) =>
    message(
      "interaction.highlight.clear",
      { interactionId: "owned", owner },
      { component: target },
    ),
});

describe("Nightingale wrapper boundaries", () => {
  it("keeps repeated item IDs collision-free across layers and reverses each native identity", () => {
    const identities = new NightingaleIdentityTable();
    const common = {
      documentId: "document",
      viewId: "view",
      sectionId: "section",
      trackId: "track",
      generation: 1,
      itemId: "repeated-item",
    } as const;
    const first = {
      ...common,
      layerId: "layer-a",
      nativeId: "document:view:track:layer-a:item:repeated-item",
    };
    const second = {
      ...common,
      layerId: "layer-b",
      nativeId: "document:view:track:layer-b:item:repeated-item",
    };
    identities.add(first);
    identities.add(second);
    expect(first.nativeId).not.toBe(second.nativeId);
    expect(identities.getNative(first.nativeId)).toEqual(first);
    expect(identities.getNative(second.nativeId)).toEqual(second);
    expect(composeNightingaleNativeId(["document", "a|view:1:b"], ["view", "c"])).not.toBe(
      composeNightingaleNativeId(["document", "a"], ["view", "b|view:1:c"]),
    );
  });

  it("does not let a malformed replacement abort the accepted native generation", async () => {
    const harness = createHarnessContext();
    const native = new ControlledDriver();
    const wrapper = new NightingaleWrapper({
      id: "nightingale",
      target: {} as HTMLElement,
      driverFactory: () => native,
    });
    await wrapper.start(harness.context);
    harness.fabric.publish(
      message("visualization.seqviewspec.request", request("accepted"), {
        component: "nightingale",
      }),
    );
    harness.fabric.publish(
      message(
        "visualization.seqviewspec.request",
        { ...request("invalid"), document: {} },
        { component: "nightingale" },
      ),
    );
    expect(native.loads).toHaveLength(1);
    expect(native.loads[0]?.signal.aborted).toBe(false);
    native.loads[0]?.resolve(result());
    await Promise.resolve();
    expect(harness.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "lifecycle.visualization",
          payload: expect.objectContaining({ requestId: "accepted", status: "rendered" }),
        }),
        expect.objectContaining({
          type: "lifecycle.visualization",
          payload: expect.objectContaining({ requestId: "invalid", status: "failed" }),
        }),
      ]),
    );
    await wrapper.dispose();
  });

  it("keeps independent owners intact until their own clear", async () => {
    const harness = createHarnessContext();
    const native = new ControlledDriver();
    const wrapper = new NightingaleWrapper({
      id: "nightingale",
      target: {} as HTMLElement,
      driverFactory: () => native,
    });
    await wrapper.start(harness.context);
    harness.fabric.publish(
      message("visualization.seqviewspec.request", request("active"), { component: "nightingale" }),
    );
    native.loads[0]?.resolve(result());
    await new Promise((resolve) => setTimeout(resolve, 0));
    const ownerA = { correlationId: uuid(), sourceComponent: "a" };
    const ownerB = { correlationId: uuid(), sourceComponent: "b" };
    for (const [owner, interactionId] of [
      [ownerA, "a"],
      [ownerB, "b"],
    ] as const)
      harness.fabric.publish(
        message(
          "interaction.highlight.apply",
          { interactionId, owner, mode: "replace", loci: [locus] },
          { component: "nightingale" },
        ),
      );
    harness.fabric.publish(
      message("interaction.highlight.clear", { owner: ownerA }, { component: "nightingale" }),
    );
    expect(native.applied).toBe(2);
    expect(native.cleared).toBe(1);
    expect(native.appliedCommands.map(({ loci }) => loci)).toEqual([[locus], [locus]]);
    expect(native.clearedCommands[0]?.owner).toContain("a");
    await wrapper.dispose();
  });

  it("publishes one set and one lease-matched clear across normalized action and disposal", async () => {
    const harness = createHarnessContext();
    const native = new ControlledDriver();
    const wrapper = new NightingaleWrapper({
      id: "nightingale",
      target: {} as HTMLElement,
      driverFactory: () => native,
    });
    await wrapper.start(harness.context);
    harness.fabric.publish(
      message("visualization.seqviewspec.request", request("active"), { component: "nightingale" }),
    );
    native.loads[0]?.resolve(result());
    await Promise.resolve();
    native.emit({ interaction: "select", phase: "set", loci: [locus] });
    expect(harness.messages.filter((entry) => entry.type === "interaction.native")).toHaveLength(1);
    await wrapper.dispose();
    const beforeLateNative = harness.messages.filter(
      (entry) => entry.type === "interaction.native",
    );
    expect(beforeLateNative).toHaveLength(2);
    expect(beforeLateNative.map((entry) => (entry.payload as { phase: string }).phase)).toEqual([
      "set",
      "clear",
    ]);
    const [setMessage, clearMessage] = beforeLateNative;
    if (setMessage === undefined || clearMessage === undefined)
      throw new Error("Expected a native set/clear pair.");
    expect(clearMessage.correlationId).toBe(setMessage.correlationId);
    expect((clearMessage.payload as { interactionId: string }).interactionId).toBe(
      (setMessage.payload as { interactionId: string }).interactionId,
    );
    native.emit({ interaction: "select", phase: "set", loci: [locus] });
    expect(harness.messages.filter((entry) => entry.type === "interaction.native")).toHaveLength(2);
  });

  it("closes an active native lease before clear-policy failure removes the native tree", async () => {
    const harness = createHarnessContext();
    const native = new ControlledDriver();
    const replacement = new ControlledDriver();
    const drivers = [native, replacement];
    const wrapper = new NightingaleWrapper({
      id: "nightingale",
      target: {} as HTMLElement,
      config: { failureViewPolicy: "clear" },
      driverFactory: () => drivers.shift() ?? replacement,
    });
    await wrapper.start(harness.context);
    harness.fabric.publish(
      message("visualization.seqviewspec.request", request("active"), {
        component: "nightingale",
      }),
    );
    native.loads[0]?.resolve(result());
    await Promise.resolve();
    native.emit({ interaction: "hover", phase: "set", loci: [locus] });
    harness.fabric.publish(
      message("visualization.seqviewspec.request", request("failed-replacement"), {
        component: "nightingale",
      }),
    );
    native.loads[1]?.reject(new Error("forced"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const nativeMessages = harness.messages.filter((entry) => entry.type === "interaction.native");
    expect(nativeMessages.map((entry) => (entry.payload as { phase: string }).phase)).toEqual([
      "set",
      "clear",
    ]);
    const [setMessage, clearMessage] = nativeMessages;
    if (setMessage === undefined || clearMessage === undefined)
      throw new Error("Expected a native set/clear pair.");
    expect(clearMessage.correlationId).toBe(setMessage.correlationId);
    expect((clearMessage.payload as { interactionId: string }).interactionId).toBe(
      (setMessage.payload as { interactionId: string }).interactionId,
    );
    expect(native.listenerCount).toBe(0);
    expect(replacement.listenerCount).toBe(1);
    await wrapper.dispose();
  });

  it("preserves every locus independently for both interaction families", async () => {
    const harness = createHarnessContext();
    const native = new ControlledDriver();
    const wrapper = new NightingaleWrapper({
      id: "nightingale",
      target: {} as HTMLElement,
      driverFactory: () => native,
    });
    await wrapper.start(harness.context);
    harness.fabric.publish(
      message("visualization.seqviewspec.request", request("active"), { component: "nightingale" }),
    );
    native.loads[0]?.resolve(result());
    await new Promise((resolve) => setTimeout(resolve, 0));
    const loci: readonly CoordinateLocus[] = [
      locus,
      { kind: "interval", space: { ...locus.space }, start: 2, end: 4 },
      { kind: "boundary", space: { ...locus.space }, position: 3 },
    ];
    const owner = { correlationId: uuid(), sourceComponent: "source" };
    for (const family of ["highlight", "selection"] as const)
      harness.fabric.publish(
        message(
          `interaction.${family}.apply`,
          { interactionId: family, owner, mode: "replace", loci },
          { component: "nightingale" },
        ),
      );
    expect(native.appliedCommands).toHaveLength(2);
    expect(native.appliedCommands[0]?.loci).toEqual(loci);
    expect(native.appliedCommands[1]?.loci).toEqual(loci);
    expect(native.appliedCommands.map(({ family }) => family)).toEqual(["highlight", "selection"]);
    await wrapper.dispose();
  });

  it("toggles an identical native selection once, replaces a different one, and does not echo applies", async () => {
    const harness = createHarnessContext();
    const native = new ControlledDriver();
    const wrapper = new NightingaleWrapper({
      id: "nightingale",
      target: {} as HTMLElement,
      driverFactory: () => native,
    });
    await wrapper.start(harness.context);
    harness.fabric.publish(
      message("visualization.seqviewspec.request", request("active"), { component: "nightingale" }),
    );
    native.loads[0]?.resolve(result());
    await Promise.resolve();
    native.emit({ interaction: "select", phase: "set", loci: [locus] });
    native.emit({ interaction: "select", phase: "set", loci: [locus] });
    const alternate: CoordinateLocus = {
      kind: "point",
      space: locus.space,
      position: { kind: "index", value: 3 },
    };
    native.emit({ interaction: "select", phase: "set", loci: [locus] });
    native.emit({ interaction: "select", phase: "set", loci: [alternate] });
    const nativeEvents = harness.messages.filter((entry) => entry.type === "interaction.native");
    expect(nativeEvents.map((entry) => (entry.payload as { phase: string }).phase)).toEqual([
      "set",
      "clear",
      "set",
      "clear",
      "set",
    ]);
    const [firstSet, firstClear, secondSet, secondClear, replacementSet] = nativeEvents;
    if (
      firstSet === undefined ||
      firstClear === undefined ||
      secondSet === undefined ||
      secondClear === undefined ||
      replacementSet === undefined
    )
      throw new Error("Expected the complete native toggle event sequence.");
    expect(firstClear?.correlationId).toBe(firstSet?.correlationId);
    expect((firstClear.payload as { interactionId: string }).interactionId).toBe(
      (firstSet.payload as { interactionId: string }).interactionId,
    );
    expect(secondClear?.correlationId).toBe(secondSet?.correlationId);
    expect(replacementSet?.correlationId).not.toBe(secondSet?.correlationId);
    const owner = { correlationId: uuid(), sourceComponent: "remote" };
    harness.fabric.publish(
      message(
        "interaction.selection.apply",
        { interactionId: "remote", owner, mode: "replace", loci: [alternate] },
        { component: "nightingale" },
      ),
    );
    expect(harness.messages.filter((entry) => entry.type === "interaction.native")).toHaveLength(5);
    await wrapper.dispose();
  });

  it("publishes annotation identity for semantic native loci", async () => {
    const harness = createHarnessContext();
    const native = new ControlledDriver();
    const wrapper = new NightingaleWrapper({
      id: "nightingale",
      target: {} as HTMLElement,
      driverFactory: () => native,
    });
    await wrapper.start(harness.context);
    harness.fabric.publish(
      message("visualization.seqviewspec.request", request("active"), { component: "nightingale" }),
    );
    native.loads[0]?.resolve(result());
    await Promise.resolve();
    native.emit({
      interaction: "select",
      phase: "set",
      loci: [locus],
      identity: {
        documentId: document.id,
        viewId: "main",
        sectionId: "section",
        trackId: "track",
        layerId: "letters",
        annotationId: "contract-annotation",
        generation: 1,
        itemId: "contract-item",
        nativeId: "contract-native",
      },
    });
    const published = harness.messages.find((entry) => entry.type === "interaction.native");
    if (published === undefined) throw new Error("Expected a semantic native event.");
    expect((published.payload as { semanticTarget?: unknown }).semanticTarget).toEqual({
      annotationId: "contract-annotation",
      itemId: "contract-item",
      trackId: "track",
    });
    await wrapper.dispose();
  });

  it("fails closed and detaches the wrapper presentation snapshot", () => {
    const presentation = {
      initialViewport: { start: 2, end: 4 },
      trackActions: [{ trackId: "track", label: "Show track in 3D", kind: "structure" }],
      alignmentMemberActions: [
        { alignmentId: "alignment", memberId: "member", label: "Show member structure" },
      ],
    };
    const snapshot = snapshotNightingalePresentation(presentation);
    presentation.trackActions[0].label = "mutated";
    expect(snapshot).toEqual({
      initialViewport: { start: 2, end: 4 },
      trackActions: [{ trackId: "track", label: "Show track in 3D", kind: "structure" }],
      alignmentMemberActions: [
        { alignmentId: "alignment", memberId: "member", label: "Show member structure" },
      ],
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.trackActions)).toBe(true);
    expect(Object.isFrozen(snapshot.trackActions?.[0])).toBe(true);
    expect(Object.isFrozen(snapshot.alignmentMemberActions)).toBe(true);
    expect(Object.isFrozen(snapshot.alignmentMemberActions?.[0])).toBe(true);
    expect(() =>
      snapshotNightingalePresentation({
        trackActions: [
          { trackId: "a", label: "A" },
          { trackId: "a", label: "B" },
        ],
      }),
    ).toThrow(NightingalePresentationError);
    expect(() =>
      snapshotNightingalePresentation({ initialViewport: { start: 4, end: 2 } }),
    ).toThrow("cannot exceed end");
    const cyclic: { trackActions?: unknown[] } = {};
    cyclic.trackActions = [cyclic];
    expect(() => snapshotNightingalePresentation(cyclic)).toThrow("cannot contain cycles");
    expect(() =>
      snapshotNightingalePresentation({ trackActions: [{ trackId: "a", label: () => "x" }] }),
    ).toThrow("JSON-safe");
    expect(() =>
      snapshotNightingalePresentation({ trackActions: [{ trackId: "", label: "A" }] }),
    ).toThrow("non-empty string");
    expect(() =>
      snapshotNightingalePresentation({
        trackActions: [{ trackId: "a", label: "A", kind: "dynamic" }],
      }),
    ).toThrow("must be structure or layers");
    expect(() =>
      snapshotNightingalePresentation({
        alignmentMemberActions: [
          { alignmentId: "alignment", memberId: "member", label: "A" },
          { alignmentId: "alignment", memberId: "member", label: "B" },
        ],
      }),
    ).toThrow("duplicate member");
    expect(() => snapshotNightingalePresentation({ initialViewport: { start: Infinity } })).toThrow(
      "JSON-safe",
    );
    expect(() => snapshotNightingalePresentation(new Date())).toThrow("plain objects");
    const accessor = {} as { trackActions?: unknown };
    Object.defineProperty(accessor, "trackActions", { enumerable: true, get: () => [] });
    expect(() => snapshotNightingalePresentation(accessor)).toThrow("cannot contain accessors");
  });
});
