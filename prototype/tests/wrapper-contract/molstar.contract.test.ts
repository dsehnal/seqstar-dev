import {
  type ComponentContext,
  createApplicationHarness,
  type HarnessComponent,
  type HarnessMessage,
  type InteractionCommand,
  type InteractionOwner,
} from "@seq-star/harness-core";
import {
  barnaseSequenceSpace,
  barstarSequenceSpace,
  type ComplexMappingRow,
  createComplexMappingTranslators,
} from "@seq-star/integration-plugins";
import type { CoordinateLocus } from "@seq-star/seq-coords";
import { coordinateLocusEquals } from "@seq-star/seq-coords";
import { describe, expect, it, vi } from "vitest";
import {
  createSyntheticMultiModelStructure,
  createSyntheticPeptideMvs,
} from "../../packages/wrapper-molstar/src/p01b/mvs.js";
import {
  extractResidues,
  findStructureLoci,
  type NativeResidueEvent,
  type ResidueIdentity,
} from "../../packages/wrapper-molstar/src/p01b/residues.js";
import {
  type MolstarNativeDriver,
  MolstarViewerDriver,
  MolstarWrapper,
  residueLocus,
} from "../../packages/wrapper-molstar/src/wrapper.js";
import { createHarnessContext, message, runWrapperConformance, uuid } from "./contract-kit.js";

const residue = {
  structureId: "structure-a",
  modelEntryId: "synthetic",
  modelId: "model-a",
  modelIndex: 0,
  modelNumber: 1,
  unitId: 11,
  operatorName: "1_555",
  instanceId: "instance-a",
  entityId: "1",
  labelAsymId: "A",
  authAsymId: "A",
  labelSeqId: 1,
  authSeqId: 101,
  insertionCode: "",
  componentId: "ALA",
} as const;
const sameLabelsOtherModel = {
  ...residue,
  structureId: "structure-b",
  modelId: "model-b",
  modelIndex: 1,
  modelNumber: 2,
  unitId: 22,
  instanceId: "instance-b",
} as const;
const locus = residueLocus(residue);
const complexBarnaseResidue = {
  ...residue,
  structureId: "1BRS-complex",
  modelEntryId: "1BRS",
  modelId: "1BRS-model",
  unitId: 31,
  instanceId: "1BRS-A",
  entityId: "1",
  labelAsymId: "A",
  authAsymId: "A",
  labelSeqId: 27,
  authSeqId: 27,
  componentId: "LYS",
} as const;
const complexBarstarResidue = {
  ...complexBarnaseResidue,
  unitId: 42,
  instanceId: "1BRS-D",
  entityId: "2",
  labelAsymId: "D",
  authAsymId: "D",
  labelSeqId: 38,
  authSeqId: 38,
  componentId: "ASP",
} as const;

const complexBarnaseRow: ComplexMappingRow = {
  accession: "P00648",
  sourceIndex: 26,
  sourceResidue: "K",
  labelAsymId: "A",
  authAsymId: "A",
  labelSeqId: 27,
  authSeqId: 27,
  structureResidue: "LYS",
  observed: true,
  residueMatch: true,
  status: "exact",
};
const complexBarstarRow: ComplexMappingRow = {
  accession: "P11540",
  sourceIndex: 37,
  sourceResidue: "D",
  labelAsymId: "D",
  authAsymId: "D",
  labelSeqId: 38,
  authSeqId: 38,
  structureResidue: "ASP",
  observed: true,
  residueMatch: true,
  status: "exact",
};

class ControlledMolstarDriver implements MolstarNativeDriver {
  readonly loads: Array<{
    readonly document: unknown;
    readonly signal: AbortSignal;
    resolve(): void;
    reject(error: Error): void;
  }> = [];
  private readonly listeners = new Set<
    (
      event: Parameters<MolstarNativeDriver["subscribeNative"]>[0] extends (event: infer E) => void
        ? E
        : never,
    ) => void
  >();
  private readonly listenerHistory: Array<Parameters<MolstarNativeDriver["subscribeNative"]>[0]> =
    [];
  readonly calls: Array<{
    readonly action: "highlight" | "select" | "focus";
    readonly schemas: number;
    readonly targets: readonly string[];
  }> = [];
  disposed = 0;
  clearCalls = 0;
  staged = 0;
  revealed = 0;
  visibleDocument: unknown;
  private currentDocument: unknown;
  private loadTail: Promise<void> = Promise.resolve();

  clearError: Error | undefined;

  constructor(
    private readonly residues: readonly ResidueIdentity[] = [residue],
    private readonly serializeLoads = false,
  ) {}

  stage(): void {
    this.staged++;
  }
  reveal(): void {
    this.revealed++;
    this.visibleDocument = this.currentDocument;
  }
  loadAndWaitForFirstFrame(document: unknown, signal: AbortSignal): Promise<void> {
    const start = () =>
      new Promise<void>((resolve, reject) => {
        this.currentDocument = document;
        this.loads.push({ document, signal, resolve, reject });
      });
    if (!this.serializeLoads) return start();
    const queued = this.loadTail.then(start);
    this.loadTail = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }
  subscribeNative(
    listener: (
      event: Parameters<MolstarNativeDriver["subscribeNative"]>[0] extends (event: infer E) => void
        ? E
        : never,
    ) => void,
  ) {
    this.listeners.add(listener);
    this.listenerHistory.push(listener);
    return { unsubscribe: () => this.listeners.delete(listener) };
  }
  knownResidues() {
    return this.residues;
  }
  resolve(locus: CoordinateLocus, _schema: never) {
    const matching = this.residues.filter((candidate) =>
      coordinateLocusEquals(residueLocus(candidate), locus),
    );
    return matching.map(
      (candidate) =>
        ({ target: candidate.structureId }) as unknown as ReturnType<
          MolstarNativeDriver["resolve"]
        >[number],
    );
  }
  apply(
    action: "highlight" | "select" | "focus",
    loci: ReturnType<MolstarNativeDriver["resolve"]>,
  ): void {
    this.calls.push({
      action,
      schemas: loci.length,
      targets: loci.map((item) => (item as unknown as { target: string }).target),
    });
    // The real Mol* stream is synchronous for imperative interactivity. This
    // proves the wrapper's no-echo guard at that boundary.
    this.emit({ kind: "hover", residues: [residue] });
  }
  clearView(): Promise<void> {
    this.clearCalls++;
    return this.clearError === undefined ? Promise.resolve() : Promise.reject(this.clearError);
  }
  resize(): void {}
  dispose(): void {
    this.disposed++;
  }
  emit(event: NativeResidueEvent): void {
    for (const listener of this.listeners) listener(event);
  }
  emitStale(index: number, event: Parameters<(typeof this.listenerHistory)[number]>[0]): void {
    this.listenerHistory[index]?.(event);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}

class RecordingSequenceComponent implements HarnessComponent {
  readonly capabilities = ["seqstar:coordinates/sequence"] as const;
  readonly received: HarnessMessage[] = [];
  readonly highlights = new Map<string, readonly CoordinateLocus[]>();
  readonly selections = new Map<string, readonly CoordinateLocus[]>();
  private subscription: { unsubscribe(): void } | undefined;

  constructor(
    readonly id: string,
    private readonly spaces: readonly [typeof barnaseSequenceSpace, typeof barstarSequenceSpace],
  ) {}

  async start(context: ComponentContext): Promise<void> {
    context.reportCoordinateSpaces(this.spaces);
    this.subscription = context.fabric
      .observe({ targetComponent: this.id })
      .subscribe((message) => {
        this.received.push(message);
        const command = message.payload as unknown as InteractionCommand;
        const states = message.type.startsWith("interaction.highlight")
          ? this.highlights
          : message.type.startsWith("interaction.selection")
            ? this.selections
            : undefined;
        if (states === undefined) return;
        const owner = command.owner;
        if (owner === undefined) return;
        const key = `${owner.correlationId}\u0000${owner.sourceComponent}`;
        if (message.type.endsWith(".apply")) states.set(key, command.loci);
        else if (message.type.endsWith(".clear")) states.delete(key);
      });
  }

  dispose(): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
  }
}

const request = (requestId: string) => ({
  format: "mvs",
  requestId,
  mode: "replace" as const,
  // Message envelopes accept JSON only; the builder result is normalized here
  // before it reaches the harness event fabric.
  document: JSON.parse(JSON.stringify(createSyntheticPeptideMvs())) as object,
});
const apply = (owner: InteractionOwner, interactionId: string, loci: readonly CoordinateLocus[]) =>
  ({ interactionId, owner, mode: "replace" as const, loci }) satisfies InteractionCommand;

const tick = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

runWrapperConformance({
  name: "Mol* MVS",
  requestTopic: "visualization.mvs.request",
  create: () => {
    const driver = new ControlledMolstarDriver();
    return {
      wrapper: new MolstarWrapper({
        id: "molstar",
        target: {} as HTMLElement,
        driverFactory: async () => driver,
      }),
      driver: {
        listenerCount: () => driver.listenerCount,
        loadSignal: (index) => driver.loads[index]?.signal,
        resolveLoad: (index) => driver.loads[index]?.resolve(),
        emitNative: () => driver.emit({ kind: "hover", residues: [residue] }),
        appliedCount: () => (driver.calls.some((call) => call.schemas > 0) ? 1 : 0),
        clearCount: () =>
          driver.calls.reduce((count, call, index, calls) => {
            const previous = calls[index - 1];
            return previous !== undefined &&
              previous.action === call.action &&
              call.schemas < previous.schemas
              ? count + 1
              : count;
          }, 0),
      },
    };
  },
  makeValidRequest: request,
  makeApplyMessage: (owner, target) =>
    message("interaction.highlight.apply", apply(owner as InteractionOwner, "owned", [locus]), {
      component: target,
    }),
  makeClearMessage: (owner, target) =>
    message(
      "interaction.highlight.clear",
      { interactionId: "owned", owner },
      { component: target },
    ),
});

describe("Mol* wrapper production boundary", () => {
  it("maps production Mol* native chain A/D hover and selection to their exact sequence columns without echoes", async () => {
    const driver = new ControlledMolstarDriver([complexBarnaseResidue, complexBarstarResidue]);
    let sequence: RecordingSequenceComponent | undefined;
    const native: HarnessMessage[] = [];
    const harness = createApplicationHarness(
      {
        id: "complex-wrapper-reverse-interaction",
        components: [
          { id: "complex-structure", type: "seqstar.molstar-mvs" },
          { id: "complex-sequence", type: "test.recording-sequence" },
        ],
        synchronization: [
          {
            id: "complex-hover",
            interaction: "hover",
            between: ["complex-sequence", "complex-structure"],
            unmapped: "clear",
          },
          {
            id: "complex-select",
            interaction: "select",
            between: ["complex-sequence", "complex-structure"],
            unmapped: "preserve",
          },
        ],
      },
      {
        componentFactories: [
          {
            type: "seqstar.molstar-mvs",
            create: ({ id }) =>
              new MolstarWrapper({
                id,
                target: {} as HTMLElement,
                driverFactory: async () => driver,
              }),
          },
          {
            type: "test.recording-sequence",
            create: ({ id }) => {
              sequence = new RecordingSequenceComponent(id, [
                barnaseSequenceSpace,
                barstarSequenceSpace,
              ]);
              return sequence;
            },
          },
        ],
        frame: (callback) => {
          queueMicrotask(callback);
          return { dispose() {} };
        },
      },
    );
    const subscription = harness.fabric.observe().subscribe((message) => {
      if (message.type === "interaction.native") native.push(message);
    });
    await harness.start();
    for (const translator of [
      ...createComplexMappingTranslators([complexBarnaseRow]),
      ...createComplexMappingTranslators([complexBarstarRow]),
    ])
      harness.translators.register(translator);
    harness.fabric.publish(
      message("visualization.mvs.request", request("complex-native-interaction"), {
        component: "complex-structure",
      }),
    );
    await tick();
    driver.loads[0]?.resolve();
    await tick();
    if (sequence === undefined) throw new Error("Expected the recording sequence component.");

    const flush = async (): Promise<void> => {
      await tick();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await tick();
    };
    const current = (states: ReadonlyMap<string, readonly CoordinateLocus[]>) => [
      ...states.values(),
    ];
    const barnaseColumn: CoordinateLocus = {
      kind: "point",
      space: barnaseSequenceSpace,
      position: { kind: "index", value: 26 },
    };
    const barstarColumn: CoordinateLocus = {
      kind: "point",
      space: barstarSequenceSpace,
      position: { kind: "index", value: 37 },
    };

    // These events enter through the production MolstarWrapper driver's native
    // subscription. No test or React code publishes interaction.native.
    driver.emit({ kind: "hover", residues: [complexBarnaseResidue] });
    await flush();
    expect(current(sequence.highlights)).toEqual([[barnaseColumn]]);
    driver.emit({ kind: "hover", residues: [complexBarstarResidue] });
    await flush();
    expect(current(sequence.highlights)).toEqual([[barstarColumn]]);
    driver.emit({ kind: "hover", residues: [] });
    await flush();
    expect(current(sequence.highlights)).toEqual([]);

    driver.emit({ kind: "selection-add", residues: [complexBarnaseResidue] });
    await flush();
    expect(current(sequence.selections)).toEqual([[barnaseColumn]]);
    driver.emit({ kind: "selection-clear", residues: [] });
    await flush();
    expect(current(sequence.selections)).toEqual([]);
    driver.emit({ kind: "selection-add", residues: [complexBarstarResidue] });
    await flush();
    expect(current(sequence.selections)).toEqual([[barstarColumn]]);
    driver.emit({ kind: "selection-clear", residues: [] });
    await flush();
    expect(current(sequence.selections)).toEqual([]);

    expect(native).toHaveLength(7);
    expect(native.every((event) => event.source.component === "complex-structure")).toBe(true);
    // Mol* renders its own current native mark, but its synchronous imperative
    // callback cannot feed a second interaction.native event back into the
    // harness while the wrapper is applying that mark.
    expect(driver.calls.map((call) => [call.action, call.schemas])).toEqual([
      ["highlight", 1],
      ["highlight", 1],
      ["highlight", 0],
      ["select", 1],
      ["select", 0],
      ["select", 1],
      ["select", 0],
    ]);
    expect(
      sequence.received.filter((event) => event.type === "interaction.highlight.apply"),
    ).toHaveLength(2);
    expect(
      sequence.received.filter((event) => event.type === "interaction.selection.apply"),
    ).toHaveLength(2);
    await harness.disposeAsync();
    subscription.unsubscribe();
  });

  it("filters a real multi-model Mol* candidate to the one requested unit and residue", async () => {
    const structure = await createSyntheticMultiModelStructure();
    const entries = [{ transform: { ref: "multi-model-root" }, obj: { data: structure } }];
    const viewer = { plugin: { state: { data: { selectQ: () => entries } } } };
    const driver = new (
      MolstarViewerDriver as unknown as new (
        viewer: unknown,
        target: HTMLElement,
      ) => MolstarViewerDriver
    )(viewer, { style: {} } as HTMLElement);
    const requested = driver
      .knownResidues()
      .find((candidate) => candidate.modelIndex === 0 && candidate.labelSeqId === 1);
    if (requested === undefined) throw new Error("Synthetic Mol* residue was not parsed.");
    const schema = {
      operator_name: requested.operatorName,
      instance_id: requested.instanceId,
      label_entity_id: requested.entityId,
      label_asym_id: requested.labelAsymId,
      auth_asym_id: requested.authAsymId,
      label_seq_id: requested.labelSeqId,
      auth_seq_id: requested.authSeqId,
    };
    const candidate = findStructureLoci(viewer as never, schema)[0];
    expect(
      new Set(
        extractResidues(candidate, "multi-model-root").map((identity) => identity.modelIndex),
      ),
    ).toEqual(new Set([0, 1]));

    const resolved = driver.resolve(residueLocus(requested), schema);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.structure).toBe(structure);
    const exact = extractResidues(resolved[0], "multi-model-root");
    expect(new Set(exact.map((identity) => identity.modelIndex))).toEqual(new Set([0]));
    expect(new Set(exact.map((identity) => identity.unitId))).toEqual(new Set([requested.unitId]));
  });

  it("applies already-resolved loci directly through Mol* managers", () => {
    const highlightOnly = vi.fn();
    const highlight = vi.fn();
    const clearHighlights = vi.fn();
    const deselectAll = vi.fn();
    const selectOnly = vi.fn();
    const select = vi.fn();
    const focusLoci = vi.fn();
    const requestCameraReset = vi.fn();
    const viewer = {
      plugin: {
        managers: {
          interactivity: {
            lociHighlights: { highlightOnly, highlight, clearHighlights },
            lociSelects: { deselectAll, selectOnly, select },
          },
          camera: { focusLoci },
        },
        canvas3d: { requestCameraReset },
      },
    };
    const driver = new (
      MolstarViewerDriver as unknown as new (
        viewer: unknown,
        target: HTMLElement,
      ) => MolstarViewerDriver
    )(viewer, { style: {} } as HTMLElement);
    const exactA = { target: "model-a" } as unknown as ReturnType<
      MolstarNativeDriver["resolve"]
    >[number];
    const exactB = { target: "model-b" } as unknown as ReturnType<
      MolstarNativeDriver["resolve"]
    >[number];

    driver.apply("highlight", [exactA, exactB]);
    expect(clearHighlights).toHaveBeenCalledOnce();
    expect(clearHighlights.mock.invocationCallOrder[0]).toBeLessThan(
      highlightOnly.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(highlightOnly).toHaveBeenCalledWith({ loci: exactA }, false);
    expect(highlight).toHaveBeenCalledWith({ loci: exactB }, false);
    driver.apply("select", [exactA, exactB]);
    expect(selectOnly).toHaveBeenCalledWith({ loci: exactA }, false);
    expect(select).toHaveBeenCalledWith({ loci: exactB }, false);
    expect(deselectAll).not.toHaveBeenCalled();
    driver.apply("select", []);
    expect(deselectAll).toHaveBeenCalledOnce();
    driver.apply("focus", [exactA, exactB]);
    expect(focusLoci).toHaveBeenCalledWith([exactA, exactB]);
    driver.apply("focus", []);
    expect(requestCameraReset).toHaveBeenCalledOnce();
  });

  it("serializes non-abortable native loads and never accepts an older draw for the latest view", async () => {
    const drawListeners = new Set<() => void>();
    const nativeLoads: Array<{ readonly data: string; resolve(): void }> = [];
    const target = { style: { visibility: "" } } as unknown as HTMLElement;
    const canvas = {
      reprCount: { value: 1 },
      didDraw: {
        subscribe(listener: () => void) {
          drawListeners.add(listener);
          return { unsubscribe: () => drawListeners.delete(listener) };
        },
      },
      requestDraw() {
        for (const listener of drawListeners) listener();
      },
    };
    const viewer = {
      plugin: { canvas3d: canvas },
      loadMvsData(data: string) {
        return new Promise<void>((resolve) => nativeLoads.push({ data, resolve }));
      },
    };
    const driver = new (
      MolstarViewerDriver as unknown as new (
        viewer: unknown,
        target: HTMLElement,
      ) => MolstarViewerDriver
    )(viewer, target);
    const documentA = { ...request("A").document, metadata: { title: "native-A" } };
    const documentB = { ...request("B").document, metadata: { title: "native-B" } };
    const firstController = new AbortController();
    const secondController = new AbortController();

    driver.stage();
    const first = driver.loadAndWaitForFirstFrame(documentA, firstController.signal);
    await tick();
    const second = driver.loadAndWaitForFirstFrame(documentB, secondController.signal);
    firstController.abort();
    expect(nativeLoads).toHaveLength(1);
    expect(target.style.visibility).toBe("hidden");
    nativeLoads[0]?.resolve();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await tick();
    expect(nativeLoads).toHaveLength(2);
    let secondReady = false;
    void second.then(() => {
      secondReady = true;
    });
    for (const listener of drawListeners) listener();
    await tick();
    expect(secondReady).toBe(false);
    nativeLoads[1]?.resolve();
    await second;
    expect(nativeLoads[1]?.data).toContain("native-B");
    expect(target.style.visibility).toBe("hidden");
    driver.reveal();
    expect(target.style.visibility).toBe("");
  });

  it("validates before acceptance and does not supersede an accepted load with invalid MVS", async () => {
    const harness = createHarnessContext();
    const driver = new ControlledMolstarDriver();
    const wrapper = new MolstarWrapper({
      id: "molstar",
      target: {} as HTMLElement,
      driverFactory: async () => driver,
    });
    await wrapper.start(harness.context);
    harness.fabric.publish(
      message("visualization.mvs.request", request("accepted"), { component: "molstar" }),
    );
    harness.fabric.publish(
      message(
        "visualization.mvs.request",
        { format: "mvs", requestId: "bad", mode: "replace", document: {} },
        { component: "molstar" },
      ),
    );
    expect(driver.loads).toHaveLength(1);
    expect(driver.loads[0]?.signal.aborted).toBe(false);
    driver.loads[0]?.resolve();
    await tick();
    expect(harness.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "lifecycle.visualization",
          payload: expect.objectContaining({ requestId: "bad", status: "failed" }),
        }),
        expect.objectContaining({
          type: "lifecycle.visualization",
          payload: expect.objectContaining({ requestId: "accepted", status: "rendered" }),
        }),
      ]),
    );
    await wrapper.dispose();
  });

  it("keeps a superseded slow native load hidden until the serialized latest view renders", async () => {
    const harness = createHarnessContext();
    const driver = new ControlledMolstarDriver([residue], true);
    const wrapper = new MolstarWrapper({
      id: "molstar",
      target: {} as HTMLElement,
      driverFactory: async () => driver,
    });
    await wrapper.start(harness.context);
    const firstRequest = request("slow-A");
    const latestRequest = request("latest-B");
    harness.fabric.publish(
      message("visualization.mvs.request", firstRequest, { component: "molstar" }),
    );
    await tick();
    expect(driver.loads).toHaveLength(1);
    harness.fabric.publish(
      message("visualization.mvs.request", latestRequest, { component: "molstar" }),
    );
    expect(driver.staged).toBe(2);
    driver.loads[0]?.resolve();
    await tick();
    expect(driver.loads).toHaveLength(2);
    expect(driver.revealed).toBe(0);
    expect(
      harness.messages.some(
        (event) =>
          event.type === "lifecycle.visualization" &&
          event.payload.requestId === "slow-A" &&
          event.payload.status === "rendered",
      ),
    ).toBe(false);
    driver.loads[1]?.resolve();
    await tick();
    expect(driver.visibleDocument).toBe(latestRequest.document);
    expect(driver.revealed).toBe(1);
    expect(harness.messages).toContainEqual(
      expect.objectContaining({
        type: "lifecycle.visualization",
        payload: expect.objectContaining({ requestId: "latest-B", status: "rendered" }),
      }),
    );
    await wrapper.dispose();
  });

  it("uses exact active structure identity and recomputes the union per owner", async () => {
    const harness = createHarnessContext();
    const driver = new ControlledMolstarDriver();
    const wrapper = new MolstarWrapper({
      id: "molstar",
      target: {} as HTMLElement,
      driverFactory: async () => driver,
    });
    await wrapper.start(harness.context);
    harness.fabric.publish(
      message("visualization.mvs.request", request("active"), { component: "molstar" }),
    );
    driver.loads[0]?.resolve();
    await tick();
    const ownerA = { correlationId: uuid(), sourceComponent: "a" };
    const ownerB = { correlationId: uuid(), sourceComponent: "b" };
    driver.emit({ kind: "hover", residues: [residue] });
    harness.fabric.publish(
      message("interaction.highlight.apply", apply(ownerA, "a", [locus]), { component: "molstar" }),
    );
    harness.fabric.publish(
      message("interaction.highlight.apply", apply(ownerB, "b", [locus]), { component: "molstar" }),
    );
    expect(driver.calls.at(-1)).toMatchObject({ action: "highlight", schemas: 3 });
    harness.fabric.publish(
      message("interaction.highlight.clear", { owner: ownerA }, { component: "molstar" }),
    );
    expect(driver.calls.at(-1)).toMatchObject({ action: "highlight", schemas: 2 });
    const unrelated = {
      ...locus,
      space: { ...locus.space, context: { ...locus.space.context, structure: "other" } },
    } as CoordinateLocus;
    harness.fabric.publish(
      message("interaction.highlight.apply", apply(ownerA, "bad", [unrelated]), {
        component: "molstar",
      }),
    );
    expect(harness.messages).toContainEqual(
      expect.objectContaining({
        type: "harness.diagnostic",
        payload: expect.objectContaining({
          diagnostics: expect.arrayContaining([
            expect.objectContaining({ code: "wrapper.molstar.command.unmapped" }),
          ]),
        }),
      }),
    );
    await wrapper.dispose();
  });

  it("preserves label and author numbering while isolating identical labels across structures/models", async () => {
    const harness = createHarnessContext();
    const driver = new ControlledMolstarDriver([residue, sameLabelsOtherModel]);
    const wrapper = new MolstarWrapper({
      id: "molstar",
      target: {} as HTMLElement,
      driverFactory: async () => driver,
    });
    await wrapper.start(harness.context);
    harness.fabric.publish(
      message("visualization.mvs.request", request("two-models"), { component: "molstar" }),
    );
    driver.loads[0]?.resolve();
    await tick();
    const first = residueLocus(residue);
    const second = residueLocus(sameLabelsOtherModel);
    expect(first.position).toEqual({ kind: "label", value: "label:1|auth:101" });
    expect(first.space.context).toMatchObject({
      entry: "synthetic",
      structure: "structure-a",
      model: "model-a",
      "model-index": "0",
      "model-number": "1",
      entity: "1",
      "label-asym": "A",
      "auth-asym": "A",
      unit: "11",
    });
    expect(coordinateLocusEquals(first, second)).toBe(false);
    const owner = { correlationId: uuid(), sourceComponent: "identity-test" };
    harness.fabric.publish(
      message("interaction.highlight.apply", apply(owner, "first", [first]), {
        component: "molstar",
      }),
    );
    expect(driver.calls.at(-1)).toMatchObject({ schemas: 1, targets: ["structure-a"] });
    const forged = {
      ...first,
      space: { ...first.space, context: { ...first.space.context, model: "not-active" } },
    } as CoordinateLocus;
    harness.fabric.publish(
      message("interaction.highlight.apply", apply(owner, "forged", [forged]), {
        component: "molstar",
      }),
    );
    expect(harness.messages).toContainEqual(
      expect.objectContaining({
        type: "harness.diagnostic",
        payload: expect.objectContaining({
          diagnostics: expect.arrayContaining([
            expect.objectContaining({ code: "wrapper.molstar.command.unmapped" }),
          ]),
        }),
      }),
    );
    await wrapper.dispose();
  });

  it("keeps every exact selection and focus owner without fanning out to matching models", async () => {
    const harness = createHarnessContext();
    const driver = new ControlledMolstarDriver([residue, sameLabelsOtherModel]);
    const wrapper = new MolstarWrapper({
      id: "molstar",
      target: {} as HTMLElement,
      driverFactory: async () => driver,
    });
    await wrapper.start(harness.context);
    harness.fabric.publish(
      message("visualization.mvs.request", request("two-structures"), { component: "molstar" }),
    );
    driver.loads[0]?.resolve();
    await tick();
    const ownerA = { correlationId: uuid(), sourceComponent: "a" };
    const ownerB = { correlationId: uuid(), sourceComponent: "b" };
    harness.fabric.publish(
      message("interaction.selection.apply", apply(ownerA, "select-a", [residueLocus(residue)]), {
        component: "molstar",
      }),
    );
    harness.fabric.publish(
      message(
        "interaction.selection.apply",
        apply(ownerB, "select-b", [residueLocus(sameLabelsOtherModel)]),
        { component: "molstar" },
      ),
    );
    expect(driver.calls.at(-1)).toMatchObject({
      action: "select",
      schemas: 2,
      targets: ["structure-a", "structure-b"],
    });
    harness.fabric.publish(
      message("interaction.focus.apply", apply(ownerA, "focus-a", [residueLocus(residue)]), {
        component: "molstar",
      }),
    );
    harness.fabric.publish(
      message(
        "interaction.focus.apply",
        apply(ownerB, "focus-b", [residueLocus(sameLabelsOtherModel)]),
        { component: "molstar" },
      ),
    );
    expect(driver.calls.at(-1)).toMatchObject({ action: "focus", schemas: 2 });
    harness.fabric.publish(
      message("interaction.focus.clear", { owner: ownerA }, { component: "molstar" }),
    );
    expect(driver.calls.at(-1)).toMatchObject({
      action: "focus",
      schemas: 1,
      targets: ["structure-b"],
    });
    harness.fabric.publish(
      message("interaction.focus.clear", { owner: ownerB }, { component: "molstar" }),
    );
    expect(driver.calls.at(-1)).toMatchObject({ action: "focus", schemas: 0 });
    await wrapper.dispose();
  });

  it("ignores detached prior-generation native callbacks during replacement", async () => {
    const harness = createHarnessContext();
    const driver = new ControlledMolstarDriver();
    const wrapper = new MolstarWrapper({
      id: "molstar",
      target: {} as HTMLElement,
      driverFactory: async () => driver,
    });
    await wrapper.start(harness.context);
    harness.fabric.publish(
      message("visualization.mvs.request", request("old"), { component: "molstar" }),
    );
    driver.loads[0]?.resolve();
    await tick();
    harness.fabric.publish(
      message("visualization.mvs.request", request("new"), { component: "molstar" }),
    );
    const before = harness.messages.filter((item) => item.type === "interaction.native").length;
    driver.emitStale(1, { kind: "hover", residues: [residue] });
    expect(harness.messages.filter((item) => item.type === "interaction.native")).toHaveLength(
      before,
    );
    driver.loads[1]?.resolve();
    await tick();
    driver.emit({ kind: "hover", residues: [residue] });
    expect(harness.messages.filter((item) => item.type === "interaction.native")).toHaveLength(
      before + 1,
    );
    expect(
      harness.messages.filter((item) => item.type === "interaction.native").at(-1)?.payload,
    ).toMatchObject({ origin: { documentId: "new" } });
    await wrapper.dispose();
  });

  it("clears the native view only when the configured failure policy requests it", async () => {
    const harness = createHarnessContext();
    const driver = new ControlledMolstarDriver();
    const wrapper = new MolstarWrapper({
      id: "molstar",
      target: {} as HTMLElement,
      config: { failureViewPolicy: "clear" },
      driverFactory: async () => driver,
    });
    await wrapper.start(harness.context);
    harness.fabric.publish(
      message("visualization.mvs.request", request("visible"), { component: "molstar" }),
    );
    driver.loads[0]?.resolve();
    await tick();
    harness.fabric.publish(
      message("visualization.mvs.request", request("broken-load"), { component: "molstar" }),
    );
    driver.loads[1]?.reject(new Error("synthetic failure"));
    await tick();
    expect(driver.clearCalls).toBe(1);
    expect(harness.messages).toContainEqual(
      expect.objectContaining({
        type: "lifecycle.visualization",
        payload: expect.objectContaining({
          requestId: "broken-load",
          status: "failed",
          previousView: "cleared",
        }),
      }),
    );
    await wrapper.dispose();
  });

  it("reloads and reactivates the prior MVS when a replacement fails under retain policy", async () => {
    const harness = createHarnessContext();
    const driver = new ControlledMolstarDriver();
    const wrapper = new MolstarWrapper({
      id: "molstar",
      target: {} as HTMLElement,
      config: { failureViewPolicy: "retain" },
      driverFactory: async () => driver,
    });
    await wrapper.start(harness.context);
    harness.fabric.publish(
      message("visualization.mvs.request", request("visible"), { component: "molstar" }),
    );
    driver.loads[0]?.resolve();
    await tick();
    driver.emit({ kind: "hover", residues: [residue] });
    harness.fabric.publish(
      message("visualization.mvs.request", request("broken"), { component: "molstar" }),
    );
    driver.loads[1]?.reject(new Error("replacement failed"));
    await tick();
    expect(driver.loads).toHaveLength(3);
    driver.loads[2]?.resolve();
    await tick();
    expect(driver.clearCalls).toBe(0);
    expect(driver.listenerCount).toBe(1);
    expect(harness.messages).toContainEqual(
      expect.objectContaining({
        type: "lifecycle.visualization",
        payload: expect.objectContaining({
          requestId: "broken",
          status: "failed",
          visibleRequestId: "visible",
          previousView: "retained",
        }),
      }),
    );
    const before = harness.messages.filter((event) => event.type === "interaction.native").length;
    driver.emit({ kind: "hover", residues: [residue] });
    expect(harness.messages.filter((event) => event.type === "interaction.native")).toHaveLength(
      before + 1,
    );
    await wrapper.dispose();
  });

  it("reports unknown prior state when rollback and clear both fail", async () => {
    const harness = createHarnessContext();
    const driver = new ControlledMolstarDriver();
    const wrapper = new MolstarWrapper({
      id: "molstar",
      target: {} as HTMLElement,
      config: { failureViewPolicy: "retain" },
      driverFactory: async () => driver,
    });
    await wrapper.start(harness.context);
    harness.fabric.publish(
      message("visualization.mvs.request", request("visible"), { component: "molstar" }),
    );
    driver.loads[0]?.resolve();
    await tick();
    harness.fabric.publish(
      message("visualization.mvs.request", request("broken"), { component: "molstar" }),
    );
    driver.loads[1]?.reject(new Error("replacement failed"));
    await tick();
    driver.clearError = new Error("clear failed");
    driver.loads[2]?.reject(new Error("rollback failed"));
    await tick();
    const lifecycle = harness.messages.find(
      (event) =>
        event.type === "lifecycle.visualization" &&
        event.payload.requestId === "broken" &&
        event.payload.status === "failed",
    );
    expect(lifecycle?.payload).not.toHaveProperty("previousView");
    expect(lifecycle?.payload).not.toHaveProperty("visibleRequestId");
    expect(lifecycle?.payload).toMatchObject({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "wrapper.molstar.rollback.failed" }),
        expect.objectContaining({ code: "wrapper.molstar.clear.failed" }),
      ]),
    });
    expect(driver.clearCalls).toBe(1);
    await wrapper.dispose();
  });

  it("reuses native interaction leases and reapplies external marks after native clear", async () => {
    const harness = createHarnessContext();
    const driver = new ControlledMolstarDriver([residue, sameLabelsOtherModel]);
    const wrapper = new MolstarWrapper({
      id: "molstar",
      target: {} as HTMLElement,
      driverFactory: async () => driver,
    });
    await wrapper.start(harness.context);
    harness.fabric.publish(
      message("visualization.mvs.request", request("active"), { component: "molstar" }),
    );
    driver.loads[0]?.resolve();
    await tick();
    const externalOwner = { correlationId: uuid(), sourceComponent: "external" };
    harness.fabric.publish(
      message("interaction.highlight.apply", apply(externalOwner, "external", [locus]), {
        component: "molstar",
      }),
    );
    const before = harness.messages.filter((event) => event.type === "interaction.native").length;
    driver.emit({ kind: "hover", residues: [residue] });
    driver.emit({ kind: "hover", residues: [] });
    const hoverEvents = harness.messages
      .filter((event) => event.type === "interaction.native")
      .slice(before);
    expect(hoverEvents).toHaveLength(2);
    expect(hoverEvents[0]?.payload).toMatchObject({ phase: "set" });
    expect(hoverEvents[1]?.payload).toMatchObject({
      interactionId: hoverEvents[0]?.payload.interactionId,
      phase: "clear",
    });
    expect(hoverEvents[1]?.correlationId).toBe(hoverEvents[0]?.correlationId);
    expect(driver.calls.at(-1)).toMatchObject({ action: "highlight", schemas: 1 });

    const selectionOwner = { correlationId: uuid(), sourceComponent: "selection-source" };
    const selectionMessage = (
      mode: "replace" | "add" | "remove" | "toggle",
      loci: CoordinateLocus[],
    ) =>
      message(
        "interaction.selection.apply",
        { interactionId: "selection-set", owner: selectionOwner, mode, loci },
        { component: "molstar" },
      );
    harness.fabric.publish(selectionMessage("replace", [residueLocus(residue)]));
    harness.fabric.publish(selectionMessage("add", [residueLocus(sameLabelsOtherModel)]));
    expect(driver.calls.at(-1)).toMatchObject({
      action: "select",
      schemas: 2,
      targets: ["structure-a", "structure-b"],
    });
    harness.fabric.publish(selectionMessage("remove", [residueLocus(residue)]));
    expect(driver.calls.at(-1)).toMatchObject({
      action: "select",
      schemas: 1,
      targets: ["structure-b"],
    });
    harness.fabric.publish(selectionMessage("toggle", [residueLocus(sameLabelsOtherModel)]));
    expect(driver.calls.at(-1)).toMatchObject({ action: "select", schemas: 0 });

    const beforeSelection = harness.messages.filter(
      (event) => event.type === "interaction.native",
    ).length;
    driver.emit({ kind: "selection-add", residues: [residue] });
    driver.emit({ kind: "selection-add", residues: [sameLabelsOtherModel] });
    driver.emit({ kind: "selection-remove", residues: [residue] });
    expect(driver.calls.at(-1)).toMatchObject({ action: "select", schemas: 0, targets: [] });
    // Mol* follows a final remove with one or more empty clears; the paired
    // remove clear is terminal and neither trailing clear can mint a lease.
    driver.emit({ kind: "selection-clear", residues: [] });
    driver.emit({ kind: "selection-clear", residues: [] });
    const selectionEvents = harness.messages
      .filter((event) => event.type === "interaction.native")
      .slice(beforeSelection);
    expect(selectionEvents).toHaveLength(4);
    expect(selectionEvents.map((event) => event.payload.phase)).toEqual([
      "set",
      "clear",
      "set",
      "clear",
    ]);
    expect(selectionEvents.every((event) => event.payload.mode === undefined)).toBe(true);
    expect(selectionEvents[1]?.payload.interactionId).toBe(
      selectionEvents[0]?.payload.interactionId,
    );
    expect(selectionEvents[1]?.correlationId).toBe(selectionEvents[0]?.correlationId);
    expect(selectionEvents[3]?.payload.interactionId).toBe(
      selectionEvents[2]?.payload.interactionId,
    );
    expect(selectionEvents[3]?.correlationId).toBe(selectionEvents[2]?.correlationId);
    const releasedId = selectionEvents[2]?.payload.interactionId;
    driver.emit({ kind: "selection-add", residues: [residue] });
    expect(
      harness.messages.filter((event) => event.type === "interaction.native").at(-1)?.payload
        .interactionId,
    ).not.toBe(releasedId);
    const beforeRepeat = harness.messages.filter(
      (event) => event.type === "interaction.native",
    ).length;
    driver.emit({ kind: "selection-add", residues: [residue] });
    const repeated = harness.messages
      .filter((event) => event.type === "interaction.native")
      .slice(beforeRepeat);
    expect(repeated).toHaveLength(1);
    expect(repeated[0]?.payload).toMatchObject({ phase: "clear" });
    expect(repeated[0]?.payload.interactionId).toBe(
      harness.messages.filter((event) => event.type === "interaction.native")[beforeRepeat - 1]
        ?.payload.interactionId,
    );
    const unrelatedOwner = { correlationId: uuid(), sourceComponent: "unrelated-owner" };
    harness.fabric.publish(
      message(
        "interaction.selection.apply",
        {
          interactionId: "unrelated-selection",
          owner: unrelatedOwner,
          mode: "replace",
          loci: [residueLocus(sameLabelsOtherModel)],
        },
        { component: "molstar" },
      ),
    );
    driver.emit({ kind: "selection-add", residues: [residue] });
    expect(driver.calls.at(-1)).toMatchObject({
      action: "select",
      schemas: 2,
      targets: ["structure-a", "structure-b"],
    });
    const nativeSet = harness.messages
      .filter((event) => event.type === "interaction.native")
      .at(-1);
    if (nativeSet === undefined) throw new Error("Expected a native selection lease.");
    const nativeInteractionId = (nativeSet.payload as { readonly interactionId: string })
      .interactionId;
    const beforeOwnerClear = harness.messages.filter(
      (event) => event.type === "interaction.native",
    ).length;
    harness.fabric.publish(
      message(
        "interaction.selection.clear",
        {
          interactionId: nativeInteractionId,
          owner: {
            correlationId: nativeSet.correlationId,
            sourceComponent: "molstar",
          },
        },
        { component: "molstar" },
      ),
    );
    expect(driver.calls.at(-1)).toMatchObject({
      action: "select",
      schemas: 1,
      targets: ["structure-b"],
    });
    expect(harness.messages.filter((event) => event.type === "interaction.native")).toHaveLength(
      beforeOwnerClear,
    );
    await wrapper.dispose();
  });

  it("normalizes native structure loci, avoids applied echo, and disposes idempotently", async () => {
    const harness = createHarnessContext();
    const driver = new ControlledMolstarDriver();
    const wrapper = new MolstarWrapper({
      id: "molstar",
      target: {} as HTMLElement,
      driverFactory: async () => driver,
    });
    await wrapper.start(harness.context);
    harness.fabric.publish(
      message("visualization.mvs.request", request("active"), { component: "molstar" }),
    );
    driver.loads[0]?.resolve();
    await tick();
    driver.emit({ kind: "hover", residues: [residue] });
    expect(harness.messages).toContainEqual(
      expect.objectContaining({
        type: "interaction.native",
        payload: expect.objectContaining({
          semanticTarget: { structureObjectId: "structure-a" },
          loci: [
            expect.objectContaining({ space: expect.objectContaining({ authority: "molstar" }) }),
          ],
        }),
      }),
    );
    const nativeCount = harness.messages.filter(
      (item) => item.type === "interaction.native",
    ).length;
    harness.fabric.publish(
      message(
        "interaction.highlight.apply",
        apply({ correlationId: uuid(), sourceComponent: "external" }, "x", [locus]),
        { component: "molstar" },
      ),
    );
    expect(harness.messages.filter((item) => item.type === "interaction.native")).toHaveLength(
      nativeCount,
    );
    driver.emit({ kind: "hover", residues: [], unsupported: true });
    expect(harness.messages).toContainEqual(
      expect.objectContaining({
        type: "harness.diagnostic",
        payload: expect.objectContaining({
          diagnostics: expect.arrayContaining([
            expect.objectContaining({ code: "wrapper.molstar.native.unsupported" }),
          ]),
        }),
      }),
    );
    await wrapper.dispose();
    await wrapper.dispose();
    expect(driver.disposed).toBe(1);
    expect(driver.listenerCount).toBe(0);
  });
});
