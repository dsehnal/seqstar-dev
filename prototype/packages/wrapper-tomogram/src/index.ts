import {
  type Capability,
  type ComponentContext,
  type ComponentFactory,
  type HarnessComponent,
  type HarnessMessage,
  type InteractionClearCommand,
  type InteractionCommand,
  type InteractionLease,
  interactionClearApplies,
  type LifecycleResult,
  payloadSchema,
  type VisualizationRequest,
} from "@seq-star/harness-core";
import {
  type CoordinateLocus,
  type CoordinateSpace,
  CoordinateSpaceSchema,
} from "@seq-star/seq-coords";
import type { Diagnostic, JsonObject, JsonValue } from "@seq-star/seq-core";

export const tomogramWrapperType = "seqstar.tomogram-particles";
export const tomogramRequestType = "visualization.tomogram.request";

export interface TomogramParticle {
  readonly id: string;
  readonly classId: string;
  readonly location: readonly [number, number, number];
  readonly orientation?: readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ];
}

export interface TomogramViewDocument {
  readonly kind: "tomogram-particle-view";
  readonly version: "0.1.0";
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly datasetId: string;
  readonly runId: string;
  readonly tomogramId: string;
  readonly neuroglancerUrl: string;
  readonly keyPhotoUrl: string;
  readonly sourceUrl: string;
  readonly dimensions: readonly [number, number, number];
  readonly voxelSpacingAngstrom: number;
  readonly coordinateSpace: CoordinateSpace;
  readonly particleClass: {
    readonly id: string;
    readonly name: string;
    readonly annotationId: string;
    readonly objectId: string;
  };
  readonly particles: readonly TomogramParticle[];
}

export interface TomogramWrapperConfig extends JsonObject {
  readonly embedNeuroglancer?: boolean;
}

const capabilities = Object.freeze([
  "seqstar:format/tomogram-particle-view",
  "seqstar:coordinates/spatial-particle",
  "seqstar:interaction/native-hover",
  "seqstar:interaction/native-selection",
  "seqstar:interaction/external-highlight",
  "seqstar:interaction/external-selection",
] satisfies readonly Capability[]);

const uuid = (): string => globalThis.crypto.randomUUID();
const now = (): string => new Date().toISOString();
const diagnostic = (code: string, message: string): Diagnostic => ({
  code,
  severity: "error",
  message,
});
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const objectWithOnly = (
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => keys.includes(key));
const safeUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

export const validateTomogramViewDocument = (value: unknown): value is TomogramViewDocument => {
  if (
    !objectWithOnly(value, [
      "kind",
      "version",
      "id",
      "title",
      "description",
      "datasetId",
      "runId",
      "tomogramId",
      "neuroglancerUrl",
      "keyPhotoUrl",
      "sourceUrl",
      "dimensions",
      "voxelSpacingAngstrom",
      "coordinateSpace",
      "particleClass",
      "particles",
    ])
  )
    return false;
  const item = value as Partial<TomogramViewDocument>;
  const coordinateSpace = item.coordinateSpace;
  if (
    item.kind !== "tomogram-particle-view" ||
    item.version !== "0.1.0" ||
    typeof item.id !== "string" ||
    item.id.length === 0 ||
    typeof item.title !== "string" ||
    typeof item.description !== "string" ||
    typeof item.datasetId !== "string" ||
    typeof item.runId !== "string" ||
    typeof item.tomogramId !== "string" ||
    !safeUrl(item.neuroglancerUrl) ||
    !safeUrl(item.keyPhotoUrl) ||
    !safeUrl(item.sourceUrl) ||
    !Array.isArray(item.dimensions) ||
    item.dimensions.length !== 3 ||
    !item.dimensions.every((dimension) => Number.isSafeInteger(dimension) && dimension > 0) ||
    !finite(item.voxelSpacingAngstrom) ||
    item.voxelSpacingAngstrom <= 0 ||
    !payloadSchema<CoordinateSpace>(CoordinateSpaceSchema).check(coordinateSpace) ||
    coordinateSpace.kind !== "spatial-particle" ||
    coordinateSpace.length !== item.particles?.length ||
    !objectWithOnly(item.particleClass, ["id", "name", "annotationId", "objectId"]) ||
    typeof item.particleClass.id !== "string" ||
    typeof item.particleClass.name !== "string" ||
    typeof item.particleClass.annotationId !== "string" ||
    typeof item.particleClass.objectId !== "string" ||
    !Array.isArray(item.particles) ||
    item.particles.length === 0
  )
    return false;
  const ids = new Set<string>();
  return item.particles.every((particle) => {
    if (
      !objectWithOnly(particle, ["id", "classId", "location", "orientation"]) ||
      typeof particle.id !== "string" ||
      particle.id.length === 0 ||
      ids.has(particle.id) ||
      particle.classId !== item.particleClass?.id ||
      !Array.isArray(particle.location) ||
      particle.location.length !== 3 ||
      !particle.location.every(finite) ||
      (particle.orientation !== undefined &&
        (!Array.isArray(particle.orientation) ||
          particle.orientation.length !== 3 ||
          !particle.orientation.every(
            (row) => Array.isArray(row) && row.length === 3 && row.every(finite),
          )))
    )
      return false;
    ids.add(particle.id);
    return true;
  });
};

type Family = "highlight" | "selection";

export class TomogramWrapper implements HarnessComponent {
  readonly id: string;
  readonly capabilities = capabilities;
  private readonly target: HTMLElement;
  private readonly embedNeuroglancer: boolean;
  private context: ComponentContext | undefined;
  private subscription: { unsubscribe(): void } | undefined;
  private document: TomogramViewDocument | undefined;
  private visibleRequestId: string | undefined;
  private generation = 0;
  private nativeHover: InteractionLease | undefined;
  private nativeSelection: InteractionLease | undefined;
  private readonly applied = new Map<Family, Map<string, InteractionLease>>();
  private disposed = false;

  constructor(options: {
    readonly id: string;
    readonly target: HTMLElement;
    readonly config?: TomogramWrapperConfig;
  }) {
    this.id = options.id;
    this.target = options.target;
    this.embedNeuroglancer = options.config?.embedNeuroglancer !== false;
    this.applied.set("highlight", new Map());
    this.applied.set("selection", new Map());
  }

  async start(context: ComponentContext): Promise<void> {
    if (this.disposed) throw new Error(`Tomogram wrapper '${this.id}' has been disposed.`);
    if (this.context !== undefined) return;
    this.context = context;
    context.reportCapabilities(this.capabilities);
    this.subscription = context.fabric
      .observe({ targetComponent: this.id })
      .subscribe((message) => this.receive(message));
    this.renderPlaceholder();
  }

  private receive(message: HarnessMessage): void {
    if (this.disposed || message.target === undefined || !("component" in message.target)) return;
    if (message.target.component !== this.id) return;
    if (message.type === tomogramRequestType) {
      this.accept(message);
      return;
    }
    const family = message.type.startsWith("interaction.highlight")
      ? "highlight"
      : message.type.startsWith("interaction.selection")
        ? "selection"
        : undefined;
    if (family === undefined) return;
    if (message.type.endsWith(".apply"))
      this.apply(family, message.payload as unknown as InteractionCommand);
    if (message.type.endsWith(".clear"))
      this.clear(family, message.payload as unknown as InteractionClearCommand);
  }

  private accept(message: HarnessMessage): void {
    const request = message.payload as unknown as VisualizationRequest<string, JsonValue>;
    const generation = ++this.generation;
    if (
      request.format !== "tomogram-particle-view" ||
      !validateTomogramViewDocument(request.document)
    ) {
      this.lifecycle(
        request.requestId,
        generation,
        "failed",
        [
          diagnostic(
            "wrapper.tomogram.document.invalid",
            "Tomogram request is not a valid live particle-view document.",
          ),
        ],
        message,
        this.visibleRequestId === undefined ? undefined : "retained",
      );
      return;
    }
    this.lifecycle(request.requestId, generation, "accepted", [], message);
    this.document = request.document;
    this.visibleRequestId = request.requestId;
    this.nativeHover = undefined;
    this.nativeSelection = undefined;
    this.applied.get("highlight")?.clear();
    this.applied.get("selection")?.clear();
    this.context?.reportCoordinateSpaces([request.document.coordinateSpace]);
    this.renderDocument(request.document);
    queueMicrotask(() => {
      if (!this.disposed && generation === this.generation)
        this.lifecycle(request.requestId, generation, "rendered", [], message);
    });
  }

  private locus(index: number): CoordinateLocus {
    const space = this.document?.coordinateSpace;
    if (space === undefined) throw new Error("Tomogram particle space is unavailable.");
    return { kind: "point", space, position: { kind: "index", value: index } };
  }

  private publishNative(
    interaction: "hover" | "select",
    phase: "set" | "clear",
    index?: number,
  ): void {
    const document = this.document;
    const context = this.context;
    if (document === undefined || context === undefined) return;
    const lease = interaction === "hover" ? this.nativeHover : this.nativeSelection;
    if (phase === "clear" && lease === undefined) return;
    const next =
      phase === "set"
        ? { interactionId: uuid(), owner: { correlationId: uuid(), sourceComponent: this.id } }
        : lease;
    if (next === undefined) return;
    if (interaction === "hover") this.nativeHover = phase === "set" ? next : undefined;
    else this.nativeSelection = phase === "set" ? next : undefined;
    const particle = index === undefined ? undefined : document.particles[index];
    context.fabric.publish({
      id: uuid(),
      type: "interaction.native",
      version: "0.1.0",
      source: { component: this.id },
      correlationId: next.owner.correlationId,
      timestamp: now(),
      payload: {
        interactionId: next.interactionId,
        interaction,
        phase,
        ...(phase === "set" ? { mode: "replace" as const } : {}),
        origin: { componentId: this.id, documentId: document.id, viewId: document.tomogramId },
        ...(particle === undefined
          ? {}
          : { semanticTarget: { itemId: particle.id, structureObjectId: particle.classId } }),
        loci: index === undefined ? [] : [this.locus(index)],
      },
    });
  }

  private apply(family: Family, command: InteractionCommand): void {
    this.applied
      .get(family)
      ?.set(`${command.owner.sourceComponent}\0${command.owner.correlationId}`, command);
    this.renderMarks();
  }

  private clear(family: Family, command: InteractionClearCommand): void {
    const entries = this.applied.get(family);
    if (entries === undefined) return;
    for (const [key, lease] of entries)
      if (interactionClearApplies(lease, command)) entries.delete(key);
    this.renderMarks();
  }

  private selectedIndexes(family: Family): Set<number> {
    const result = new Set<number>();
    for (const lease of this.applied.get(family)?.values() ?? []) {
      const command = lease as InteractionLease & { readonly loci?: readonly CoordinateLocus[] };
      for (const locus of command.loci ?? [])
        if (locus.kind === "point" && locus.position.kind === "index")
          result.add(locus.position.value);
    }
    return result;
  }

  private renderPlaceholder(): void {
    this.target.replaceChildren(
      Object.assign(document.createElement("p"), {
        className: "tomogram-placeholder",
        textContent: "Loading live CryoET Portal data…",
      }),
    );
  }

  private renderDocument(documentValue: TomogramViewDocument): void {
    const root = document.createElement("div");
    root.className = "tomogram-viewer";
    root.dataset.tomogramDocumentId = documentValue.id;
    const heading = document.createElement("div");
    heading.className = "tomogram-viewer__heading";
    const headingCopy = document.createElement("div");
    const headingTitle = document.createElement("strong");
    headingTitle.textContent = documentValue.title;
    const headingDescription = document.createElement("span");
    headingDescription.textContent = documentValue.description;
    headingCopy.append(headingTitle, headingDescription);
    heading.append(headingCopy);
    const source = document.createElement("a");
    source.href = documentValue.sourceUrl;
    source.target = "_blank";
    source.rel = "noreferrer";
    source.textContent = "CryoET Portal ↗";
    heading.append(source);
    root.append(heading);

    const stage = document.createElement("div");
    stage.className = "tomogram-viewer__stage";
    const image = document.createElement("img");
    image.src = documentValue.keyPhotoUrl;
    image.alt = `${documentValue.title} key tomogram slice`;
    image.referrerPolicy = "no-referrer";
    stage.append(image);
    const overlay = document.createElement("div");
    overlay.className = "tomogram-viewer__particles";
    overlay.setAttribute(
      "aria-label",
      `${documentValue.particles.length} ${documentValue.particleClass.name} annotations`,
    );
    documentValue.particles.forEach((particle, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tomogram-particle";
      button.dataset.particleIndex = String(index);
      button.dataset.particleId = particle.id;
      button.style.left = `${(particle.location[0] / documentValue.dimensions[0]) * 100}%`;
      button.style.top = `${(particle.location[1] / documentValue.dimensions[1]) * 100}%`;
      button.title = `${particle.id}: x ${particle.location[0].toFixed(1)}, y ${particle.location[1].toFixed(1)}, z ${particle.location[2].toFixed(1)}`;
      button.setAttribute("aria-label", `Select ${documentValue.particleClass.name} ${index + 1}`);
      button.addEventListener("pointerenter", () => this.publishNative("hover", "set", index));
      button.addEventListener("pointerleave", () => this.publishNative("hover", "clear"));
      button.addEventListener("click", () => {
        const active = button.dataset.selected === "true";
        if (active) this.publishNative("select", "clear");
        else this.publishNative("select", "set", index);
        overlay.querySelectorAll<HTMLElement>(".tomogram-particle").forEach((item) => {
          delete item.dataset.selected;
        });
        if (!active) button.dataset.selected = "true";
      });
      overlay.append(button);
    });
    stage.append(overlay);
    root.append(stage);

    const footer = document.createElement("div");
    footer.className = "tomogram-viewer__footer";
    footer.textContent = `${documentValue.particles.length} live oriented-point annotations · ${documentValue.voxelSpacingAngstrom.toFixed(3)} Å / voxel`;
    const neuroglancer = document.createElement("a");
    neuroglancer.href = documentValue.neuroglancerUrl;
    neuroglancer.target = "_blank";
    neuroglancer.rel = "noreferrer";
    neuroglancer.textContent = "Open full Neuroglancer ↗";
    footer.append(neuroglancer);
    root.append(footer);
    if (this.embedNeuroglancer) {
      const frame = document.createElement("iframe");
      frame.className = "tomogram-viewer__neuroglancer";
      frame.title = "Read-only Neuroglancer tomogram";
      frame.loading = "lazy";
      frame.src = documentValue.neuroglancerUrl;
      frame.referrerPolicy = "no-referrer";
      root.append(frame);
    }
    this.target.replaceChildren(root);
    this.renderMarks();
  }

  private renderMarks(): void {
    const highlighted = this.selectedIndexes("highlight");
    const selected = this.selectedIndexes("selection");
    this.target.querySelectorAll<HTMLElement>(".tomogram-particle").forEach((element) => {
      const index = Number(element.dataset.particleIndex);
      element.toggleAttribute("data-external-highlight", highlighted.has(index));
      element.toggleAttribute("data-external-selection", selected.has(index));
    });
  }

  private lifecycle(
    requestId: string,
    generation: number,
    status: LifecycleResult["status"],
    diagnostics: readonly Diagnostic[],
    request: HarnessMessage,
    previousView?: "retained" | "cleared",
  ): void {
    this.context?.fabric.publish({
      id: uuid(),
      type: "lifecycle.visualization",
      version: "0.1.0",
      source: { component: this.id },
      target: request.source as never,
      correlationId: request.correlationId,
      causationId: request.id,
      timestamp: now(),
      payload: {
        requestId,
        generation,
        componentId: this.id,
        status,
        ...(status === "rendered" ? { visibleRequestId: requestId } : {}),
        ...(previousView === undefined ? {} : { previousView }),
        capabilities: this.capabilities,
        diagnostics,
      } as never,
    });
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    this.context?.reportCoordinateSpaces([]);
    this.context = undefined;
    this.document = undefined;
    this.target.replaceChildren();
  }
}

export const createTomogramWrapperFactory = (options: {
  readonly getHost: (id: string) => HTMLElement;
}): ComponentFactory<TomogramWrapperConfig> => ({
  type: tomogramWrapperType,
  create({ id, config }) {
    return new TomogramWrapper({
      id,
      target: options.getHost(id),
      ...(config === undefined ? {} : { config }),
    });
  },
});
