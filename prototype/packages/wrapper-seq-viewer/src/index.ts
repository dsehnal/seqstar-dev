import {
  type Capability,
  type ComponentContext,
  type ComponentFactory,
  type HarnessComponent,
  type HarnessMessage,
  type InteractionClearCommand,
  type InteractionCommand,
  type InteractionEvent,
  type InteractionKind,
  interactionClearApplies,
  type LifecycleResult,
  type ViewportDescriptor,
  type VisualizationRequest,
} from "@seq-star/harness-core";
import {
  type CoordinateLocus,
  type CoordinateSpace,
  coordinateSpaceEquals,
} from "@seq-star/seq-coords";
import type { Diagnostic, JsonObject } from "@seq-star/seq-core";
import { type SeqViewSpec, validateSeqViewSpec } from "@seq-star/seq-view-spec";
import {
  type CreateSeqViewerOptions,
  createSeqViewer,
  type SequenceWrapperPresentationConfig,
  type SeqViewer,
  type SeqViewerInteraction,
} from "@seq-star/seq-viewer";
import { snapshotReferenceViewerPresentation } from "./presentation.js";

export {
  ReferencePresentationError,
  snapshotReferenceViewerPresentation,
} from "./presentation.js";

export const referenceViewerWrapperType = "seqstar.reference-viewer";

const baseCapabilities = Object.freeze([
  "seqstar:format/seqviewspec",
  "seqstar:coordinates/sequence",
  "seqstar:coordinates/alignment",
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

export type ReferenceViewerWrapperConfig = JsonObject & {
  /** Keep the last successful canvas when a replacement request fails. */
  readonly failureViewPolicy?: "retain" | "clear";
  /** JSON-safe presentation-only header/action configuration. */
  readonly presentation?: SequenceWrapperPresentationConfig;
};

export interface ReferenceViewerWrapperOptions {
  readonly id: string;
  readonly target: HTMLElement;
  readonly config?: ReferenceViewerWrapperConfig;
  readonly viewerFactory?: (options: CreateSeqViewerOptions) => SeqViewer;
}

type AppliedFamily = "highlight" | "selection";
type AppliedEntry = Pick<InteractionCommand, "interactionId" | "loci" | "semanticTarget">;
type Subscription = { unsubscribe(): void };

const diagnostic = (code: string, message: string): Diagnostic => ({
  code,
  severity: "error",
  message,
});

const ownerKey = (owner: InteractionCommand["owner"]): string =>
  `${owner.correlationId}\u0000${owner.sourceComponent}`;
const stableLocus = (locus: CoordinateLocus): string => JSON.stringify(locus);
const equalLocus = (left: CoordinateLocus, right: CoordinateLocus): boolean =>
  stableLocus(left) === stableLocus(right);
const id = (): string => globalThis.crypto.randomUUID();
const timestamp = (): string => new Date().toISOString();
const normalizeViewport = (
  viewport: NonNullable<SeqViewerInteraction["viewport"]>,
): ViewportDescriptor => ({
  offsetStart: viewport.offsetStart,
  offsetEnd: viewport.offsetEnd,
  totalColumns: viewport.totalColumns,
  segments: viewport.segments.map((segment) => ({
    segmentId: segment.segmentId,
    spaceId: segment.spaceId,
    start: segment.start,
    end: segment.end,
  })),
});
const documentSpaces = (document: SeqViewSpec): readonly CoordinateSpace[] =>
  Object.freeze([
    ...document.sequences.map((sequence) =>
      Object.freeze({
        id: sequence.coordinateSpace,
        kind: "sequence",
        length: [...sequence.residues].length,
      } satisfies CoordinateSpace),
    ),
    ...(document.alignments ?? []).map((alignment) =>
      Object.freeze({
        id: alignment.coordinateSpace,
        kind: "alignment",
        length: alignment.length,
      } satisfies CoordinateSpace),
    ),
  ]);
const viewerCapabilities = (viewer: SeqViewer): readonly Capability[] =>
  Object.freeze([
    ...baseCapabilities,
    ...viewer.capabilities.representations.map(
      (representation) => `seqviewspec:representation/${representation}`,
    ),
    ...(viewer.capabilities.supportsNativeInteractions
      ? [
          "seqstar:interaction/native-hover",
          "seqstar:interaction/native-selection",
          "seqstar:interaction/native-track-activate",
          "seqstar:interaction/native-viewport",
        ]
      : []),
    ...(viewer.capabilities.supportsExternalHighlight
      ? ["seqstar:interaction/external-highlight"]
      : []),
    ...(viewer.capabilities.supportsExternalSelection
      ? ["seqstar:interaction/external-selection"]
      : []),
  ] satisfies readonly Capability[]);

/**
 * A lifecycle-owning boundary around the public SeqViewer API. It deliberately
 * does not translate loci: native coordinate spaces already match SeqViewSpec.
 */
export class ReferenceViewerWrapper implements VisualizerWrapper {
  readonly element: HTMLElement;
  private readonly viewerFactory: (options: CreateSeqViewerOptions) => SeqViewer;
  private readonly failureViewPolicy: "retain" | "clear";
  private readonly presentation: SequenceWrapperPresentationConfig;
  private viewer: SeqViewer | undefined;
  private context: ComponentContext | undefined;
  private subscription: Subscription | undefined;
  private nativeSubscription: Subscription | undefined;
  private requestAbort: AbortController | undefined;
  private nextGeneration = 0;
  private activeAcceptedGeneration = 0;
  private visibleRequestId: string | undefined;
  private visibleDocument: SeqViewSpec | undefined;
  private activeSpaces: readonly CoordinateSpace[] = [];
  private currentCapabilities: readonly Capability[] = baseCapabilities;
  private disposed = false;
  private readonly applied = new Map<AppliedFamily, Map<string, Map<string, AppliedEntry>>>();
  private readonly nativeLeases = new Map<
    string,
    { readonly correlationId: string; readonly interactionId: string }
  >();
  /** Last native semantic fingerprint per interaction, used by clear-only drivers. */
  private readonly activeNativeLeaseKeys = new Map<InteractionKind, string>();

  constructor(options: ReferenceViewerWrapperOptions) {
    this.id = options.id;
    this.element = options.target;
    this.viewerFactory = options.viewerFactory ?? createSeqViewer;
    this.failureViewPolicy = options.config?.failureViewPolicy ?? "retain";
    this.presentation = snapshotReferenceViewerPresentation(options.config?.presentation);
    this.applied.set("highlight", new Map());
    this.applied.set("selection", new Map());
  }

  readonly id: string;

  get capabilities(): readonly Capability[] {
    return this.currentCapabilities;
  }

  async start(context: ComponentContext): Promise<void> {
    if (this.disposed) throw new Error(`Wrapper '${this.id}' has been disposed.`);
    if (this.context !== undefined) return;
    this.context = context;
    this.viewer = this.viewerFactory({
      target: this.element,
      ...(this.presentation === undefined ? {} : { presentation: this.presentation }),
    });
    this.reportViewerCapabilities();
    this.nativeSubscription = this.viewer.interactions.subscribe((event) =>
      this.publishNative(event),
    );
    this.subscription = context.fabric
      .observe({ targetComponent: this.id })
      .subscribe((message) => {
        this.receive(message);
      });
  }

  private receive(message: HarnessMessage): void {
    if (this.disposed || message.target === undefined || !("component" in message.target)) return;
    if (message.target.component !== this.id) return;
    if (message.type === "visualization.seqviewspec.request") {
      this.acceptRequest(message);
      return;
    }
    const family = message.type.startsWith("interaction.highlight")
      ? "highlight"
      : message.type.startsWith("interaction.selection")
        ? "selection"
        : undefined;
    if (family === undefined) return;
    if (message.type.endsWith(".apply"))
      this.apply(family, message.payload as unknown as InteractionCommand, message);
    else if (message.type.endsWith(".clear"))
      this.clear(family, message.payload as unknown as InteractionClearCommand);
  }

  private acceptRequest(message: HarnessMessage): void {
    const request = message.payload as unknown as VisualizationRequest<"seqviewspec", SeqViewSpec>;
    if (request.format !== "seqviewspec") {
      this.lifecycle(
        request.requestId,
        ++this.nextGeneration,
        "failed",
        [
          diagnostic(
            "wrapper.seq-viewer.request.format",
            `Reference viewer cannot render '${request.format}' as SeqViewSpec.`,
          ),
        ],
        message,
        this.visibleRequestId === undefined ? undefined : "retained",
      );
      return;
    }
    const checked = validateSeqViewSpec(request.document);
    if (!checked.ok) {
      this.lifecycle(
        request.requestId,
        ++this.nextGeneration,
        "failed",
        checked.diagnostics,
        message,
        this.visibleRequestId === undefined ? undefined : "retained",
      );
      return;
    }
    const viewId = request.viewId ?? checked.value.views[0]?.id;
    if (viewId === undefined || !checked.value.views.some((view) => view.id === viewId)) {
      this.lifecycle(
        request.requestId,
        ++this.nextGeneration,
        "failed",
        [
          diagnostic(
            "wrapper.seq-viewer.view.missing",
            "A SeqViewSpec request must contain a view.",
          ),
        ],
        message,
        this.visibleRequestId === undefined ? undefined : "retained",
      );
      return;
    }
    this.requestAbort?.abort();
    this.nativeLeases.clear();
    this.activeNativeLeaseKeys.clear();
    const generation = ++this.nextGeneration;
    this.activeAcceptedGeneration = generation;
    const controller = new AbortController();
    this.requestAbort = controller;
    this.lifecycle(request.requestId, generation, "accepted", [], message);
    const viewer = this.viewer;
    if (viewer === undefined) return;
    void viewer.load(checked.value, viewId, controller.signal).then(
      (result) => {
        if (
          this.disposed ||
          generation !== this.activeAcceptedGeneration ||
          controller.signal.aborted
        ) {
          this.lifecycle(request.requestId, generation, "superseded", result.diagnostics, message);
          return;
        }
        if (result.status === "superseded") {
          this.lifecycle(request.requestId, generation, "superseded", result.diagnostics, message);
          return;
        }
        if (result.status === "failed") {
          const previousView = this.applyFailureViewPolicy();
          this.lifecycle(
            request.requestId,
            generation,
            "failed",
            result.diagnostics,
            message,
            previousView,
          );
          return;
        }
        this.visibleDocument = checked.value;
        this.visibleRequestId = request.requestId;
        this.activeSpaces = documentSpaces(checked.value);
        this.context?.reportCoordinateSpaces(this.activeSpaces);
        const degraded = result.layers.some((layer) => layer.status === "degraded");
        const presentationDiagnostics = this.presentationDiagnostics(checked.value);
        this.lifecycle(
          request.requestId,
          generation,
          degraded ? "degraded" : "rendered",
          [...result.diagnostics, ...presentationDiagnostics],
          message,
        );
      },
      (reason: unknown) => {
        if (
          this.disposed ||
          generation !== this.activeAcceptedGeneration ||
          controller.signal.aborted
        ) {
          this.lifecycle(request.requestId, generation, "superseded", [], message);
          return;
        }
        const previousView = this.applyFailureViewPolicy();
        this.lifecycle(
          request.requestId,
          generation,
          "failed",
          [
            diagnostic(
              "wrapper.seq-viewer.load.failed",
              reason instanceof Error
                ? reason.message
                : "The reference viewer failed to load the request.",
            ),
          ],
          message,
          previousView,
        );
      },
    );
  }

  private applyFailureViewPolicy(): "retained" | "cleared" | undefined {
    const hadVisibleRequest = this.visibleRequestId !== undefined;
    if (this.failureViewPolicy === "retain") {
      this.context?.reportCoordinateSpaces(
        this.visibleDocument === undefined ? [] : documentSpaces(this.visibleDocument),
      );
      this.activeSpaces =
        this.visibleDocument === undefined ? [] : documentSpaces(this.visibleDocument);
      return hadVisibleRequest ? "retained" : undefined;
    }
    this.nativeSubscription?.unsubscribe();
    this.nativeSubscription = undefined;
    this.viewer?.dispose();
    this.viewer = this.viewerFactory({
      target: this.element,
      ...(this.presentation === undefined ? {} : { presentation: this.presentation }),
    });
    this.nativeSubscription = this.viewer.interactions.subscribe((event) =>
      this.publishNative(event),
    );
    this.visibleDocument = undefined;
    this.visibleRequestId = undefined;
    this.activeSpaces = [];
    this.context?.reportCoordinateSpaces([]);
    this.reportViewerCapabilities();
    return hadVisibleRequest ? "cleared" : undefined;
  }

  private presentationDiagnostics(document: SeqViewSpec): readonly Diagnostic[] {
    const tracks = new Set(
      document.views.flatMap((view) =>
        view.sections.flatMap((section) => section.tracks.map((track) => track.id)),
      ),
    );
    return Object.freeze(
      (this.presentation.tracks ?? [])
        .filter((item) => !tracks.has(item.trackId))
        .map((item) => ({
          code: "wrapper.seq-viewer.presentation.track-action.absent",
          severity: "warning" as const,
          message: `Configured reference track action '${item.trackId}' is absent from the loaded document.`,
          path: "/views",
        })),
    );
  }

  private lifecycle(
    requestId: string,
    generation: number,
    status: LifecycleResult["status"],
    diagnostics: readonly Diagnostic[],
    request?: HarnessMessage,
    previousView?: "retained" | "cleared",
  ): void {
    const context = this.context;
    if (context === undefined || this.disposed) return;
    context.fabric.publish({
      id: id(),
      type: "lifecycle.visualization",
      version: "0.1.0",
      source: { component: this.id },
      correlationId: request?.correlationId ?? id(),
      ...(request === undefined ? {} : { causationId: request.id }),
      timestamp: timestamp(),
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

  private publishNative(event: SeqViewerInteraction): void {
    const context = this.context;
    if (context === undefined || this.disposed) return;
    const interaction: InteractionKind = event.kind === "viewport-change" ? "viewport" : event.kind;
    const nativeLeaseKey = [
      interaction,
      event.documentId,
      event.viewId,
      event.sectionId ?? "",
      event.trackId ?? "",
      event.layerId ?? "",
      event.sequenceId ?? "",
      event.alignmentId ?? "",
      event.alignmentMemberId ?? "",
      event.annotationId ?? "",
      event.itemId ?? "",
      event.endpointRole ?? "",
      event.locusIndex ?? -1,
      // Native selection identity is semantic, not just annotation identity.
      // This keeps click A -> click B as clear(A)/set(B), while the identical
      // fingerprint retains the lease required by the matching clear.
      JSON.stringify(event.loci),
    ].join("\u0000");
    const phase = event.phase ?? "set";
    // Real Seq* clears retain their loci. Some native-compatible adapters
    // deliberately send an empty clear payload, however; pair that clear with
    // the current source lease instead of minting a second owner.
    const leaseKey =
      phase === "clear"
        ? (this.activeNativeLeaseKeys.get(interaction) ?? nativeLeaseKey)
        : nativeLeaseKey;
    const lease = this.nativeLeases.get(leaseKey) ?? {
      correlationId: id(),
      interactionId: id(),
    };
    if (phase === "set") {
      this.nativeLeases.set(leaseKey, lease);
      this.activeNativeLeaseKeys.set(interaction, leaseKey);
    }
    const payload: InteractionEvent = {
      interactionId: lease.interactionId,
      interaction,
      phase,
      origin: {
        componentId: this.id,
        documentId: event.documentId,
        viewId: event.viewId,
        ...(event.sectionId === undefined ? {} : { sectionId: event.sectionId }),
        ...(event.trackId === undefined ? {} : { trackId: event.trackId }),
        ...(event.layerId === undefined ? {} : { layerId: event.layerId }),
        ...(event.sequenceId === undefined ? {} : { sequenceId: event.sequenceId }),
        ...(event.alignmentId === undefined ? {} : { alignmentId: event.alignmentId }),
        ...(event.alignmentMemberId === undefined
          ? {}
          : { alignmentMemberId: event.alignmentMemberId }),
      },
      ...(event.annotationId === undefined &&
      event.itemId === undefined &&
      event.trackId === undefined &&
      event.endpointRole === undefined &&
      event.locusIndex === undefined
        ? {}
        : {
            semanticTarget: {
              ...(event.annotationId === undefined ? {} : { annotationId: event.annotationId }),
              ...(event.itemId === undefined ? {} : { itemId: event.itemId }),
              ...(event.trackId === undefined ? {} : { trackId: event.trackId }),
              ...(event.endpointRole === undefined ? {} : { endpointRole: event.endpointRole }),
              ...(event.locusIndex === undefined ? {} : { locusIndex: event.locusIndex }),
            },
          }),
      loci: event.loci,
      ...(event.viewport === undefined ? {} : { viewport: normalizeViewport(event.viewport) }),
    };
    // Relationship hits can share a coordinate-space object across endpoint loci.
    // The event fabric accepts JSON trees, not object graphs, so detach repeated
    // references before publishing across this wrapper boundary.
    const serializedPayload = JSON.parse(JSON.stringify(payload)) as JsonObject;
    context.fabric.publish({
      id: id(),
      type: "interaction.native",
      version: "0.1.0",
      source: { component: this.id },
      correlationId: lease.correlationId,
      timestamp: timestamp(),
      payload: serializedPayload,
    });
    if (phase === "clear") {
      this.nativeLeases.delete(leaseKey);
      if (this.activeNativeLeaseKeys.get(interaction) === leaseKey)
        this.activeNativeLeaseKeys.delete(interaction);
    }
  }

  private apply(family: AppliedFamily, command: InteractionCommand, message: HarnessMessage): void {
    const byOwner = this.applied.get(family);
    const viewer = this.viewer;
    if (byOwner === undefined || viewer === undefined) return;
    const loci = command.loci.filter((locus) =>
      this.activeSpaces.some((space) => coordinateSpaceEquals(space, locus.space)),
    );
    if (loci.length !== command.loci.length)
      this.publishDiagnostic(
        loci.length === 0
          ? "wrapper.seq-viewer.command.unmapped"
          : "wrapper.seq-viewer.command.partial",
        loci.length === 0
          ? "Ignored an interaction command because none of its loci belongs to the active document."
          : "Ignored loci outside the active document while applying an interaction command.",
        message,
      );
    if (loci.length === 0) return;
    const supported = { ...command, loci };
    const key = ownerKey(supported.owner);
    const entries = byOwner.get(key) ?? new Map<string, AppliedEntry>();
    if (supported.mode === "replace") entries.clear();
    if (supported.mode === "remove") {
      for (const [entryId, entry] of entries) {
        const remaining = entry.loci.filter(
          (current) => !supported.loci.some((incoming) => equalLocus(current, incoming)),
        );
        if (remaining.length === 0) entries.delete(entryId);
        else entries.set(entryId, { ...entry, loci: remaining });
      }
    } else if (supported.mode === "toggle") {
      const current = entries.get(supported.interactionId);
      if (
        current !== undefined &&
        supported.loci.every((locus) => current.loci.some((item) => equalLocus(item, locus)))
      )
        entries.delete(supported.interactionId);
      else entries.set(supported.interactionId, supported);
    } else entries.set(supported.interactionId, supported);
    if (entries.size === 0) byOwner.delete(key);
    else byOwner.set(key, entries);
    this.renderApplied(family, key);
  }

  private reportViewerCapabilities(): void {
    if (this.viewer === undefined) return;
    this.currentCapabilities = viewerCapabilities(this.viewer);
    this.context?.reportCapabilities(this.currentCapabilities);
  }

  private publishDiagnostic(code: string, text: string, request: HarnessMessage): void {
    this.context?.fabric.publish({
      id: id(),
      type: "harness.diagnostic",
      version: "0.1.0",
      source: { component: this.id },
      correlationId: request.correlationId,
      causationId: request.id,
      timestamp: timestamp(),
      payload: { diagnostics: [diagnostic(code, text)] } as unknown as JsonObject,
    });
  }

  private clear(family: AppliedFamily, command: InteractionClearCommand): void {
    const byOwner = this.applied.get(family);
    if (byOwner === undefined) return;
    const key = ownerKey(command.owner);
    const entries = byOwner.get(key);
    if (entries === undefined) return;
    for (const [entryId] of entries)
      if (interactionClearApplies({ interactionId: entryId, owner: command.owner }, command))
        entries.delete(entryId);
    if (entries.size === 0) byOwner.delete(key);
    this.renderApplied(family, key);
  }

  private renderApplied(family: AppliedFamily, key: string): void {
    const viewer = this.viewer;
    const entries = this.applied.get(family)?.get(key);
    const owner = { id: `harness:${family}:${key}` };
    const total = [...(this.applied.get(family)?.values() ?? [])].reduce(
      (count, owned) => count + owned.size,
      0,
    );
    const dataset = (this.element as { readonly dataset?: DOMStringMap }).dataset;
    if (dataset !== undefined) {
      if (family === "highlight") dataset.seqstarAppliedHighlights = String(total);
      else dataset.seqstarAppliedSelections = String(total);
    }
    if (viewer === undefined) return;
    if (entries === undefined || entries.size === 0) {
      if (family === "highlight") viewer.clearHighlight(owner);
      else viewer.clearSelection(owner);
      return;
    }
    const loci = [...entries.values()].flatMap((entry) => entry.loci);
    if (family === "highlight") viewer.setHighlight({ owner, loci });
    else viewer.setSelection({ owner, loci });
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.requestAbort?.abort();
    this.requestAbort = undefined;
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    this.nativeSubscription?.unsubscribe();
    this.nativeSubscription = undefined;
    this.applied.clear();
    this.nativeLeases.clear();
    this.activeNativeLeaseKeys.clear();
    this.activeSpaces = [];
    const dataset = (this.element as { readonly dataset?: DOMStringMap }).dataset;
    if (dataset !== undefined) {
      delete dataset.seqstarAppliedHighlights;
      delete dataset.seqstarAppliedSelections;
    }
    this.context?.reportCoordinateSpaces([]);
    this.context = undefined;
    this.viewer?.dispose();
    this.viewer = undefined;
    this.visibleDocument = undefined;
  }
}

export const createReferenceViewerWrapperFactory = (options: {
  readonly getHost: (id: string) => HTMLElement;
  readonly viewerFactory?: (options: CreateSeqViewerOptions) => SeqViewer;
}): ComponentFactory<ReferenceViewerWrapperConfig> => ({
  type: referenceViewerWrapperType,
  create({ id: componentId, config }) {
    return new ReferenceViewerWrapper({
      id: componentId,
      target: options.getHost(componentId),
      ...(config === undefined ? {} : { config }),
      ...(options.viewerFactory === undefined ? {} : { viewerFactory: options.viewerFactory }),
    });
  },
});

export const referenceViewerWrapperFactory: VisualizerWrapperFactory<ReferenceViewerWrapperConfig> =
  {
    type: referenceViewerWrapperType,
    create(options) {
      return new ReferenceViewerWrapper(options);
    },
  };

export interface SeqViewerWrapperPackageBoundary {
  readonly packageName: "@seq-star/wrapper-seq-viewer";
}
