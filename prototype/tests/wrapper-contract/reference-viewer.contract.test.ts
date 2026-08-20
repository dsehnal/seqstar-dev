import type { CoordinateLocus } from "@seq-star/seq-coords";
import { describe, expect, it } from "vitest";
import type { SeqViewer } from "../../packages/seq-viewer/src/index.js";
import {
  ReferencePresentationError,
  ReferenceViewerWrapper,
  snapshotReferenceViewerPresentation,
} from "../../packages/wrapper-seq-viewer/src/index.js";
import { createHarnessContext, message, runWrapperConformance, uuid } from "./contract-kit.js";

const wrapperDocument = {
  kind: "seq-view-spec",
  version: "0.1.0",
  id: "wrapper-contract-document",
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
class ControlledNativeMock {
  readonly capabilities = {
    representations: ["sequence"] as const,
    supportsExternalHighlight: true as const,
    supportsExternalSelection: true as const,
    supportsNativeInteractions: true as const,
  };
  private listeners = new Set<(x: unknown) => void>();
  readonly interactions = {
    subscribe: (n: ((value: unknown) => void) | { readonly next?: (value: unknown) => void }) => {
      const f = typeof n === "function" ? n : (n.next ?? (() => undefined));
      this.listeners.add(f);
      return { unsubscribe: () => this.listeners.delete(f) };
    },
  };
  readonly highlights: unknown[] = [];
  readonly clearedHighlights: unknown[] = [];
  loads: Array<{ readonly signal?: AbortSignal; resolve(value: unknown): void }> = [];
  disposed = 0;
  load(_d: unknown, _v: string, signal?: AbortSignal): Promise<unknown> {
    return new Promise((resolve) => this.loads.push({ signal, resolve }));
  }
  setHighlight(x: unknown) {
    this.highlights.push(x);
  }
  setSelection(_x?: unknown) {}
  clearHighlight(x?: unknown) {
    this.clearedHighlights.push(x);
  }
  clearSelection(_x?: unknown) {}
  resize() {}
  hitTest(): undefined {
    return undefined;
  }
  dispose() {
    this.disposed++;
  }
  emit(x: unknown) {
    this.listeners.forEach((listener) => {
      listener(x);
    });
  }
  get listenerCount() {
    return this.listeners.size;
  }
}

const tick = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};
const rendered = (generation: number) => ({
  status: "rendered" as const,
  generation,
  documentId: "wrapper-contract-document",
  viewId: "main",
  diagnostics: [],
  representations: [],
  layers: [],
});
const request = (requestId: string) => ({
  format: "seqviewspec",
  requestId,
  mode: "replace" as const,
  document: wrapperDocument,
  viewId: "main",
});

runWrapperConformance({
  name: "reference viewer",
  requestTopic: "visualization.seqviewspec.request",
  create: () => {
    const driver = new ControlledNativeMock();
    return {
      driver: {
        listenerCount: () => driver.listenerCount,
        loadSignal: (i) => driver.loads[i]?.signal,
        resolveLoad: (i, g) => driver.loads[i]?.resolve(rendered(g)),
        emitNative: () =>
          driver.emit({
            kind: "hover",
            documentId: "wrapper-contract-document",
            viewId: "main",
            loci: [locus],
          }),
        appliedCount: () => driver.highlights.length,
        clearCount: () => driver.clearedHighlights.length,
      },
      wrapper: new ReferenceViewerWrapper({
        id: "reference",
        target: {} as HTMLElement,
        viewerFactory: () => driver as unknown as SeqViewer,
      }),
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

describe("reference viewer wrapper common contract", () => {
  it("fails closed and detaches the JSON-safe reference presentation snapshot", () => {
    const presentation = {
      tracks: [
        {
          trackId: "track",
          action: {
            kind: "structure-profile",
            accessibleName: "Show track in 3D",
            tooltip: "Show track in 3D",
            icon: "box",
          },
        },
      ],
    };
    const snapshot = snapshotReferenceViewerPresentation(presentation);
    presentation.tracks[0].action.tooltip = "mutated";
    expect(snapshot).toEqual({
      tracks: [
        expect.objectContaining({
          trackId: "track",
          action: expect.objectContaining({ tooltip: "Show track in 3D" }),
        }),
      ],
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.tracks ?? [])).toBe(true);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const accessor = {} as { readonly tracks: unknown };
    Object.defineProperty(accessor, "tracks", { enumerable: true, get: () => [] });
    for (const invalid of [
      cyclic,
      new Date(),
      accessor,
      { tracks: [{ trackId: "track", action: () => undefined }] },
      { tracks: [{ trackId: "track", action: { kind: "bad" } }] },
      { tracks: [{ trackId: "track" }, { trackId: "track" }] },
      { tracks: Infinity },
    ])
      expect(() => snapshotReferenceViewerPresentation(invalid)).toThrow(
        ReferencePresentationError,
      );
  });

  it("reports an absent configured track deterministically after loading", async () => {
    const harness = createHarnessContext();
    const viewer = new ControlledNativeMock();
    const wrapper = new ReferenceViewerWrapper({
      id: "reference",
      target: {} as HTMLElement,
      config: { presentation: { tracks: [{ trackId: "absent" }] } },
      viewerFactory: () => viewer as unknown as SeqViewer,
    });
    await wrapper.start(harness.context);
    harness.fabric.publish(
      message("visualization.seqviewspec.request", request("configured-action"), {
        component: "reference",
      }),
    );
    viewer.loads[0]?.resolve(rendered(1));
    await tick();
    expect(harness.messages).toContainEqual(
      expect.objectContaining({
        type: "lifecycle.visualization",
        payload: expect.objectContaining({
          diagnostics: expect.arrayContaining([
            expect.objectContaining({
              code: "wrapper.seq-viewer.presentation.track-action.absent",
            }),
          ]),
        }),
      }),
    );
    await wrapper.dispose();
  });

  it("does not let an invalid replacement supersede an accepted in-flight request", async () => {
    const harness = createHarnessContext();
    const viewer = new ControlledNativeMock();
    const wrapper = new ReferenceViewerWrapper({
      id: "reference",
      target: {} as HTMLElement,
      viewerFactory: () => viewer as unknown as SeqViewer,
    });
    await wrapper.start(harness.context);
    harness.fabric.publish(
      message("visualization.seqviewspec.request", request("accepted-a"), {
        component: "reference",
      }),
    );
    harness.fabric.publish(
      message(
        "visualization.seqviewspec.request",
        { ...request("invalid-b"), document: {} },
        { component: "reference" },
      ),
    );
    expect(viewer.loads).toHaveLength(1);
    viewer.loads[0]?.resolve(rendered(1));
    await tick();
    expect(harness.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "lifecycle.visualization",
          payload: expect.objectContaining({
            requestId: "invalid-b",
            status: "failed",
            generation: 2,
          }),
        }),
        expect.objectContaining({
          type: "lifecycle.visualization",
          payload: expect.objectContaining({
            requestId: "accepted-a",
            status: "rendered",
            generation: 1,
          }),
        }),
      ]),
    );
    await wrapper.dispose();
  });

  it("rejects an incompatible request format before it reaches the viewer", async () => {
    const harness = createHarnessContext();
    const viewer = new ControlledNativeMock();
    const wrapper = new ReferenceViewerWrapper({
      id: "reference",
      target: {} as HTMLElement,
      viewerFactory: () => viewer as unknown as SeqViewer,
    });
    await wrapper.start(harness.context);
    harness.fabric.publish(
      message(
        "visualization.seqviewspec.request",
        { ...request("wrong-format"), format: "mvs" },
        { component: "reference" },
      ),
    );
    expect(viewer.loads).toHaveLength(0);
    expect(harness.messages).toContainEqual(
      expect.objectContaining({
        type: "lifecycle.visualization",
        payload: expect.objectContaining({ requestId: "wrong-format", status: "failed" }),
      }),
    );
    await wrapper.dispose();
  });

  it("rejects an unknown view before the native viewer and omits previousView on first failure", async () => {
    const harness = createHarnessContext();
    const viewer = new ControlledNativeMock();
    const wrapper = new ReferenceViewerWrapper({
      id: "reference",
      target: {} as HTMLElement,
      viewerFactory: () => viewer as unknown as SeqViewer,
    });
    await wrapper.start(harness.context);
    harness.fabric.publish(
      message(
        "visualization.seqviewspec.request",
        { ...request("unknown-view"), viewId: "absent" },
        { component: "reference" },
      ),
    );
    expect(viewer.loads).toHaveLength(0);
    expect(harness.messages).toContainEqual(
      expect.objectContaining({
        type: "lifecycle.visualization",
        payload: expect.not.objectContaining({ previousView: expect.anything() }),
      }),
    );
    await wrapper.dispose();
  });

  it("has accepted/rendered/superseded lifecycle and only lets the newest request become visible", async () => {
    const harness = createHarnessContext();
    const viewer = new ControlledNativeMock();
    const wrapper = new ReferenceViewerWrapper({
      id: "reference",
      target: {} as HTMLElement,
      viewerFactory: () => viewer as unknown as SeqViewer,
    });
    await wrapper.start(harness.context);
    harness.fabric.publish(
      message("visualization.seqviewspec.request", request("one"), { component: "reference" }),
    );
    harness.fabric.publish(
      message("visualization.seqviewspec.request", request("two"), { component: "reference" }),
    );
    expect(viewer.loads).toHaveLength(2);
    expect(viewer.loads[0]?.signal?.aborted).toBe(true);
    viewer.loads[1]?.resolve(rendered(2));
    viewer.loads[0]?.resolve(rendered(1));
    await tick();
    const results = harness.messages
      .filter((item) => item.type === "lifecycle.visualization")
      .map((item) => item.payload as { readonly requestId: string; readonly status: string });
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ requestId: "one", status: "accepted" }),
        expect.objectContaining({ requestId: "two", status: "accepted" }),
        expect.objectContaining({ requestId: "two", status: "rendered" }),
        expect.objectContaining({ requestId: "one", status: "superseded" }),
      ]),
    );
    await wrapper.dispose();
  });

  it("keeps native interactions distinct from applied commands, filters targets, clears per owner, and disposes subscriptions", async () => {
    const harness = createHarnessContext();
    const viewer = new ControlledNativeMock();
    const wrapper = new ReferenceViewerWrapper({
      id: "reference",
      target: {} as HTMLElement,
      viewerFactory: () => viewer as unknown as SeqViewer,
    });
    await wrapper.start(harness.context);
    harness.fabric.publish(
      message("visualization.seqviewspec.request", request("active"), { component: "reference" }),
    );
    viewer.loads[0]?.resolve(rendered(1));
    await tick();
    viewer.emit({
      kind: "hover",
      documentId: "wrapper-contract-document",
      viewId: "main",
      trackId: "track",
      endpointRole: "source",
      locusIndex: 0,
      loci: [locus],
      nativeEvent: {} as Event,
    });
    expect(harness.messages.filter((item) => item.type === "interaction.native")).toHaveLength(1);
    expect(harness.messages).toContainEqual(
      expect.objectContaining({
        type: "interaction.native",
        payload: expect.objectContaining({
          semanticTarget: { trackId: "track", endpointRole: "source", locusIndex: 0 },
        }),
      }),
    );
    const firstOwner = { correlationId: uuid(), sourceComponent: "source-a" };
    const secondOwner = { correlationId: uuid(), sourceComponent: "source-b" };
    const apply = (owner: typeof firstOwner, interactionId: string, target = "reference") =>
      message(
        "interaction.highlight.apply",
        { interactionId, owner, mode: "replace", loci: [locus] },
        { component: target },
      );
    harness.fabric.publish(apply(firstOwner, "a"));
    harness.fabric.publish(apply(secondOwner, "b"));
    harness.fabric.publish(apply(firstOwner, "ignored", "other"));
    expect(viewer.highlights).toHaveLength(2);
    const unrelated = { ...locus, space: { id: "other", kind: "sequence", length: 1 } };
    harness.fabric.publish(
      message(
        "interaction.highlight.apply",
        { interactionId: "unmapped", owner: firstOwner, mode: "replace", loci: [unrelated] },
        { component: "reference" },
      ),
    );
    expect(viewer.highlights).toHaveLength(2);
    expect(harness.messages).toContainEqual(
      expect.objectContaining({
        type: "harness.diagnostic",
        payload: expect.objectContaining({
          diagnostics: expect.arrayContaining([
            expect.objectContaining({ code: "wrapper.seq-viewer.command.unmapped" }),
          ]),
        }),
      }),
    );
    const nativeBefore = harness.messages.filter(
      (item) => item.type === "interaction.native",
    ).length;
    harness.fabric.publish(
      message(
        "interaction.highlight.clear",
        { interactionId: "a", owner: firstOwner },
        { component: "reference" },
      ),
    );
    expect(viewer.clearedHighlights).toHaveLength(1);
    expect(viewer.highlights).toHaveLength(2);
    expect(harness.messages.filter((item) => item.type === "interaction.native")).toHaveLength(
      nativeBefore,
    );
    await wrapper.dispose();
    viewer.emit({ kind: "hover", documentId: "x", viewId: "y", loci: [locus] });
    expect(viewer.disposed).toBe(1);
    expect(harness.messages.filter((item) => item.type === "interaction.native")).toHaveLength(
      nativeBefore,
    );
    harness.fabric.dispose();
  });

  it("pairs a native set and clear with one interaction lease", async () => {
    const harness = createHarnessContext();
    const viewer = new ControlledNativeMock();
    const wrapper = new ReferenceViewerWrapper({
      id: "reference",
      target: {} as HTMLElement,
      viewerFactory: () => viewer as unknown as SeqViewer,
    });
    await wrapper.start(harness.context);
    harness.fabric.publish(
      message("visualization.seqviewspec.request", request("active"), { component: "reference" }),
    );
    viewer.loads[0]?.resolve(rendered(1));
    await tick();
    const native = (phase: "set" | "clear") => ({
      kind: "hover",
      phase,
      documentId: "wrapper-contract-document",
      viewId: "main",
      trackId: "track",
      layerId: "letters",
      // Clear retains the semantic fingerprint of its set; only routing uses
      // an empty application command after the wrapper boundary.
      loci: [locus],
    });
    viewer.emit(native("set"));
    viewer.emit(native("clear"));
    const messages = harness.messages.filter((entry) => entry.type === "interaction.native");
    expect(messages).toHaveLength(2);
    const first = messages[0];
    const second = messages[1];
    if (first === undefined || second === undefined)
      throw new Error("Missing native lease events.");
    expect(first.correlationId).toBe(second.correlationId);
    expect((first.payload as { interactionId: string }).interactionId).toBe(
      (second.payload as { interactionId: string }).interactionId,
    );
    await wrapper.dispose();
  });

  it("normalizes native viewport descriptors into portable interaction payloads", async () => {
    const harness = createHarnessContext();
    const viewer = new ControlledNativeMock();
    const wrapper = new ReferenceViewerWrapper({
      id: "reference",
      target: {} as HTMLElement,
      viewerFactory: () => viewer as unknown as SeqViewer,
    });
    await wrapper.start(harness.context);
    harness.fabric.publish(
      message("visualization.seqviewspec.request", request("active"), { component: "reference" }),
    );
    viewer.loads[0]?.resolve(rendered(1));
    await tick();
    viewer.emit({
      kind: "viewport-change",
      phase: "set",
      documentId: "wrapper-contract-document",
      viewId: "main",
      loci: [],
      nativeEvent: {} as Event,
      viewport: {
        offsetStart: 1,
        offsetEnd: 4,
        totalColumns: 5,
        segments: [{ segmentId: "axis", spaceId: "sequence-space", start: 1, end: 4 }],
      },
    });
    expect(harness.messages).toContainEqual(
      expect.objectContaining({
        type: "interaction.native",
        payload: expect.objectContaining({
          interaction: "viewport",
          viewport: {
            offsetStart: 1,
            offsetEnd: 4,
            totalColumns: 5,
            segments: [{ segmentId: "axis", spaceId: "sequence-space", start: 1, end: 4 }],
          },
        }),
      }),
    );
    await wrapper.dispose();
  });
});
