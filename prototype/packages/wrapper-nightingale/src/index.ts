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
  type VisualizationRequest,
} from "@seq-star/harness-core";
import {
  type CoordinateLocus,
  type CoordinateSpace,
  coordinateLocusEquals,
  coordinateSpaceEquals,
} from "@seq-star/seq-coords";
import { type Diagnostic, diagnostic, type JsonObject } from "@seq-star/seq-core";
import {
  evaluateColorEncoding,
  type SeqViewSpec,
  validateSeqViewSpec,
} from "@seq-star/seq-view-spec";

export const nightingaleWrapperType = "seqstar.nightingale";

type Subscription = { unsubscribe(): void };
type AppliedFamily = "highlight" | "selection";
type Layer = SeqViewSpec["views"][number]["sections"][number]["tracks"][number]["layers"][number];
type Annotation = NonNullable<SeqViewSpec["annotations"]>[number];
type NativeElement = HTMLElement & {
  data?: unknown;
  height?: number;
  length?: number;
  width?: number;
  seqstarTrackId: string;
  seqstarLayerId: string;
  seqstarGeneration: number;
  waitForSeqstarFirstRender(generation: number, signal?: AbortSignal): Promise<void>;
  setSeqstarInteraction(
    family: AppliedFamily,
    owner: string,
    regions: readonly { readonly start: number; readonly end: number }[],
  ): void;
  clearSeqstarInteraction(family: AppliedFamily, owner: string): void;
  activateSeqstarTrack(): void;
};

const capabilities = Object.freeze([
  "seqstar:format/seqviewspec",
  "seqstar:coordinates/sequence",
  "seqstar:interaction/native-hover",
  "seqstar:interaction/native-selection",
  "seqstar:interaction/native-track-activate",
  "seqstar:interaction/external-highlight",
  "seqstar:interaction/external-selection",
  "seqviewspec:representation/sequence",
  "seqviewspec:representation/blocks",
  "seqviewspec:representation/markers",
  "seqstar:nightingale/fallback-bars-heatmap",
  "seqviewspec:representation/heatmap",
  "seqviewspec:representation/swatch",
  "seqstar:nightingale/fallback-links-endpoints",
] satisfies readonly Capability[]);

let registrations: Promise<void> | undefined;
const registerNightingaleElements = (): Promise<void> =>
  (registrations ??= Promise.all([
    import("@nightingale-elements/nightingale-linegraph-track"),
    import("@nightingale-elements/nightingale-sequence"),
    import("@nightingale-elements/nightingale-track"),
  ]).then(() => undefined));

const newId = (): string => globalThis.crypto.randomUUID();
const now = (): string => new Date().toISOString();
const error = (code: string, message: string): Diagnostic => diagnostic(code, message, "");
const warning = (code: string, message: string): Diagnostic => ({
  ...diagnostic(code, message, ""),
  severity: "warning",
});
class NightingaleRenderFailure extends Error {
  readonly diagnostics: readonly Diagnostic[];
  constructor(diagnostics: readonly Diagnostic[]) {
    super(diagnostics.map((entry) => entry.message).join(" "));
    this.diagnostics = diagnostics;
  }
}
const rejectLayer = (layer: Layer, message: string): never => {
  throw new NightingaleRenderFailure([
    error("wrapper.nightingale.layer.unsupported", `Layer '${layer.id}' ${message}`),
  ]);
};
const ownerKey = (owner: InteractionCommand["owner"]): string =>
  `${owner.correlationId}\u0000${owner.sourceComponent}`;
export interface NightingaleIdentity {
  readonly documentId: string;
  readonly viewId: string;
  readonly sectionId: string;
  readonly trackId: string;
  readonly layerId: string;
  readonly generation: number;
  readonly itemId?: string;
  readonly endpointRole?: string;
  readonly endpointIndex?: number;
  readonly locusIndex?: number;
  readonly nativeId: string;
}

/** Explicit portable-to-native identity table; no label or DOM-order recovery is used. */
export class NightingaleIdentityTable {
  private readonly byPortable = new Map<string, NightingaleIdentity>();
  private readonly byNative = new Map<string, NightingaleIdentity>();

  add(identity: NightingaleIdentity): void {
    const portable = [
      identity.documentId,
      identity.viewId,
      identity.sectionId,
      identity.trackId,
      identity.layerId,
      identity.itemId ?? "",
      identity.endpointRole ?? "",
      identity.endpointIndex ?? -1,
      identity.locusIndex ?? -1,
    ].join("\u0000");
    if (this.byPortable.has(portable) || this.byNative.has(identity.nativeId))
      throw new Error(`Duplicate Nightingale identity '${identity.nativeId}'.`);
    this.byPortable.set(portable, Object.freeze({ ...identity }));
    this.byNative.set(identity.nativeId, Object.freeze({ ...identity }));
  }

  getNative(nativeId: string): NightingaleIdentity | undefined {
    return this.byNative.get(nativeId);
  }

  entries(): readonly NightingaleIdentity[] {
    return Object.freeze([...this.byNative.values()]);
  }
}

export interface NightingaleNativeInteraction {
  readonly interaction: "hover" | "select" | "track-activate";
  readonly phase: "set" | "clear";
  readonly loci: readonly CoordinateLocus[];
  readonly identity?: NightingaleIdentity;
}

export interface NightingaleLoadResult {
  readonly status: "rendered" | "degraded";
  readonly diagnostics: readonly Diagnostic[];
  readonly identities: NightingaleIdentityTable;
}

/**
 * Native boundary deliberately contains no harness concepts. Test drivers can
 * provide a controlled first-frame promise without replacing wrapper behavior.
 */
export interface NightingaleNativeDriver {
  render(options: {
    readonly document: SeqViewSpec;
    readonly viewId: string;
    readonly generation: number;
    readonly signal: AbortSignal;
    readonly beforePromote?: () => void;
  }): Promise<NightingaleLoadResult>;
  interactions: { subscribe(next: (event: NightingaleNativeInteraction) => void): Subscription };
  setApplied(family: AppliedFamily, owner: string, loci: readonly CoordinateLocus[]): void;
  clearApplied(family: AppliedFamily, owner: string): void;
  resize(): void;
  dispose(): void;
}

const coordinateSpaces = (document: SeqViewSpec): readonly CoordinateSpace[] =>
  Object.freeze(
    document.sequences.map((sequence) =>
      Object.freeze({
        id: sequence.coordinateSpace,
        kind: "sequence",
        length: [...sequence.residues].length,
      } satisfies CoordinateSpace),
    ),
  );

const sequenceSpace = (document: SeqViewSpec, id: string): CoordinateSpace | undefined => {
  const sequence = document.sequences.find((value) => value.coordinateSpace === id);
  return sequence === undefined
    ? undefined
    : { id, kind: "sequence", length: [...sequence.residues].length };
};

const annotation = (document: SeqViewSpec, id: string): Annotation | undefined =>
  document.annotations?.find((entry) => entry.id === id);

const encodedColor = (
  encoding: Exclude<Layer, { representation: "sequence" | "alignment" }>["color"] | undefined,
  value: string | number | boolean | null,
  itemId?: string,
  properties?: Readonly<Record<string, string | number | boolean | null>>,
): string => {
  if (encoding === undefined) return "#2563eb";
  try {
    return evaluateColorEncoding(encoding, value, itemId, properties);
  } catch {
    return "#94a3b8";
  }
};
const colorFor = (
  layer: Layer,
  value: string | number | boolean | null,
  itemId?: string,
  properties?: Readonly<Record<string, string | number | boolean | null>>,
): string => {
  if (layer.representation === "sequence" || layer.representation === "alignment")
    return layer.color?.color ?? "#1e3a5f";
  return encodedColor(layer.color, value, itemId, properties);
};

const pointAt = (space: CoordinateSpace, position: number): CoordinateLocus => ({
  kind: "point",
  space,
  position: { kind: "index", value: Math.max(0, Math.min((space.length ?? 1) - 1, position)) },
});
const composedPart = (role: string, value: string): string => `${role}:${value.length}:${value}`;
export const composeNightingaleNativeId = (
  ...parts: readonly (readonly [string, string])[]
): string => `seqstar-ng|${parts.map(([role, value]) => composedPart(role, value)).join("|")}`;
const nativeChildId = (parent: string, role: string, value: string): string =>
  `${parent}|${composedPart(role, value)}`;
const nativeItemId = (layerNativeId: string, itemId: string): string =>
  nativeChildId(layerNativeId, "item", itemId);

type VendorInteractionDetail = {
  readonly kind: "hover" | "select" | "activate";
  readonly phase: "set" | "clear";
  readonly generation: number;
  readonly trackId: string;
  readonly layerId: string;
  readonly featureId?: string;
  readonly regions: readonly { readonly start: number; readonly end: number }[];
};
type NativeTree = {
  readonly root: HTMLDivElement;
  readonly cleanups: Array<() => void>;
  readonly generation: number;
  readonly abort: AbortController;
};

export class NativeNightingaleDriver implements NightingaleNativeDriver {
  readonly interactions = {
    subscribe: (next: (event: NightingaleNativeInteraction) => void): Subscription => {
      this.listeners.add(next);
      return { unsubscribe: () => this.listeners.delete(next) };
    },
  };
  private readonly target: HTMLElement;
  private readonly listeners = new Set<(event: NightingaleNativeInteraction) => void>();
  private readonly applied = new Map<AppliedFamily, Map<string, readonly CoordinateLocus[]>>();
  private activeTree: NativeTree | undefined;
  private stagingTree: NativeTree | undefined;
  private resizeObserver: ResizeObserver | undefined;
  private disposed = false;

  constructor(target: HTMLElement) {
    this.target = target;
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(target);
    }
  }

  private get root(): HTMLDivElement {
    const root = this.stagingTree?.root ?? this.activeTree?.root;
    if (root === undefined) throw new Error("Nightingale render tree is unavailable.");
    return root;
  }

  private get cleanups(): Array<() => void> {
    const cleanups = this.stagingTree?.cleanups ?? this.activeTree?.cleanups;
    if (cleanups === undefined) throw new Error("Nightingale render cleanup is unavailable.");
    return cleanups;
  }

  private createTree(generation: number): NativeTree {
    const root = document.createElement("div");
    root.dataset.seqstarNightingaleStaging = String(generation);
    root.style.display = "grid";
    root.style.gap = "0.45rem";
    root.style.minWidth = "0";
    root.style.position = "absolute";
    root.style.visibility = "hidden";
    root.style.pointerEvents = "none";
    root.style.insetInlineStart = "-100000px";
    root.style.width = `${Math.max(1, Math.floor(this.target.getBoundingClientRect().width || 760))}px`;
    return { root, cleanups: [], generation, abort: new AbortController() };
  }

  private disposeTree(tree: NativeTree | undefined): void {
    if (tree === undefined) return;
    tree.abort.abort();
    for (const cleanup of tree.cleanups.splice(0)) cleanup();
    tree.root.remove();
  }

  async render(options: {
    readonly document: SeqViewSpec;
    readonly viewId: string;
    readonly generation: number;
    readonly signal: AbortSignal;
    readonly beforePromote?: () => void;
  }): Promise<NightingaleLoadResult> {
    if (this.disposed) throw new Error("Nightingale driver is disposed.");
    if (options.signal.aborted) throw new DOMException("superseded", "AbortError");
    await registerNightingaleElements();
    this.disposeTree(this.stagingTree);
    const staging = this.createTree(options.generation);
    this.stagingTree = staging;
    this.target.append(staging.root);
    try {
      const result = await this.renderStaged({
        ...options,
        signal: AbortSignal.any([options.signal, staging.abort.signal]),
      });
      if (this.disposed || options.signal.aborted || this.stagingTree !== staging)
        throw new DOMException("superseded", "AbortError");
      this.reapply();
      options.beforePromote?.();
      delete staging.root.dataset.seqstarNightingaleStaging;
      staging.root.dataset.seqstarNightingale = "root";
      staging.root.style.position = "";
      staging.root.style.visibility = "";
      staging.root.style.pointerEvents = "";
      staging.root.style.insetInlineStart = "";
      staging.root.style.width = "";
      const previous = this.activeTree;
      this.activeTree = staging;
      this.stagingTree = undefined;
      this.disposeTree(previous);
      return result;
    } catch (reason) {
      if (this.stagingTree === staging) this.stagingTree = undefined;
      this.disposeTree(staging);
      throw reason;
    }
  }

  private async renderStaged(options: {
    readonly document: SeqViewSpec;
    readonly viewId: string;
    readonly generation: number;
    readonly signal: AbortSignal;
  }): Promise<NightingaleLoadResult> {
    const view = options.document.views.find((entry) => entry.id === options.viewId);
    if (view === undefined) throw new Error(`Unknown Nightingale view '${options.viewId}'.`);
    const identities = new NightingaleIdentityTable();
    const diagnostics: Diagnostic[] = [];
    const readiness: Promise<void>[] = [];
    const firstSpace = coordinateSpaces(options.document)[0];
    if (firstSpace === undefined) throw new Error("A SeqViewSpec needs a sequence space.");
    const normalized = (event: Event): void => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as VendorInteractionDetail;
      if (detail.generation !== options.generation) return;
      const identity =
        (detail.featureId === undefined ? undefined : identities.getNative(detail.featureId)) ??
        identities
          .entries()
          .find(
            (entry) =>
              entry.trackId === detail.trackId &&
              entry.layerId === detail.layerId &&
              entry.itemId === undefined,
          );
      if (identity === undefined) return;
      const space = this.spaceForIdentity(options.document, identity) ?? firstSpace;
      const loci =
        detail.phase === "clear"
          ? []
          : identity.itemId === undefined
            ? detail.regions.map<CoordinateLocus>((region) =>
                region.start === region.end
                  ? pointAt(space, region.start - 1)
                  : { kind: "interval", space, start: region.start - 1, end: region.end },
              )
            : this.lociForIdentity(options.document, identity);
      this.emit({
        interaction:
          detail.kind === "activate"
            ? "track-activate"
            : detail.kind === "select"
              ? "select"
              : "hover",
        phase: detail.phase,
        loci,
        identity,
      });
    };
    this.root.addEventListener("nightingale-interaction", normalized);
    this.cleanups.push(() => this.root.removeEventListener("nightingale-interaction", normalized));
    for (const section of view.sections) {
      for (const track of section.tracks) {
        const row = document.createElement("section");
        row.dataset.seqstarTrack = track.id;
        row.style.display = "grid";
        row.style.gridTemplateColumns = "10rem minmax(0, 1fr)";
        row.style.alignItems = "center";
        row.style.gap = "0.5rem";
        const label = document.createElement("button");
        label.type = "button";
        label.textContent = track.label ?? track.id;
        label.dataset.seqstarTrackActivate = track.id;
        label.className = "seqstar-nightingale-track-label";
        label.style.textAlign = "left";
        row.append(label);
        const stack = document.createElement("div");
        stack.style.display = "grid";
        stack.style.gap = "0.2rem";
        row.append(stack);
        this.root.append(row);
        const activate = (): void =>
          stack.querySelector<NativeElement>("[data-seqstar-native-id]")?.activateSeqstarTrack();
        label.addEventListener("click", activate);
        this.cleanups.push(() => label.removeEventListener("click", activate));
        for (const layer of track.layers) {
          const nativeId = composeNightingaleNativeId(
            ["document", options.document.id],
            ["view", view.id],
            ["section", section.id],
            ["track", track.id],
            ["layer", layer.id],
            "annotation" in layer
              ? ["annotation", layer.annotation]
              : "sequence" in layer
                ? ["sequence", layer.sequence]
                : ["alignment", layer.alignment],
          );
          const identity: NightingaleIdentity = {
            documentId: options.document.id,
            viewId: view.id,
            sectionId: section.id,
            trackId: track.id,
            layerId: layer.id,
            generation: options.generation,
            nativeId,
          };
          identities.add(identity);
          if ("annotation" in layer) {
            const itemAnnotation = annotation(options.document, layer.annotation);
            if (itemAnnotation?.kind === "loci")
              for (const item of itemAnnotation.items)
                identities.add({
                  ...identity,
                  itemId: item.id,
                  nativeId: nativeItemId(nativeId, item.id),
                });
            else if (itemAnnotation?.kind === "relationships")
              for (const item of itemAnnotation.items)
                item.endpoints.forEach((endpoint, endpointIndex) => {
                  endpoint.loci.forEach((_locus, locusIndex) => {
                    identities.add({
                      ...identity,
                      itemId: item.id,
                      endpointRole: endpoint.role,
                      endpointIndex,
                      locusIndex,
                      nativeId: nativeChildId(
                        nativeChildId(
                          nativeChildId(
                            nativeItemId(nativeId, item.id),
                            "endpoint-role",
                            endpoint.role,
                          ),
                          "endpoint-index",
                          String(endpointIndex),
                        ),
                        "locus-index",
                        String(locusIndex),
                      ),
                    });
                  });
                });
          }
          const rendered = this.layerElement(
            options.document,
            layer,
            nativeId,
            track.id,
            options.generation,
            diagnostics,
          );
          rendered.dataset.seqstarNativeId = nativeId;
          rendered.dataset.seqstarLayer = layer.id;
          rendered.dataset.seqstarTrack = track.id;
          const renderedSpace = this.spaceForIdentity(options.document, identity);
          if (renderedSpace !== undefined) rendered.dataset.seqstarSpace = renderedSpace.id;
          const ready = rendered.waitForSeqstarFirstRender(options.generation, options.signal);
          // A later layer can reject the staged view before Promise.all is
          // reached; attach rejection handling immediately so staging abort is
          // never reported as an unhandled browser promise.
          void ready.catch(() => undefined);
          readiness.push(ready);
          stack.append(rendered);
        }
      }
    }
    await Promise.all(readiness);
    if (options.signal.aborted) throw new DOMException("superseded", "AbortError");
    return { status: diagnostics.length === 0 ? "rendered" : "degraded", diagnostics, identities };
  }

  private layerElement(
    documentValue: SeqViewSpec,
    layer: Layer,
    nativeId: string,
    trackId: string,
    generation: number,
    diagnostics: Diagnostic[],
  ): NativeElement {
    const firstSequence = documentValue.sequences[0];
    if (firstSequence === undefined) throw new Error("A SeqViewSpec needs a sequence.");
    const length = [...firstSequence.residues].length;
    const basic = (tag: string, height: number): NativeElement => {
      const element = document.createElement(tag) as NativeElement;
      element.length = length;
      element.width = Math.max(1, Math.floor(this.root.getBoundingClientRect().width || 760));
      element.height = height;
      element.seqstarTrackId = trackId;
      element.seqstarLayerId = layer.id;
      element.seqstarGeneration = generation;
      element.setAttribute("length", String(length));
      element.setAttribute("width", String(element.width));
      element.setAttribute("height", String(height));
      element.setAttribute("highlight-event", "onmouseover");
      return element;
    };
    if (layer.representation === "sequence") {
      const sequence = documentValue.sequences.find((entry) => entry.id === layer.sequence);
      if (sequence === undefined) return rejectLayer(layer, "references an absent sequence.");
      const element = basic("nightingale-sequence", 34);
      element.data = sequence.residues;
      return element;
    }
    if (layer.representation === "alignment") {
      return rejectLayer(
        layer,
        "requests alignment, which has no schema-declarable Nightingale fallback.",
      );
    }
    const source = annotation(documentValue, layer.annotation);
    if (source === undefined) return rejectLayer(layer, "references an absent annotation.");
    if (layer.representation === "bars" && source.kind === "values") {
      const exactColor = layer.color?.kind === "fixed" ? layer.color.color : undefined;
      if (layer.color !== undefined && exactColor === undefined) {
        if (layer.fallback?.representation !== "heatmap")
          return rejectLayer(
            layer,
            "uses a per-value bars color encoding without a declared supported heatmap fallback.",
          );
        diagnostics.push(
          warning(
            "wrapper.nightingale.fallback.bars-heatmap",
            `Layer '${layer.id}' uses its declared heatmap fallback because Nightingale bars cannot preserve per-value color.`,
          ),
        );
        const fallback = layer.fallback;
        const element = basic("nightingale-track", 18);
        const values =
          source.values.encoding === "dense"
            ? source.values.data.map((value, position) => ({ position, value }))
            : source.values.data;
        element.data = values
          .filter((entry) => entry.value !== null)
          .map((entry) => ({
            accession: `${nativeId}:value-${entry.position}`,
            externalId: nativeChildId(nativeId, "value", String(entry.position)),
            start: entry.position + 1,
            end: entry.position + 1,
            shape: "rectangle",
            color: encodedColor(fallback.color, entry.value),
            tooltipContent: `${entry.value ?? "missing"}`,
          }));
        return element;
      }
      const element = basic("nightingale-linegraph-track", 58);
      const values =
        source.values.encoding === "dense"
          ? source.values.data.map((value, position) => ({
              position: position + 1,
              value: Number(value ?? 0),
            }))
          : source.values.data.map((entry) => ({
              position: entry.position + 1,
              value: Number(entry.value ?? 0),
            }));
      element.data = [
        {
          name: nativeId,
          externalId: nativeId,
          range: layer.scale?.domain ?? [0, 1],
          color: exactColor ?? "#2563eb",
          values,
        },
      ];
      return element;
    }
    if (
      (layer.representation === "heatmap" || layer.representation === "swatch") &&
      source.kind === "values"
    ) {
      const element = basic("nightingale-track", 18);
      const values =
        source.values.encoding === "dense"
          ? source.values.data.map((value, position) => ({ position, value }))
          : source.values.data;
      element.data = values
        .filter((entry) => entry.value !== null)
        .map((entry) => ({
          accession: `${nativeId}:value-${entry.position}`,
          externalId: `${nativeId}:value:${entry.position}`,
          start: entry.position + 1,
          end: entry.position + 1,
          shape: "rectangle",
          color: colorFor(layer, entry.value),
          tooltipContent: `${entry.value ?? "missing"}`,
        }));
      return element;
    }
    if (
      (layer.representation === "blocks" || layer.representation === "markers") &&
      source.kind === "loci"
    ) {
      const element = basic("nightingale-track", layer.representation === "markers" ? 24 : 30);
      element.data = source.items.flatMap((item) =>
        item.loci.flatMap((locus, index) => {
          if (locus.kind === "boundary") return [];
          const start = locus.kind === "point" ? locus.position + 1 : locus.start + 1;
          const end = locus.kind === "point" ? locus.position + 1 : locus.end;
          return [
            {
              accession: item.id,
              externalId: nativeItemId(nativeId, item.id),
              start,
              end,
              shape:
                layer.representation === "markers"
                  ? layer.shape === "line"
                    ? "line"
                    : "diamond"
                  : "rectangle",
              color: colorFor(layer, item.value ?? null, item.id, item.properties),
              tooltipContent: item.label ?? item.description ?? `${item.id} (${index + 1})`,
            },
          ];
        }),
      );
      return element;
    }
    if (layer.representation === "links" && source.kind === "relationships") {
      if (
        layer.fallback?.representation !== "markers" &&
        layer.fallback?.representation !== "blocks"
      )
        return rejectLayer(
          layer,
          "requests links without a declared supported markers or blocks fallback.",
        );
      diagnostics.push(
        warning(
          "wrapper.nightingale.fallback.links-endpoints",
          `Layer '${layer.id}' uses its declared ${layer.fallback.representation} endpoint fallback; relationship arcs are not claimed.`,
        ),
      );
      const element = basic(
        "nightingale-track",
        layer.fallback.representation === "markers" ? 24 : 30,
      );
      element.data = source.items.flatMap((item) =>
        item.endpoints.flatMap((endpoint, endpointIndex) =>
          endpoint.loci.flatMap((locus, locusIndex) => {
            if (locus.kind === "boundary") return [];
            const start = locus.kind === "point" ? locus.position + 1 : locus.start + 1;
            const end = locus.kind === "point" ? locus.position + 1 : locus.end;
            return [
              {
                accession: `${item.id}:${endpoint.role}:${endpointIndex}`,
                externalId: nativeChildId(
                  nativeChildId(
                    nativeChildId(nativeItemId(nativeId, item.id), "endpoint-role", endpoint.role),
                    "endpoint-index",
                    String(endpointIndex),
                  ),
                  "locus-index",
                  String(locusIndex),
                ),
                start,
                end,
                shape: layer.fallback?.representation === "markers" ? "diamond" : "rectangle",
                color: encodedColor(
                  layer.fallback?.color ?? layer.color,
                  item.value ?? null,
                  item.id,
                  item.properties,
                ),
                tooltipContent: `${item.label ?? item.id} · ${endpoint.role}`,
              },
            ];
          }),
        ),
      );
      return element;
    }
    return rejectLayer(layer, "cannot be represented by its requested or declared fallback.");
  }

  private lociForIdentity(
    documentValue: SeqViewSpec,
    identity: NightingaleIdentity,
  ): readonly CoordinateLocus[] {
    const layer = documentValue.views
      .find((view) => view.id === identity.viewId)
      ?.sections.find((section) => section.id === identity.sectionId)
      ?.tracks.find((track) => track.id === identity.trackId)
      ?.layers.find((candidate) => candidate.id === identity.layerId);
    if (layer === undefined || !("annotation" in layer) || identity.itemId === undefined) return [];
    const item = annotation(documentValue, layer.annotation);
    if (item?.kind === "relationships") {
      const selected = item.items.find((value) => value.id === identity.itemId);
      const endpoint = selected?.endpoints.find((value) => value.role === identity.endpointRole);
      const locus = endpoint?.loci[identity.locusIndex ?? 0];
      if (locus === undefined) return [];
      const space = sequenceSpace(documentValue, locus.space);
      if (space === undefined) return [];
      if (locus.kind === "point")
        return [{ kind: "point", space, position: { kind: "index", value: locus.position } }];
      if (locus.kind === "interval")
        return [{ kind: "interval", space, start: locus.start, end: locus.end }];
      return [{ kind: "boundary", space, position: locus.position }];
    }
    if (item?.kind !== "loci") return [];
    const selected = item.items.find((value) => value.id === identity.itemId);
    return selected === undefined
      ? []
      : selected.loci.flatMap<CoordinateLocus>((locus) => {
          const space = sequenceSpace(documentValue, locus.space);
          if (space === undefined) return [];
          if (locus.kind === "point")
            return [{ kind: "point", space, position: { kind: "index", value: locus.position } }];
          if (locus.kind === "interval")
            return [{ kind: "interval", space, start: locus.start, end: locus.end }];
          return [{ kind: "boundary", space, position: locus.position }];
        });
  }

  private spaceForIdentity(
    documentValue: SeqViewSpec,
    identity: NightingaleIdentity,
  ): CoordinateSpace | undefined {
    const layer = documentValue.views
      .find((view) => view.id === identity.viewId)
      ?.sections.find((section) => section.id === identity.sectionId)
      ?.tracks.find((track) => track.id === identity.trackId)
      ?.layers.find((candidate) => candidate.id === identity.layerId);
    if (layer === undefined) return undefined;
    if (layer.representation === "sequence") {
      const sequence = documentValue.sequences.find((entry) => entry.id === layer.sequence);
      return sequence === undefined
        ? undefined
        : sequenceSpace(documentValue, sequence.coordinateSpace);
    }
    if (layer.representation === "alignment") return undefined;
    const source = annotation(documentValue, layer.annotation);
    const spaceId =
      source?.kind === "values"
        ? source.space
        : source?.kind === "loci"
          ? source.items[0]?.loci[0]?.space
          : source?.items[0]?.endpoints[0]?.loci[0]?.space;
    return spaceId === undefined ? undefined : sequenceSpace(documentValue, spaceId);
  }

  private emit(event: NightingaleNativeInteraction): void {
    if (!this.disposed) for (const listener of this.listeners) listener(event);
  }

  setApplied(family: AppliedFamily, owner: string, loci: readonly CoordinateLocus[]): void {
    const owners = this.applied.get(family) ?? new Map<string, readonly CoordinateLocus[]>();
    owners.set(owner, loci);
    this.applied.set(family, owners);
    for (const tree of [this.activeTree, this.stagingTree])
      if (tree !== undefined)
        for (const element of this.nativeElements(tree.root))
          element.setSeqstarInteraction(
            family,
            owner,
            this.regions(
              loci.filter(
                (locus) =>
                  element.dataset.seqstarSpace === undefined ||
                  locus.space.id === element.dataset.seqstarSpace,
              ),
            ),
          );
    this.updateAppliedCounts();
  }

  clearApplied(family: AppliedFamily, owner: string): void {
    const owners = this.applied.get(family);
    owners?.delete(owner);
    if (owners?.size === 0) this.applied.delete(family);
    for (const tree of [this.activeTree, this.stagingTree])
      if (tree !== undefined)
        for (const element of this.nativeElements(tree.root))
          element.clearSeqstarInteraction(family, owner);
    this.updateAppliedCounts();
  }

  private reapply(): void {
    for (const element of this.nativeElements())
      for (const family of ["highlight", "selection"] as const)
        for (const [owner, loci] of this.applied.get(family) ?? [])
          element.setSeqstarInteraction(
            family,
            owner,
            this.regions(
              loci.filter(
                (locus) =>
                  element.dataset.seqstarSpace === undefined ||
                  locus.space.id === element.dataset.seqstarSpace,
              ),
            ),
          );
    this.updateAppliedCounts();
  }

  private regions(loci: readonly CoordinateLocus[]): readonly { start: number; end: number }[] {
    return loci.flatMap((locus) => {
      if (locus.kind === "interval") return [{ start: locus.start + 1, end: locus.end }];
      if (locus.kind === "boundary") {
        const position = Math.max(1, locus.position);
        return [{ start: position, end: position }];
      }
      return locus.position.kind === "index"
        ? [{ start: locus.position.value + 1, end: locus.position.value + 1 }]
        : [];
    });
  }

  private nativeElements(root = this.root): readonly NativeElement[] {
    return [
      ...root.querySelectorAll<NativeElement>(
        "nightingale-sequence,nightingale-track,nightingale-linegraph-track",
      ),
    ];
  }

  private updateAppliedCounts(): void {
    for (const tree of [this.activeTree, this.stagingTree]) {
      if (tree === undefined) continue;
      tree.root.dataset.seqstarAppliedHighlights = String(
        [...(this.applied.get("highlight")?.values() ?? [])].flat().length,
      );
      tree.root.dataset.seqstarAppliedSelections = String(
        [...(this.applied.get("selection")?.values() ?? [])].flat().length,
      );
    }
  }

  resize(): void {
    const width = Math.max(1, Math.floor(this.target.getBoundingClientRect().width ?? 0));
    if (width <= 1) return;
    for (const tree of [this.activeTree, this.stagingTree])
      if (tree !== undefined)
        for (const element of this.nativeElements(tree.root)) {
          element.width = width;
          element.setAttribute("width", String(width));
        }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.listeners.clear();
    this.applied.clear();
    this.disposeTree(this.stagingTree);
    this.disposeTree(this.activeTree);
    this.stagingTree = undefined;
    this.activeTree = undefined;
  }
}

export interface NightingaleWrapperConfig extends JsonObject {
  readonly failureViewPolicy?: "retain" | "clear";
}

export interface NightingaleWrapperOptions {
  readonly id: string;
  readonly target: HTMLElement;
  readonly config?: NightingaleWrapperConfig;
  readonly driverFactory?: (target: HTMLElement) => NightingaleNativeDriver;
}

type NativeLease = {
  readonly interaction: "hover" | "select";
  readonly correlationId: string;
  readonly interactionId: string;
  readonly documentId: string;
  readonly viewId: string;
  readonly generation: number;
  readonly identity?: NightingaleIdentity;
};

/** Production Nightingale wrapper. Coordinate translation is intentionally owned by the harness. */
export class NightingaleWrapper implements HarnessComponent {
  readonly id: string;
  readonly element: HTMLElement;
  readonly capabilities = capabilities;
  private readonly driverFactory: (target: HTMLElement) => NightingaleNativeDriver;
  private readonly failureViewPolicy: "retain" | "clear";
  private driver: NightingaleNativeDriver | undefined;
  private context: ComponentContext | undefined;
  private subscription: Subscription | undefined;
  private nativeSubscription: Subscription | undefined;
  private requestAbort: AbortController | undefined;
  private generation = 0;
  private acceptedGeneration = 0;
  private visibleRequestId: string | undefined;
  private visibleDocument: SeqViewSpec | undefined;
  private visibleGeneration = 0;
  private spaces: readonly CoordinateSpace[] = [];
  private disposed = false;
  private readonly applied = new Map<AppliedFamily, Map<string, Map<string, InteractionCommand>>>();
  private readonly nativeLeases = new Map<string, NativeLease>();

  constructor(options: NightingaleWrapperOptions) {
    this.id = options.id;
    this.element = options.target;
    this.driverFactory = options.driverFactory ?? ((target) => new NativeNightingaleDriver(target));
    this.failureViewPolicy = options.config?.failureViewPolicy ?? "retain";
    this.applied.set("highlight", new Map());
    this.applied.set("selection", new Map());
  }

  async start(context: ComponentContext): Promise<void> {
    if (this.disposed) throw new Error(`Wrapper '${this.id}' has been disposed.`);
    if (this.context !== undefined) return;
    this.context = context;
    this.driver = this.driverFactory(this.element);
    this.nativeSubscription = this.driver.interactions.subscribe((event) =>
      this.publishNative(event),
    );
    this.subscription = context.fabric
      .observe({ targetComponent: this.id })
      .subscribe((message) => this.receive(message));
    context.reportCapabilities(this.capabilities);
  }

  private receive(message: HarnessMessage): void {
    if (
      this.disposed ||
      message.target === undefined ||
      !("component" in message.target) ||
      message.target.component !== this.id
    )
      return;
    if (message.type === "visualization.seqviewspec.request") {
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
      this.apply(family, message.payload as unknown as InteractionCommand, message);
    else if (message.type.endsWith(".clear"))
      this.clear(family, message.payload as unknown as InteractionClearCommand);
  }

  private accept(message: HarnessMessage): void {
    const request = message.payload as unknown as VisualizationRequest<"seqviewspec", SeqViewSpec>;
    const fail = (diagnostics: readonly Diagnostic[]): void =>
      this.lifecycle(
        request.requestId,
        ++this.generation,
        "failed",
        diagnostics,
        message,
        this.visibleRequestId === undefined ? undefined : "retained",
      );
    if (request.format !== "seqviewspec") {
      fail([
        error(
          "wrapper.nightingale.request.format",
          "Nightingale accepts only SeqViewSpec requests.",
        ),
      ]);
      return;
    }
    const checked = validateSeqViewSpec(request.document);
    if (!checked.ok) {
      fail(checked.diagnostics);
      return;
    }
    const viewId = request.viewId ?? checked.value.views[0]?.id;
    if (viewId === undefined || !checked.value.views.some((view) => view.id === viewId)) {
      fail([
        error("wrapper.nightingale.request.view", "The requested SeqViewSpec view is absent."),
      ]);
      return;
    }
    this.requestAbort?.abort();
    const controller = new AbortController();
    const generation = ++this.generation;
    this.requestAbort = controller;
    this.acceptedGeneration = generation;
    this.lifecycle(request.requestId, generation, "accepted", [], message);
    const driver = this.driver;
    if (driver === undefined) return;
    void driver
      .render({
        document: checked.value,
        viewId,
        generation,
        signal: controller.signal,
        beforePromote: () =>
          this.clearNativeLeases(
            (lease) => lease.documentId !== checked.value.id || lease.generation !== generation,
          ),
      })
      .then(
        (result) => {
          if (
            this.disposed ||
            controller.signal.aborted ||
            generation !== this.acceptedGeneration
          ) {
            this.lifecycle(
              request.requestId,
              generation,
              "superseded",
              result.diagnostics,
              message,
            );
            return;
          }
          this.visibleRequestId = request.requestId;
          this.visibleDocument = checked.value;
          this.visibleGeneration = generation;
          this.spaces = coordinateSpaces(checked.value);
          this.context?.reportCoordinateSpaces(this.spaces);
          this.lifecycle(request.requestId, generation, result.status, result.diagnostics, message);
        },
        (reason: unknown) => {
          if (
            this.disposed ||
            controller.signal.aborted ||
            generation !== this.acceptedGeneration
          ) {
            this.lifecycle(request.requestId, generation, "superseded", [], message);
            return;
          }
          const previousView = this.failure();
          this.lifecycle(
            request.requestId,
            generation,
            "failed",
            reason instanceof NightingaleRenderFailure
              ? reason.diagnostics
              : [
                  error(
                    "wrapper.nightingale.render.failed",
                    reason instanceof Error ? reason.message : "Nightingale rendering failed.",
                  ),
                ],
            message,
            previousView,
          );
        },
      );
  }

  private failure(): "retained" | "cleared" | undefined {
    const prior = this.visibleRequestId !== undefined;
    if (this.failureViewPolicy === "retain") return prior ? "retained" : undefined;
    this.clearNativeLeases();
    this.nativeSubscription?.unsubscribe();
    this.driver?.dispose();
    this.driver = this.driverFactory(this.element);
    this.nativeSubscription = this.driver.interactions.subscribe((event) =>
      this.publishNative(event),
    );
    this.visibleRequestId = undefined;
    this.visibleDocument = undefined;
    this.visibleGeneration = 0;
    this.spaces = [];
    this.context?.reportCoordinateSpaces([]);
    return prior ? "cleared" : undefined;
  }

  private lifecycle(
    requestId: string,
    generation: number,
    status: LifecycleResult["status"],
    diagnostics: readonly Diagnostic[],
    request?: HarnessMessage,
    previousView?: "retained" | "cleared",
  ): void {
    if (this.context === undefined || this.disposed) return;
    this.context.fabric.publish({
      id: newId(),
      type: "lifecycle.visualization",
      version: "0.1.0",
      source: { component: this.id },
      correlationId: request?.correlationId ?? newId(),
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

  private publishNative(event: NightingaleNativeInteraction): void {
    if (this.context === undefined || this.disposed || this.visibleDocument === undefined) return;
    const identity = event.identity;
    const documentId = identity?.documentId ?? this.visibleDocument.id;
    const viewId = identity?.viewId ?? this.visibleDocument.views[0]?.id ?? "";
    const generation = identity?.generation ?? this.visibleGeneration;
    if (documentId !== this.visibleDocument.id || generation !== this.visibleGeneration) return;
    const key = `${documentId}\u0000${generation}\u0000${event.interaction}`;
    const existingLease = this.nativeLeases.get(key);
    if (event.phase === "clear" && existingLease === undefined) return;
    const lease:
      | NativeLease
      | (Omit<NativeLease, "interaction"> & { interaction: "track-activate" }) = existingLease ?? {
      interaction: event.interaction,
      correlationId: newId(),
      interactionId: newId(),
      documentId,
      viewId,
      generation,
      ...(identity === undefined ? {} : { identity }),
    };
    if (event.phase === "set" && event.interaction !== "track-activate")
      this.nativeLeases.set(key, lease as NativeLease);
    this.publishLeaseEvent(lease, event.phase, event.loci);
    if (event.phase === "clear") this.nativeLeases.delete(key);
  }

  private publishLeaseEvent(
    lease: NativeLease | (Omit<NativeLease, "interaction"> & { interaction: "track-activate" }),
    phase: "set" | "clear",
    loci: readonly CoordinateLocus[],
  ): void {
    if (this.context === undefined || this.disposed) return;
    const identity = lease.identity;
    const payload: InteractionEvent = {
      interactionId: lease.interactionId,
      interaction: lease.interaction as InteractionKind,
      phase,
      origin: {
        componentId: this.id,
        documentId: lease.documentId,
        viewId: lease.viewId,
        ...(identity === undefined
          ? {}
          : {
              sectionId: identity.sectionId,
              trackId: identity.trackId,
              layerId: identity.layerId,
            }),
      },
      ...(identity?.itemId === undefined
        ? {}
        : {
            semanticTarget: {
              itemId: identity.itemId,
              trackId: identity.trackId,
              ...(identity.endpointRole === undefined
                ? {}
                : { relationshipId: identity.itemId, endpointRole: identity.endpointRole }),
              ...(identity.locusIndex === undefined ? {} : { locusIndex: identity.locusIndex }),
            },
          }),
      loci,
    };
    this.context.fabric.publish({
      id: newId(),
      type: "interaction.native",
      version: "0.1.0",
      source: { component: this.id },
      correlationId: lease.correlationId,
      timestamp: now(),
      payload: payload as unknown as JsonObject,
    });
  }

  private clearNativeLeases(predicate: (lease: NativeLease) => boolean = () => true): void {
    for (const [key, lease] of [...this.nativeLeases]) {
      if (!predicate(lease)) continue;
      this.publishLeaseEvent(lease, "clear", []);
      this.nativeLeases.delete(key);
    }
  }

  private apply(family: AppliedFamily, command: InteractionCommand, source: HarnessMessage): void {
    const driver = this.driver;
    const group = this.applied.get(family);
    if (driver === undefined || group === undefined) return;
    const loci = command.loci.filter((locus) =>
      this.spaces.some((space) => coordinateSpaceEquals(space, locus.space)),
    );
    if (loci.length !== command.loci.length)
      this.publishDiagnostic(
        loci.length === 0
          ? "wrapper.nightingale.command.unmapped"
          : "wrapper.nightingale.command.partial",
        loci.length === 0
          ? "No command loci belong to the active Nightingale document."
          : "Loci outside the active Nightingale document were ignored.",
        source,
      );
    if (loci.length === 0) return;
    const supported = { ...command, loci };
    const owner = ownerKey(supported.owner);
    const entries = group.get(owner) ?? new Map<string, InteractionCommand>();
    if (supported.mode === "replace") entries.clear();
    if (supported.mode === "remove") {
      for (const [entryId, entry] of entries) {
        const remaining = entry.loci.filter(
          (existing) =>
            !supported.loci.some((incoming) => coordinateLocusEquals(existing, incoming)),
        );
        if (remaining.length === 0) entries.delete(entryId);
        else entries.set(entryId, { ...entry, loci: remaining });
      }
    } else if (supported.mode === "toggle") {
      const prior = entries.get(supported.interactionId);
      if (
        prior !== undefined &&
        supported.loci.every((incoming) =>
          prior.loci.some((existing) => coordinateLocusEquals(existing, incoming)),
        )
      )
        entries.delete(supported.interactionId);
      else entries.set(supported.interactionId, supported);
    } else entries.set(supported.interactionId, supported);
    if (entries.size === 0) group.delete(owner);
    else group.set(owner, entries);
    this.renderApplied(family, owner);
  }

  private clear(family: AppliedFamily, command: InteractionClearCommand): void {
    const group = this.applied.get(family);
    if (group === undefined) return;
    const owner = ownerKey(command.owner);
    const entries = group.get(owner);
    if (entries === undefined) return;
    for (const [interactionId] of entries)
      if (interactionClearApplies({ interactionId, owner: command.owner }, command))
        entries.delete(interactionId);
    if (entries.size === 0) group.delete(owner);
    this.renderApplied(family, owner);
  }

  private renderApplied(family: AppliedFamily, owner: string): void {
    const entries = this.applied.get(family)?.get(owner);
    if (entries === undefined || entries.size === 0) this.driver?.clearApplied(family, owner);
    else
      this.driver?.setApplied(
        family,
        owner,
        [...entries.values()].flatMap((entry) => entry.loci),
      );
  }

  private publishDiagnostic(code: string, message: string, parent: HarnessMessage): void {
    this.context?.fabric.publish({
      id: newId(),
      type: "harness.diagnostic",
      version: "0.1.0",
      source: { component: this.id },
      correlationId: parent.correlationId,
      causationId: parent.id,
      timestamp: now(),
      payload: { diagnostics: [error(code, message)] } as unknown as JsonObject,
    });
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.clearNativeLeases();
    this.disposed = true;
    this.requestAbort?.abort();
    this.subscription?.unsubscribe();
    this.nativeSubscription?.unsubscribe();
    this.applied.clear();
    this.context?.reportCoordinateSpaces([]);
    this.context = undefined;
    this.driver?.dispose();
    this.driver = undefined;
    this.visibleDocument = undefined;
    this.visibleGeneration = 0;
  }
}

export const createNightingaleWrapperFactory = (options: {
  readonly getHost: (id: string) => HTMLElement;
  readonly driverFactory?: (target: HTMLElement) => NightingaleNativeDriver;
}): ComponentFactory<NightingaleWrapperConfig> => ({
  type: nightingaleWrapperType,
  create({ id, config }) {
    return new NightingaleWrapper({
      id,
      target: options.getHost(id),
      ...(config === undefined ? {} : { config }),
      ...(options.driverFactory === undefined ? {} : { driverFactory: options.driverFactory }),
    });
  },
});

export interface NightingaleWrapperPackageBoundary {
  readonly packageName: "@seq-star/wrapper-nightingale";
}
