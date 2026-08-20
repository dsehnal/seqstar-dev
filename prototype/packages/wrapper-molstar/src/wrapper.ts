import {
  type Capability,
  type ComponentContext,
  type ComponentFactory,
  type HarnessComponent,
  type HarnessMessage,
  type InteractionClearCommand,
  type InteractionCommand,
  type InteractionEvent,
  interactionClearApplies,
  type LifecycleResult,
  type VisualizationRequest,
} from "@seq-star/harness-core";
import {
  type CoordinateLocus,
  type CoordinateSpace,
  coordinateLocusEquals,
  coordinateSpaceEquals,
} from "@seq-star/seq-coords";
import type { JsonObject } from "@seq-star/seq-core";
import type { Viewer } from "molstar/lib/apps/viewer/app.js";
import { MVSData } from "molstar/lib/extensions/mvs/index.js";
import { OrderedSet } from "molstar/lib/mol-data/int.js";
import type { UnitIndex } from "molstar/lib/mol-model/structure/structure/element/element.js";
import { StructureElement } from "molstar/lib/mol-model/structure.js";
import { PluginStateObject } from "molstar/lib/mol-plugin-state/objects.js";
import { extractResidues, type NativeResidueEvent, type ResidueIdentity } from "./p01b/residues.js";

export const molstarWrapperType = "seqstar.molstar-mvs";

const baseCapabilities = Object.freeze([
  "seqstar:format/mvs",
  "seqstar:coordinates/structure-residue",
  "seqstar:interaction/native-hover",
  "seqstar:interaction/native-selection",
  "seqstar:interaction/external-highlight",
  "seqstar:interaction/external-selection",
  "seqstar:interaction/external-focus",
] satisfies readonly Capability[]);

export interface VisualizerWrapper extends HarnessComponent {
  readonly element: HTMLElement;
}

export interface VisualizerWrapperFactory<TConfig extends JsonObject = JsonObject> {
  readonly type: string;
  create(options: {
    readonly id: string;
    readonly target: HTMLElement;
    readonly config?: TConfig;
  }): VisualizerWrapper;
}

export type MolstarWrapperConfig = JsonObject & {
  readonly failureViewPolicy?: "retain" | "clear";
};

export interface MolstarNativeDriver {
  stage(): void;
  loadAndWaitForFirstFrame(document: unknown, signal: AbortSignal): Promise<void>;
  reveal(): void;
  subscribeNative(listener: (event: NativeResidueEvent) => void): { unsubscribe(): void };
  knownResidues(): readonly ResidueIdentity[];
  resolve(
    locus: CoordinateLocus,
    schema: StructureElement.Schema,
  ): readonly StructureElement.Loci[];
  apply(action: "highlight" | "select" | "focus", loci: readonly StructureElement.Loci[]): void;
  clearView(): Promise<void>;
  resize(): void;
  dispose(): void;
}

export interface MolstarWrapperOptions {
  readonly id: string;
  readonly target: HTMLElement;
  readonly config?: MolstarWrapperConfig;
  readonly driverFactory?: (target: HTMLElement) => Promise<MolstarNativeDriver>;
}

type AppliedFamily = "highlight" | "selection" | "focus";
type AppliedEntry = Pick<InteractionCommand, "interactionId" | "loci" | "semanticTarget">;
type Subscription = { unsubscribe(): void };
type NativeFamily = "highlight" | "selection";
type NativeInteraction = "hover" | "select";

interface PriorView {
  readonly requestId: string;
  readonly document: unknown;
  readonly nativeState: ReadonlyMap<NativeFamily, readonly CoordinateLocus[]>;
  readonly nativeLeases: ReadonlyMap<
    NativeInteraction,
    { readonly interactionId: string; readonly correlationId: string }
  >;
}

type WrapperDiagnostic = {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
};

const diagnostic = (code: string, message: string): WrapperDiagnostic => ({
  code,
  severity: "error",
  message,
});
const now = (): string => new Date().toISOString();
const uuid = (): string => globalThis.crypto.randomUUID();
const ownerKey = (owner: InteractionCommand["owner"]): string =>
  `${owner.correlationId}\u0000${owner.sourceComponent}`;
const residueKey = (residue: ResidueIdentity): string =>
  [
    residue.structureId,
    residue.modelEntryId,
    residue.modelId,
    residue.modelIndex,
    residue.modelNumber,
    residue.unitId,
    residue.operatorName,
    residue.instanceId,
    residue.entityId,
    residue.labelAsymId,
    residue.authAsymId,
    residue.labelSeqId,
    residue.authSeqId,
    residue.insertionCode,
  ].join("\u0000");

/**
 * This is deliberately an identity-rich structural coordinate space. A residue
 * number is never meaningful without its structure, model, entity, and chains.
 */
export const residueSpace = (residue: ResidueIdentity): CoordinateSpace =>
  Object.freeze({
    id: "structure-residue",
    kind: "structure-residue",
    authority: "molstar",
    context: Object.freeze({
      entry: residue.modelEntryId || "unknown-entry",
      structure: residue.structureId,
      model: residue.modelId,
      "model-index": String(residue.modelIndex),
      "model-number": String(residue.modelNumber),
      entity: residue.entityId || "unknown-entity",
      "label-asym": residue.labelAsymId || "unknown-chain",
      "auth-asym": residue.authAsymId || "unknown-chain",
      unit: String(residue.unitId),
      operator: residue.operatorName || "unknown-operator",
      instance: residue.instanceId || "unknown-instance",
      numbering: "label-and-auth",
    }),
  });

/**
 * Encode both Mol* residue number systems in the single label slot exposed by
 * CoordinatePosition. Consumers must treat this composite value together with
 * the structure/model/unit context above; schemaForLocus performs the inverse
 * conversion without dropping either number.
 */
export const residueLocus = (residue: ResidueIdentity): CoordinateLocus =>
  Object.freeze({
    kind: "point",
    space: residueSpace(residue),
    position: Object.freeze({
      kind: "label",
      value: `label:${residue.labelSeqId}|auth:${residue.authSeqId}`,
      ...(residue.insertionCode === "" ? {} : { insertionCode: residue.insertionCode }),
    }),
  });

const schemaForLocus = (locus: CoordinateLocus): StructureElement.Schema | undefined => {
  if (
    locus.kind !== "point" ||
    locus.position.kind !== "label" ||
    typeof locus.position.value !== "string" ||
    locus.space.kind !== "structure-residue" ||
    locus.space.authority !== "molstar"
  )
    return undefined;
  const position = /^label:(-?\d+)\|auth:(-?\d+)$/.exec(locus.position.value);
  if (position === null) return undefined;
  const labelSeqId = Number(position[1]);
  const authSeqId = Number(position[2]);
  if (!Number.isSafeInteger(labelSeqId) || !Number.isSafeInteger(authSeqId)) return undefined;
  const context = locus.space.context;
  const entity = context?.entity;
  const labelAsym = context?.["label-asym"];
  const authAsym = context?.["auth-asym"];
  const operator = context?.operator;
  const instance = context?.instance;
  if (
    entity === undefined ||
    labelAsym === undefined ||
    authAsym === undefined ||
    operator === undefined ||
    instance === undefined
  )
    return undefined;
  return {
    operator_name: operator,
    instance_id: instance,
    label_entity_id: entity,
    label_asym_id: labelAsym,
    auth_asym_id: authAsym,
    label_seq_id: labelSeqId,
    auth_seq_id: authSeqId,
    ...(locus.position.insertionCode === undefined
      ? {}
      : { pdbx_PDB_ins_code: locus.position.insertionCode }),
  };
};

const normalizedNative = (event: NativeResidueEvent): CoordinateLocus[] =>
  event.residues.map(residueLocus);

/** Native driver backed by the one pinned Mol* package and its MVS extension. */
export class MolstarViewerDriver implements MolstarNativeDriver {
  private readonly viewer: Viewer;
  private readonly target: HTMLElement;
  private loadTail: Promise<void> = Promise.resolve();
  private disposed = false;

  private constructor(viewer: Viewer, target: HTMLElement) {
    this.viewer = viewer;
    this.target = target;
  }

  static async create(target: HTMLElement): Promise<MolstarViewerDriver> {
    const { Viewer } = await import("molstar/lib/apps/viewer/app.js");
    return new MolstarViewerDriver(
      await Viewer.create(target, {
        extensions: ["mvs"],
        layoutIsExpanded: false,
        layoutShowControls: false,
        layoutShowSequence: false,
        layoutShowLog: false,
        layoutShowLeftPanel: false,
        layoutShowRemoteState: false,
        viewportShowControls: false,
        volumeStreamingDisabled: true,
      }),
      target,
    );
  }

  stage(): void {
    this.target.style.visibility = "hidden";
  }

  reveal(): void {
    this.target.style.visibility = "";
  }

  loadAndWaitForFirstFrame(document: unknown, signal: AbortSignal): Promise<void> {
    const queued = this.loadTail.then(() => this.performLoad(document, signal));
    this.loadTail = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }

  private async performLoad(document: unknown, signal: AbortSignal): Promise<void> {
    if (signal.aborted) throw new DOMException("Request aborted", "AbortError");
    const canvas = this.viewer.plugin.canvas3d;
    if (canvas === undefined) throw new Error("Mol* Canvas3D did not initialize.");
    let armed = false;
    let subscription: Subscription | undefined;
    let rejectFrame: (reason: unknown) => void = () => undefined;
    const frame = new Promise<void>((resolve, reject) => {
      rejectFrame = reject;
      subscription = canvas.didDraw.subscribe(() => {
        if (!armed || canvas.reprCount.value === 0) return;
        signal.removeEventListener("abort", abort);
        subscription?.unsubscribe();
        resolve();
      });
    });
    const abort = (): void => {
      subscription?.unsubscribe();
      if (armed) rejectFrame(new DOMException("Request aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      await this.viewer.loadMvsData(MVSData.toMVSJ(document as never), "mvsj", {
        sanityChecks: true,
      });
      if (signal.aborted) throw new DOMException("Request aborted", "AbortError");
      armed = true;
      canvas.requestDraw();
      await frame;
    } finally {
      signal.removeEventListener("abort", abort);
      subscription?.unsubscribe();
    }
  }

  private activeStructures() {
    return this.viewer.plugin.state.data
      .selectQ((query) => query.rootsOfType(PluginStateObject.Molecule.Structure))
      .flatMap((entry) =>
        entry.obj?.data === undefined
          ? []
          : [{ structureId: entry.transform.ref, structure: entry.obj.data }],
      );
  }

  private nativeEvent(kind: NativeResidueEvent["kind"], loci: unknown): NativeResidueEvent {
    if (!StructureElement.Loci.is(loci)) return { kind, residues: [], unsupported: true };
    const structures = this.activeStructures();
    const active =
      structures.find(({ structure }) => structure === loci.structure) ??
      structures.find(({ structure }) => structure.root === loci.structure.root);
    if (active === undefined) return { kind, residues: [], unsupported: true };
    const residues = extractResidues(loci, active.structureId);
    return {
      kind,
      residues,
      ...(!StructureElement.Loci.isEmpty(loci) && residues.length === 0
        ? { unsupported: true }
        : {}),
    };
  }

  subscribeNative(listener: (event: NativeResidueEvent) => void): Subscription {
    const subscriptions = [
      this.viewer.subscribe(this.viewer.plugin.behaviors.interaction.hover, (event) => {
        listener(this.nativeEvent("hover", event.current.loci));
      }),
      this.viewer.subscribe(
        this.viewer.plugin.managers.structure.selection.events.loci.add,
        (loci) => {
          listener(this.nativeEvent("selection-add", loci));
        },
      ),
      this.viewer.subscribe(
        this.viewer.plugin.managers.structure.selection.events.loci.remove,
        (loci) => {
          listener(this.nativeEvent("selection-remove", loci));
        },
      ),
      this.viewer.subscribe(
        this.viewer.plugin.managers.structure.selection.events.loci.clear,
        () => {
          listener({ kind: "selection-clear", residues: [] });
        },
      ),
    ];
    return {
      unsubscribe: () => {
        subscriptions.forEach((subscription) => {
          subscription.unsubscribe();
        });
      },
    };
  }

  knownResidues(): readonly ResidueIdentity[] {
    const residues = new Map<string, ResidueIdentity>();
    for (const { structureId, structure } of this.activeStructures()) {
      for (const residue of extractResidues(StructureElement.Loci.all(structure), structureId))
        residues.set(residueKey(residue), residue);
    }
    return [...residues.values()];
  }

  resolve(
    locus: CoordinateLocus,
    schema: StructureElement.Schema,
  ): readonly StructureElement.Loci[] {
    const result: StructureElement.Loci[] = [];
    for (const { structureId, structure } of this.activeStructures()) {
      const candidate = StructureElement.Loci.fromSchema(structure, schema);
      const exactElements: Array<StructureElement.Loci["elements"][number]> = [];
      for (const element of candidate.elements) {
        const exactIndices: UnitIndex[] = [];
        OrderedSet.forEach(element.indices, (index) => {
          const single = StructureElement.Loci(structure, [
            { unit: element.unit, indices: OrderedSet.ofSingleton(index) },
          ]);
          if (
            extractResidues(single, structureId).some((residue) =>
              coordinateLocusEquals(residueLocus(residue), locus),
            )
          )
            exactIndices.push(index);
        });
        if (exactIndices.length > 0)
          exactElements.push({
            unit: element.unit,
            indices: OrderedSet.ofSortedArray(exactIndices),
          });
      }
      if (exactElements.length > 0) result.push(StructureElement.Loci(structure, exactElements));
    }
    return result;
  }

  apply(action: "highlight" | "select" | "focus", loci: readonly StructureElement.Loci[]): void {
    const { interactivity, camera } = this.viewer.plugin.managers;
    if (action === "highlight") {
      const [first, ...rest] = loci;
      if (first === undefined) interactivity.lociHighlights.clearHighlights();
      else {
        interactivity.lociHighlights.clearHighlights();
        interactivity.lociHighlights.highlightOnly({ loci: first }, false);
        for (const next of rest) interactivity.lociHighlights.highlight({ loci: next }, false);
      }
      return;
    }
    if (action === "select") {
      const [first, ...rest] = loci;
      if (first === undefined) interactivity.lociSelects.deselectAll();
      else {
        interactivity.lociSelects.selectOnly({ loci: first }, false);
        for (const next of rest) interactivity.lociSelects.select({ loci: next }, false);
      }
      return;
    }
    if (loci.length > 0) camera.focusLoci([...loci]);
    else this.viewer.plugin.canvas3d?.requestCameraReset();
  }

  clearView(): Promise<void> {
    return this.viewer.plugin.clear();
  }

  resize(): void {
    this.viewer.handleResize();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.viewer.dispose();
  }
}

/**
 * The production MVS boundary. It owns Mol* lifecycle and native state, but
 * intentionally contains no domain-specific MVS generation or translation.
 */
export class MolstarWrapper implements VisualizerWrapper {
  readonly id: string;
  readonly element: HTMLElement;
  private readonly driverFactory: (target: HTMLElement) => Promise<MolstarNativeDriver>;
  private readonly failureViewPolicy: "retain" | "clear";
  private context: ComponentContext | undefined;
  private driver: MolstarNativeDriver | undefined;
  private mount: HTMLElement | undefined;
  private fabricSubscription: Subscription | undefined;
  private nativeSubscription: Subscription | undefined;
  private resizeObserver: ResizeObserver | undefined;
  private requestAbort: AbortController | undefined;
  private nextGeneration = 0;
  private acceptedGeneration = 0;
  private visibleRequestId: string | undefined;
  private visibleDocument: unknown;
  private activeSpaces: readonly CoordinateSpace[] = [];
  private disposed = false;
  private applying = false;
  private readonly applied = new Map<AppliedFamily, Map<string, Map<string, AppliedEntry>>>();
  private readonly nativeState = new Map<NativeFamily, CoordinateLocus[]>();
  private readonly nativeLeases = new Map<
    NativeInteraction,
    { readonly interactionId: string; readonly correlationId: string }
  >();

  constructor(options: MolstarWrapperOptions) {
    this.id = options.id;
    this.element = options.target;
    this.driverFactory = options.driverFactory ?? MolstarViewerDriver.create;
    this.failureViewPolicy = options.config?.failureViewPolicy ?? "retain";
    for (const family of ["highlight", "selection", "focus"] as const)
      this.applied.set(family, new Map());
    this.nativeState.set("highlight", []);
    this.nativeState.set("selection", []);
  }

  get capabilities(): readonly Capability[] {
    return baseCapabilities;
  }

  async start(context: ComponentContext): Promise<void> {
    if (this.disposed) throw new Error(`Wrapper '${this.id}' has been disposed.`);
    if (this.context !== undefined) return;
    this.context = context;
    this.mount = this.createMount();
    this.driver = await this.driverFactory(this.mount);
    if (this.disposed) {
      this.driver.dispose();
      this.mount?.remove?.();
      this.mount = undefined;
      return;
    }
    context.reportCapabilities(this.capabilities);
    // The shared wrapper boundary expects one start-scoped native listener.
    // It is deliberately inert until a rendered generation installs the real,
    // generation-bound listener below.
    this.nativeSubscription = this.driver.subscribeNative(() => undefined);
    this.fabricSubscription = context.fabric
      .observe({ targetComponent: this.id })
      .subscribe((message) => {
        this.receive(message);
      });
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver((entries) => {
        if (entries.some((entry) => entry.contentRect.width > 0 && entry.contentRect.height > 0))
          this.driver?.resize();
      });
      this.resizeObserver.observe(this.element);
    }
  }

  private receive(message: HarnessMessage): void {
    if (this.disposed || message.target === undefined || !("component" in message.target)) return;
    if (message.target.component !== this.id) return;
    if (message.type === "visualization.mvs.request") {
      this.acceptRequest(message);
      return;
    }
    const family: AppliedFamily | undefined = message.type.startsWith("interaction.highlight")
      ? "highlight"
      : message.type.startsWith("interaction.selection")
        ? "selection"
        : message.type.startsWith("interaction.focus")
          ? "focus"
          : undefined;
    if (family === undefined) return;
    if (message.type.endsWith(".apply"))
      this.apply(family, message.payload as unknown as InteractionCommand, message);
    else if (message.type.endsWith(".clear"))
      this.clear(family, message.payload as unknown as InteractionClearCommand);
  }

  private createMount(): HTMLElement {
    if (typeof HTMLElement === "undefined" || !(this.element instanceof HTMLElement))
      return this.element;
    const mount = document.createElement("div");
    mount.style.width = "100%";
    mount.style.height = "100%";
    mount.style.position = "relative";
    this.element.append(mount);
    return mount;
  }

  private acceptRequest(message: HarnessMessage): void {
    const request = message.payload as unknown as VisualizationRequest<"mvs", JsonObject>;
    const generation = ++this.nextGeneration;
    if (request.format !== "mvs") {
      this.lifecycle(
        request.requestId,
        generation,
        "failed",
        [diagnostic("wrapper.molstar.request.format", "Mol* wrapper accepts only MVS requests.")],
        message,
        this.visibleRequestId === undefined ? undefined : "retained",
      );
      return;
    }
    let issues: readonly string[];
    try {
      issues = (MVSData.validationIssues(request.document as never, { noExtra: true }) ?? []).map(
        String,
      );
    } catch (error) {
      issues = [error instanceof Error ? error.message : "MVS validation failed."];
    }
    if (issues.length > 0) {
      this.lifecycle(
        request.requestId,
        generation,
        "failed",
        issues.map((issue) => diagnostic("wrapper.molstar.mvs.invalid", issue)),
        message,
        this.visibleRequestId === undefined ? undefined : "retained",
      );
      return;
    }
    const priorView: PriorView | undefined =
      this.visibleRequestId === undefined || this.visibleDocument === undefined
        ? undefined
        : {
            requestId: this.visibleRequestId,
            document: this.visibleDocument,
            nativeState: new Map(
              [...this.nativeState].map(([family, loci]) => [family, [...loci]] as const),
            ),
            nativeLeases: new Map(this.nativeLeases),
          };
    this.nativeSubscription?.unsubscribe();
    this.nativeSubscription = undefined;
    this.nativeState.set("highlight", []);
    this.nativeState.set("selection", []);
    this.nativeLeases.clear();
    this.activeSpaces = [];
    this.context?.reportCoordinateSpaces([]);
    this.requestAbort?.abort();
    this.acceptedGeneration = generation;
    const controller = new AbortController();
    this.requestAbort = controller;
    this.driver?.stage();
    this.lifecycle(request.requestId, generation, "accepted", [], message);
    const driver = this.driver;
    if (driver === undefined) return;
    void (async () => {
      try {
        await driver.loadAndWaitForFirstFrame(request.document, controller.signal);
        if (this.disposed || controller.signal.aborted || generation !== this.acceptedGeneration) {
          this.lifecycle(request.requestId, generation, "superseded", [], message);
          return;
        }
        driver.reveal();
        this.visibleRequestId = request.requestId;
        this.visibleDocument = request.document;
        this.activeSpaces = uniqueSpaces(driver.knownResidues().map(residueSpace));
        this.context?.reportCoordinateSpaces(this.activeSpaces);
        this.installNativeSubscription(generation, request.requestId);
        for (const family of ["highlight", "selection", "focus"] as const) {
          const hasExternal = (this.applied.get(family)?.size ?? 0) > 0;
          const hasNative =
            (family === "highlight" || family === "selection") &&
            (this.nativeState.get(family)?.length ?? 0) > 0;
          if (hasExternal || hasNative) this.renderApplied(family);
        }
        this.lifecycle(request.requestId, generation, "rendered", [], message);
      } catch (error) {
        if (this.disposed || controller.signal.aborted || generation !== this.acceptedGeneration) {
          this.lifecycle(request.requestId, generation, "superseded", [], message);
          return;
        }
        let previousView: "retained" | "cleared" | undefined;
        let rollbackError: unknown;
        let clearError: unknown;
        if (this.failureViewPolicy === "retain" && priorView !== undefined) {
          try {
            await this.restorePriorView(priorView, generation, controller.signal);
            previousView = "retained";
          } catch (rollbackFailure) {
            rollbackError = rollbackFailure;
            if (controller.signal.aborted || generation !== this.acceptedGeneration) {
              this.lifecycle(request.requestId, generation, "superseded", [], message);
              return;
            }
            try {
              previousView = await this.clearFailedView();
            } catch (clearFailure) {
              clearError = clearFailure;
              this.forgetVisibleView();
            }
          }
        } else {
          try {
            await this.clearFailedView();
            previousView = priorView === undefined ? undefined : "cleared";
          } catch (clearFailure) {
            clearError = clearFailure;
            this.forgetVisibleView();
          }
        }
        this.lifecycle(
          request.requestId,
          generation,
          "failed",
          [
            diagnostic(
              "wrapper.molstar.load.failed",
              error instanceof Error ? error.message : "Mol* failed to load the MVS request.",
            ),
            ...(rollbackError === undefined
              ? []
              : [
                  diagnostic(
                    "wrapper.molstar.rollback.failed",
                    rollbackError instanceof Error
                      ? rollbackError.message
                      : "Mol* failed to restore the previous MVS view.",
                  ),
                ]),
            ...(clearError === undefined
              ? []
              : [
                  diagnostic(
                    "wrapper.molstar.clear.failed",
                    clearError instanceof Error
                      ? clearError.message
                      : "Mol* failed to clear the failed view.",
                  ),
                ]),
          ],
          message,
          previousView,
        );
      }
    })();
  }

  private async clearFailedView(): Promise<"cleared"> {
    await this.driver?.clearView();
    this.driver?.reveal();
    this.forgetVisibleView();
    return "cleared";
  }

  private forgetVisibleView(): void {
    this.visibleRequestId = undefined;
    this.visibleDocument = undefined;
    this.activeSpaces = [];
    this.context?.reportCoordinateSpaces([]);
  }

  private installNativeSubscription(generation: number, visibleRequestId: string): void {
    this.nativeSubscription?.unsubscribe();
    this.nativeSubscription = this.driver?.subscribeNative((event) => {
      if (
        this.disposed ||
        generation !== this.acceptedGeneration ||
        this.visibleRequestId !== visibleRequestId
      )
        return;
      this.publishNative(event, generation);
    });
  }

  private async restorePriorView(
    priorView: PriorView,
    generation: number,
    signal: AbortSignal,
  ): Promise<void> {
    const driver = this.driver;
    if (driver === undefined) throw new Error("Mol* driver is unavailable for rollback.");
    await driver.loadAndWaitForFirstFrame(priorView.document, signal);
    if (this.disposed || signal.aborted || generation !== this.acceptedGeneration)
      throw new DOMException("Rollback superseded", "AbortError");
    driver.reveal();
    this.visibleRequestId = priorView.requestId;
    this.visibleDocument = priorView.document;
    for (const family of ["highlight", "selection"] as const)
      this.nativeState.set(family, [...(priorView.nativeState.get(family) ?? [])]);
    this.nativeLeases.clear();
    for (const [interaction, lease] of priorView.nativeLeases)
      this.nativeLeases.set(interaction, lease);
    this.activeSpaces = uniqueSpaces(driver.knownResidues().map(residueSpace));
    this.context?.reportCoordinateSpaces(this.activeSpaces);
    this.installNativeSubscription(generation, priorView.requestId);
    for (const family of ["highlight", "selection", "focus"] as const) this.renderApplied(family);
  }

  private lifecycle(
    requestId: string,
    generation: number,
    status: LifecycleResult["status"],
    diagnostics: readonly WrapperDiagnostic[],
    request?: HarnessMessage,
    previousView?: "retained" | "cleared",
  ): void {
    if (this.context === undefined || this.disposed) return;
    this.context.fabric.publish({
      id: uuid(),
      type: "lifecycle.visualization",
      version: "0.1.0",
      source: { component: this.id },
      correlationId: request?.correlationId ?? uuid(),
      ...(request === undefined ? {} : { causationId: request.id }),
      timestamp: now(),
      payload: {
        requestId,
        generation,
        componentId: this.id,
        status,
        ...(this.visibleRequestId === undefined ? {} : { visibleRequestId: this.visibleRequestId }),
        ...(previousView === undefined ? {} : { previousView }),
        capabilities: this.capabilities,
        diagnostics,
      } as unknown as JsonObject,
    });
  }

  private publishNative(event: NativeResidueEvent, generation: number): void {
    if (this.context === undefined || this.disposed || this.applying) return;
    if (generation !== this.acceptedGeneration) return;
    if (this.visibleRequestId === undefined) return;
    if (event.unsupported === true) {
      this.publishDiagnostic(
        "wrapper.molstar.native.unsupported",
        "Ignored a non-atomic, coarse, or unrelated Mol* native locus.",
      );
      return;
    }
    const interaction = event.kind === "hover" ? "hover" : "select";
    const phase = event.kind === "selection-clear" || event.residues.length === 0 ? "clear" : "set";
    const loci = normalizedNative(event);
    this.updateNativeState(event, loci);
    this.renderApplied(interaction === "hover" ? "highlight" : "selection");
    const lease = this.nativeLeases.get(interaction) ?? {
      interactionId: uuid(),
      correlationId: uuid(),
    };
    this.nativeLeases.set(interaction, lease);
    const structureObjectId = loci[0]?.space.context?.structure;
    const payload: InteractionEvent = {
      interactionId: lease.interactionId,
      interaction,
      phase,
      ...(event.kind === "selection-add"
        ? { mode: "add" as const }
        : event.kind === "selection-remove"
          ? { mode: "remove" as const }
          : {}),
      origin: {
        componentId: this.id,
        ...(this.visibleRequestId === undefined ? {} : { documentId: this.visibleRequestId }),
      },
      ...(structureObjectId === undefined ? {} : { semanticTarget: { structureObjectId } }),
      loci,
    };
    this.context.fabric.publish({
      id: uuid(),
      type: "interaction.native",
      version: "0.1.0",
      source: { component: this.id },
      correlationId: lease.correlationId,
      timestamp: now(),
      payload: payload as unknown as JsonObject,
    });
    const nativeSelectionEmpty = (this.nativeState.get("selection")?.length ?? 0) === 0;
    if (phase === "clear" || (event.kind === "selection-remove" && nativeSelectionEmpty))
      this.nativeLeases.delete(interaction);
  }

  private updateNativeState(event: NativeResidueEvent, loci: readonly CoordinateLocus[]): void {
    if (event.kind === "hover") {
      this.nativeState.set("highlight", [...loci]);
      return;
    }
    const current = this.nativeState.get("selection") ?? [];
    if (event.kind === "selection-clear") {
      this.nativeState.set("selection", []);
      return;
    }
    if (event.kind === "selection-remove") {
      this.nativeState.set(
        "selection",
        current.filter(
          (candidate) => !loci.some((removed) => coordinateLocusEquals(candidate, removed)),
        ),
      );
      return;
    }
    const next = [...current];
    for (const locus of loci)
      if (!next.some((candidate) => coordinateLocusEquals(candidate, locus))) next.push(locus);
    this.nativeState.set("selection", next);
  }

  private apply(family: AppliedFamily, command: InteractionCommand, message: HarnessMessage): void {
    const byOwner = this.applied.get(family);
    const driver = this.driver;
    if (byOwner === undefined || driver === undefined) return;
    const mapped = command.loci.flatMap((locus) => {
      const schema = schemaForLocus(locus);
      if (
        schema === undefined ||
        !this.activeSpaces.some((space) => coordinateSpaceEquals(space, locus.space))
      )
        return [];
      const nativeLoci = driver.resolve(locus, schema);
      return nativeLoci.length > 0 ? [{ locus, nativeLoci }] : [];
    });
    if (mapped.length !== command.loci.length) {
      this.publishDiagnostic(
        mapped.length === 0
          ? "wrapper.molstar.command.unmapped"
          : "wrapper.molstar.command.partial",
        mapped.length === 0
          ? "Rejected a structure command outside the active structure/model/entity/chain space."
          : "Ignored loci outside the active structure/model/entity/chain space.",
        message,
      );
    }
    if (mapped.length === 0) return;
    const loci = mapped.map(({ locus }) => locus);
    const key = ownerKey(command.owner);
    const entries = byOwner.get(key) ?? new Map<string, AppliedEntry>();
    const existing = entries.get(command.interactionId);
    const previousLoci = existing?.loci ?? [];
    const uniqueUnion = (left: readonly CoordinateLocus[], right: readonly CoordinateLocus[]) => {
      const result = [...left];
      for (const locus of right)
        if (!result.some((candidate) => coordinateLocusEquals(candidate, locus)))
          result.push(locus);
      return result;
    };
    if (command.mode === "replace") entries.set(command.interactionId, { ...command, loci });
    else if (command.mode === "add")
      entries.set(command.interactionId, {
        ...command,
        loci: uniqueUnion(previousLoci, loci),
      });
    if (command.mode === "remove") {
      const remaining = previousLoci.filter(
        (candidate) => !loci.some((incoming) => coordinateLocusEquals(candidate, incoming)),
      );
      if (remaining.length === 0) entries.delete(command.interactionId);
      else entries.set(command.interactionId, { ...(existing ?? command), loci: remaining });
    } else if (command.mode === "toggle") {
      const toggled = [...previousLoci];
      for (const locus of loci) {
        const present = toggled.findIndex((candidate) => coordinateLocusEquals(candidate, locus));
        if (present >= 0) toggled.splice(present, 1);
        else toggled.push(locus);
      }
      if (toggled.length === 0) entries.delete(command.interactionId);
      else entries.set(command.interactionId, { ...command, loci: toggled });
    }
    if (entries.size === 0) byOwner.delete(key);
    else byOwner.set(key, entries);
    this.renderApplied(family);
  }

  private clear(family: AppliedFamily, command: InteractionClearCommand): void {
    const byOwner = this.applied.get(family);
    if (byOwner === undefined) return;
    const key = ownerKey(command.owner);
    const entries = byOwner.get(key);
    if (entries === undefined) return;
    for (const [interactionId] of entries)
      if (interactionClearApplies({ interactionId, owner: command.owner }, command))
        entries.delete(interactionId);
    if (entries.size === 0) byOwner.delete(key);
    this.renderApplied(family);
  }

  private renderApplied(family: AppliedFamily): void {
    const driver = this.driver;
    if (driver === undefined) return;
    const externalLoci = [...(this.applied.get(family)?.values() ?? [])]
      .flatMap((entries) => [...entries.values()])
      .flatMap((entry) => entry.loci);
    const nativeLoci =
      family === "highlight" || family === "selection" ? (this.nativeState.get(family) ?? []) : [];
    const exactLoci = [...nativeLoci, ...externalLoci].flatMap((locus) => {
      const schema = schemaForLocus(locus);
      return schema === undefined ? [] : driver.resolve(locus, schema);
    });
    this.applying = true;
    try {
      driver.apply(family === "selection" ? "select" : family, exactLoci);
    } finally {
      this.applying = false;
    }
  }

  private publishDiagnostic(code: string, message: string, request?: HarnessMessage): void {
    this.context?.fabric.publish({
      id: uuid(),
      type: "harness.diagnostic",
      version: "0.1.0",
      source: { component: this.id },
      correlationId: request?.correlationId ?? uuid(),
      ...(request === undefined ? {} : { causationId: request.id }),
      timestamp: now(),
      payload: { diagnostics: [diagnostic(code, message)] } as unknown as JsonObject,
    });
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.requestAbort?.abort();
    this.requestAbort = undefined;
    this.fabricSubscription?.unsubscribe();
    this.fabricSubscription = undefined;
    this.nativeSubscription?.unsubscribe();
    this.nativeSubscription = undefined;
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.applied.clear();
    this.nativeState.clear();
    this.nativeLeases.clear();
    this.activeSpaces = [];
    this.context?.reportCoordinateSpaces([]);
    this.context = undefined;
    this.driver?.dispose();
    this.driver = undefined;
    this.mount?.remove?.();
    this.mount = undefined;
  }
}

const uniqueSpaces = (spaces: readonly CoordinateSpace[]): readonly CoordinateSpace[] => {
  const result: CoordinateSpace[] = [];
  for (const space of spaces)
    if (!result.some((candidate) => coordinateSpaceEquals(candidate, space))) result.push(space);
  return Object.freeze(result);
};

export const createMolstarWrapperFactory = (options: {
  readonly getHost: (id: string) => HTMLElement;
  readonly driverFactory?: (target: HTMLElement) => Promise<MolstarNativeDriver>;
}): ComponentFactory<MolstarWrapperConfig> => ({
  type: molstarWrapperType,
  create({ id, config }) {
    return new MolstarWrapper({
      id,
      target: options.getHost(id),
      ...(config === undefined ? {} : { config }),
      ...(options.driverFactory === undefined ? {} : { driverFactory: options.driverFactory }),
    });
  },
});

export const molstarWrapperFactory: VisualizerWrapperFactory<MolstarWrapperConfig> = {
  type: molstarWrapperType,
  create(options) {
    return new MolstarWrapper(options);
  },
};
