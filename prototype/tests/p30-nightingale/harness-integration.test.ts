import { createApplicationHarness, type HarnessMessage } from "@seq-star/harness-core";
import {
  createRendererPortabilityPlugin,
  rendererPortabilityDocument,
  rendererPortabilityDocumentDigest,
  rendererPortabilitySequenceSpace,
} from "@seq-star/integration-plugins";
import type { CoordinateLocus } from "@seq-star/seq-coords";
import { digestSeqViewSpec, type SeqViewSpec } from "@seq-star/seq-view-spec";
import type { SeqViewer, SeqViewerInteraction } from "@seq-star/seq-viewer";
import {
  type NightingaleIdentity,
  type NightingaleLoadResult,
  type NightingaleNativeDriver,
  type NightingaleNativeInteraction,
  NightingaleWrapper,
} from "@seq-star/wrapper-nightingale";
import { createReferenceViewerWrapperFactory } from "@seq-star/wrapper-seq-viewer";
import { describe, expect, it } from "vitest";

const referenceId = "reference";
const nightingaleId = "nightingale";
const locus: CoordinateLocus = {
  kind: "interval",
  space: rendererPortabilitySequenceSpace,
  start: 94,
  end: 100,
};
const flush = async (): Promise<void> => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
};

const controlledResult = (): NightingaleLoadResult => ({
  status: "degraded",
  diagnostics: [
    {
      code: "wrapper.nightingale.fallback.bars-heatmap",
      severity: "warning",
      message: "Controlled bridge mirrors the declared production fallback.",
    },
  ],
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

class ControlledReference implements SeqViewer {
  readonly capabilities = {
    representations: [
      "sequence",
      "blocks",
      "markers",
      "bars",
      "heatmap",
      "swatch",
      "links",
    ] as const,
    supportsExternalHighlight: true as const,
    supportsExternalSelection: true as const,
    supportsNativeInteractions: true as const,
  };
  private readonly listeners = new Set<(event: SeqViewerInteraction) => void>();
  readonly interactions = {
    subscribe: (
      next:
        | ((event: SeqViewerInteraction) => void)
        | { next?: (event: SeqViewerInteraction) => void },
    ) => {
      const listener = typeof next === "function" ? next : (next.next ?? (() => undefined));
      this.listeners.add(listener);
      return { unsubscribe: () => this.listeners.delete(listener) };
    },
  } as SeqViewer["interactions"];
  readonly documents: unknown[] = [];
  readonly highlights: unknown[] = [];
  readonly selections: unknown[] = [];
  readonly highlightClears: unknown[] = [];
  readonly selectionClears: unknown[] = [];
  disposed = 0;
  async load(document: typeof rendererPortabilityDocument, viewId: string) {
    this.documents.push(document);
    return {
      status: "rendered" as const,
      generation: this.documents.length,
      documentId: document.id,
      viewId,
      diagnostics: [],
      representations: [],
      layers: [],
    };
  }
  setHighlight(command: unknown): void {
    this.highlights.push(command);
  }
  setSelection(command: unknown): void {
    this.selections.push(command);
  }
  clearHighlight(owner?: unknown): void {
    this.highlightClears.push(owner);
  }
  clearSelection(owner?: unknown): void {
    this.selectionClears.push(owner);
  }
  resize(): void {}
  hitTest(): undefined {
    return undefined;
  }
  dispose(): void {
    this.disposed++;
    this.listeners.clear();
  }
  emit(kind: "hover" | "select", phase: "set" | "clear"): void {
    for (const listener of this.listeners)
      listener({
        kind,
        phase,
        documentId: rendererPortabilityDocument.id,
        viewId: "P04637-main",
        trackId: "regions",
        layerId: "region-blocks",
        loci: phase === "clear" ? [] : [locus],
      });
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}

class ControlledNightingale implements NightingaleNativeDriver {
  private readonly listeners = new Set<(event: NightingaleNativeInteraction) => void>();
  readonly interactions = {
    subscribe: (next: (event: NightingaleNativeInteraction) => void) => {
      this.listeners.add(next);
      return { unsubscribe: () => this.listeners.delete(next) };
    },
  };
  readonly documents: unknown[] = [];
  readonly applied: Array<{
    family: "highlight" | "selection";
    owner: string;
    loci: readonly CoordinateLocus[];
  }> = [];
  readonly cleared: Array<{ family: "highlight" | "selection"; owner: string }> = [];
  disposed = 0;
  async render(options: {
    readonly document: SeqViewSpec;
    readonly beforePromote?: () => void;
  }): Promise<NightingaleLoadResult> {
    this.documents.push(options.document);
    options.beforePromote?.();
    return controlledResult();
  }
  setApplied(
    family: "highlight" | "selection",
    owner: string,
    loci: readonly CoordinateLocus[],
  ): void {
    this.applied.push({ family, owner, loci });
  }
  clearApplied(family: "highlight" | "selection", owner: string): void {
    this.cleared.push({ family, owner });
  }
  resize(): void {}
  dispose(): void {
    this.disposed++;
    this.listeners.clear();
  }
  emit(interaction: "hover" | "select", phase: "set" | "clear"): void {
    this.emitEvent({ interaction, phase, loci: phase === "clear" ? [] : [locus] });
  }
  emitEvent(event: NightingaleNativeInteraction): void {
    for (const listener of this.listeners) listener(event);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}

type StagedRender = Parameters<NightingaleNativeDriver["render"]>[0];

class StagedNightingale extends ControlledNightingale {
  readonly stages: Array<{
    readonly options: StagedRender;
    readonly promote: () => void;
    readonly fail: () => void;
  }> = [];

  override render(options: StagedRender): Promise<NightingaleLoadResult> {
    this.documents.push(options.document);
    return new Promise((resolve, reject) => {
      this.stages.push({
        options,
        promote: () => {
          options.beforePromote?.();
          resolve(controlledResult());
        },
        fail: () => reject(new Error("forced staged render failure")),
      });
    });
  }
}

const nativeIdentity = (documentId: string, generation: number): NightingaleIdentity => ({
  documentId,
  viewId: "P04637-main",
  sectionId: "P04637-section",
  trackId: "regions",
  layerId: "region-blocks",
  generation,
  itemId: "dna-binding",
  nativeId: `${documentId}:${generation}:dna-binding`,
});

let requestSequence = 0;
const publishReplacement = (
  harness: ReturnType<typeof createApplicationHarness>,
  document: SeqViewSpec,
  requestId: string,
): void => {
  requestSequence++;
  harness.fabric.publish({
    id: `00000000-0000-4000-8000-${String(requestSequence).padStart(12, "0")}`,
    type: "visualization.seqviewspec.request",
    version: "0.1.0",
    source: { plugin: "p30-lifecycle-test" },
    target: { component: nightingaleId },
    correlationId: `10000000-0000-4000-8000-${String(requestSequence).padStart(12, "0")}`,
    timestamp: "2026-08-20T00:00:00.000Z",
    payload: {
      format: "seqviewspec",
      requestId,
      mode: "replace",
      document,
      viewId: "P04637-main",
    },
  } as never);
};

const mount = async (provided?: {
  readonly reference?: ControlledReference;
  readonly nightingale?: ControlledNightingale;
}) => {
  const reference = provided?.reference ?? new ControlledReference();
  const nightingale = provided?.nightingale ?? new ControlledNightingale();
  let nightingaleWrapper: NightingaleWrapper | undefined;
  const messages: HarnessMessage[] = [];
  const requests: HarnessMessage[] = [];
  const harness = createApplicationHarness(
    {
      id: "p30-integration",
      components: [
        { id: referenceId, type: "seqstar.reference-viewer" },
        { id: nightingaleId, type: "seqstar.nightingale" },
      ],
      plugins: [{ id: "renderer-portability", plugin: "seqstar.renderer-portability" }],
      synchronization: [
        {
          id: "hover",
          interaction: "hover",
          between: [referenceId, nightingaleId],
          unmapped: "clear",
        },
        {
          id: "selection",
          interaction: "select",
          between: [referenceId, nightingaleId],
          unmapped: "preserve",
        },
      ],
    },
    {
      componentFactories: [
        createReferenceViewerWrapperFactory({
          getHost: () => ({}) as HTMLElement,
          viewerFactory: () => reference,
        }),
        {
          type: "seqstar.nightingale",
          create: ({ id }) => {
            nightingaleWrapper = new NightingaleWrapper({
              id,
              target: {} as HTMLElement,
              driverFactory: () => nightingale,
            });
            return nightingaleWrapper;
          },
        },
      ],
      pluginFactories: [
        {
          plugin: "seqstar.renderer-portability",
          create: () =>
            createRendererPortabilityPlugin({
              referenceComponent: referenceId,
              nightingaleComponent: nightingaleId,
            }),
        },
      ],
      frame: (callback) => {
        queueMicrotask(callback);
        return { dispose() {} };
      },
    },
  );
  const subscription = harness.fabric.observe().subscribe((message) => {
    messages.push(message);
    if (message.type === "visualization.seqviewspec.request") requests.push(message);
  });
  await harness.start();
  await flush();
  if (nightingaleWrapper === undefined) throw new Error("Nightingale wrapper was not created.");
  return {
    harness,
    reference,
    nightingale,
    nightingaleWrapper,
    messages,
    requests,
    subscription,
  };
};

describe("P30 renderer-portability harness integration", () => {
  it("shares one document and synchronizes normalized interactions without echo or remount duplication", async () => {
    const first = await mount();
    const requestDocuments = first.requests.map(
      (message) => (message.payload as { document: unknown }).document,
    );
    expect(requestDocuments).toHaveLength(2);
    expect(requestDocuments[0]).toBe(rendererPortabilityDocument);
    expect(requestDocuments[1]).toBe(rendererPortabilityDocument);
    const expectedDigest = await rendererPortabilityDocumentDigest();
    expect(expectedDigest).toMatch(/^sha256-[a-f0-9]{64}$/u);
    expect(
      await Promise.all(
        requestDocuments.map((document) => digestSeqViewSpec(document as SeqViewSpec)),
      ),
    ).toEqual([expectedDigest, expectedDigest]);
    expect(first.reference.documents).toHaveLength(1);
    expect(first.nightingale.documents).toHaveLength(1);

    first.nightingale.emit("hover", "set");
    first.nightingale.emit("select", "set");
    await flush();
    expect(first.reference.highlights).toHaveLength(1);
    expect(first.reference.selections).toHaveLength(1);
    first.nightingale.emit("hover", "clear");
    first.nightingale.emit("select", "clear");
    await flush();
    expect(first.reference.highlightClears).toHaveLength(1);
    expect(first.reference.selectionClears).toHaveLength(1);

    first.reference.emit("hover", "set");
    first.reference.emit("select", "set");
    await flush();
    expect(first.nightingale.applied.map(({ family }) => family)).toEqual([
      "highlight",
      "selection",
    ]);
    first.reference.emit("hover", "clear");
    first.reference.emit("select", "clear");
    await flush();
    expect(first.nightingale.cleared.map(({ family }) => family)).toEqual([
      "highlight",
      "selection",
    ]);
    expect(first.messages.filter((message) => message.type === "interaction.native")).toHaveLength(
      8,
    );
    expect(first.reference.highlights).toHaveLength(1);
    expect(first.reference.selections).toHaveLength(1);
    expect(first.nightingale.applied).toHaveLength(2);

    await first.harness.disposeAsync();
    first.subscription.unsubscribe();
    expect(first.reference.listenerCount).toBe(0);
    expect(first.nightingale.listenerCount).toBe(0);
    expect(first.reference.disposed).toBe(1);
    expect(first.nightingale.disposed).toBe(1);

    const second = await mount();
    second.nightingale.emit("hover", "set");
    await flush();
    expect(second.messages.filter((message) => message.type === "interaction.native")).toHaveLength(
      1,
    );
    expect(second.reference.highlights).toHaveLength(1);
    await second.harness.disposeAsync();
    second.subscription.unsubscribe();
  });

  it("keeps active native leases through staging and clears them once on retirement", async () => {
    const staged = new StagedNightingale();
    const app = await mount({ nightingale: staged });
    expect(staged.stages).toHaveLength(1);
    staged.stages[0]?.promote();
    await flush();

    const documentA = rendererPortabilityDocument;
    const identityA = nativeIdentity(documentA.id, 1);
    const documentB: SeqViewSpec = { ...rendererPortabilityDocument, id: "P04637-staged-B" };
    const documentC: SeqViewSpec = { ...rendererPortabilityDocument, id: "P04637-promoted-C" };

    // A remains the active interaction source while B stages. Its clear must
    // reuse the lease established before B was accepted.
    staged.emitEvent({ interaction: "hover", phase: "set", loci: [locus], identity: identityA });
    await flush();
    publishReplacement(app.harness, documentB, "replacement-B");
    await flush();
    expect(staged.stages).toHaveLength(2);
    const highlightsBeforeStagingEvent = app.reference.highlights.length;
    staged.emitEvent({
      interaction: "hover",
      phase: "set",
      loci: [locus],
      identity: nativeIdentity(documentB.id, 2),
    });
    await flush();
    expect(app.reference.highlights).toHaveLength(highlightsBeforeStagingEvent);
    staged.emitEvent({ interaction: "hover", phase: "clear", loci: [], identity: identityA });
    await flush();
    expect(app.reference.highlightClears).toHaveLength(1);

    // Retaining A after B fails must retain A's ability to establish and clear
    // another lease exactly once.
    staged.stages[1]?.fail();
    await flush();
    expect(
      app.messages.some(
        (message) =>
          message.type === "lifecycle.visualization" &&
          (message.payload as { requestId?: string; previousView?: string }).requestId ===
            "replacement-B" &&
          (message.payload as { previousView?: string }).previousView === "retained",
      ),
    ).toBe(true);
    staged.emitEvent({ interaction: "hover", phase: "set", loci: [locus], identity: identityA });
    await flush();
    staged.emitEvent({ interaction: "hover", phase: "clear", loci: [], identity: identityA });
    await flush();
    expect(app.reference.highlightClears).toHaveLength(2);

    // Successful C promotion retires A and proactively closes each outstanding
    // A lease before the old native tree is removed.
    staged.emitEvent({ interaction: "hover", phase: "set", loci: [locus], identity: identityA });
    staged.emitEvent({ interaction: "select", phase: "set", loci: [locus], identity: identityA });
    await flush();
    publishReplacement(app.harness, documentC, "replacement-C");
    await flush();
    expect(staged.stages).toHaveLength(3);
    const highlightClearsBeforePromotion = app.reference.highlightClears.length;
    const selectionClearsBeforePromotion = app.reference.selectionClears.length;
    staged.stages[2]?.promote();
    await flush();
    expect(app.reference.highlightClears).toHaveLength(highlightClearsBeforePromotion + 1);
    expect(app.reference.selectionClears).toHaveLength(selectionClearsBeforePromotion + 1);

    // Delayed set or clear events from the retired tree are outside the active
    // document/generation scope and cannot create or close a C lease.
    const highlightsBeforeRetiredEvents = app.reference.highlights.length;
    staged.emitEvent({ interaction: "hover", phase: "set", loci: [locus], identity: identityA });
    staged.emitEvent({ interaction: "hover", phase: "clear", loci: [], identity: identityA });
    staged.emitEvent({ interaction: "select", phase: "clear", loci: [], identity: identityA });
    await flush();
    expect(app.reference.highlights).toHaveLength(highlightsBeforeRetiredEvents);
    expect(app.reference.highlightClears).toHaveLength(highlightClearsBeforePromotion + 1);
    expect(app.reference.selectionClears).toHaveLength(selectionClearsBeforePromotion + 1);

    // Disposal closes C's active leases once and remains idempotent.
    const identityC = nativeIdentity(documentC.id, 3);
    staged.emitEvent({ interaction: "hover", phase: "set", loci: [locus], identity: identityC });
    staged.emitEvent({ interaction: "select", phase: "set", loci: [locus], identity: identityC });
    await flush();
    const highlightClearsBeforeDispose = app.reference.highlightClears.length;
    const selectionClearsBeforeDispose = app.reference.selectionClears.length;
    await app.nightingaleWrapper.dispose();
    await flush();
    expect(app.reference.highlightClears).toHaveLength(highlightClearsBeforeDispose + 1);
    expect(app.reference.selectionClears).toHaveLength(selectionClearsBeforeDispose + 1);
    await app.nightingaleWrapper.dispose();
    await flush();
    expect(app.reference.highlightClears).toHaveLength(highlightClearsBeforeDispose + 1);
    expect(app.reference.selectionClears).toHaveLength(selectionClearsBeforeDispose + 1);

    const nativeMessages = app.messages.filter(
      (message) =>
        message.type === "interaction.native" &&
        "component" in message.source &&
        message.source.component === nightingaleId,
    );
    const sets = nativeMessages.filter(
      (message) => (message.payload as { phase?: string }).phase === "set",
    );
    const clears = nativeMessages.filter(
      (message) => (message.payload as { phase?: string }).phase === "clear",
    );
    expect(clears).toHaveLength(sets.length);
    for (const clear of clears) {
      const clearPayload = clear.payload as { interactionId?: string };
      expect(
        sets.filter(
          (set) =>
            (set.payload as { interactionId?: string }).interactionId ===
              clearPayload.interactionId && set.correlationId === clear.correlationId,
        ),
      ).toHaveLength(1);
    }

    await app.harness.disposeAsync();
    app.subscription.unsubscribe();
  });
});
