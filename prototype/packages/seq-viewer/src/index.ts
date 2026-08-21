import type { CoordinateLocus, CoordinateSpace } from "@seq-star/seq-coords";
import { type Diagnostic, diagnostic } from "@seq-star/seq-core";
import {
  evaluateColorEncoding,
  type Locus,
  type SeqViewSpec,
  validateSeqViewSpec,
} from "@seq-star/seq-view-spec";
import { Box, createElement as createLucideElement, Layers, RotateCcw } from "lucide";
import { type Observable, Subject } from "rxjs";

export interface InteractionOwner {
  readonly id: string;
}
export interface SequenceHighlight {
  readonly owner: InteractionOwner;
  readonly loci: readonly CoordinateLocus[];
  readonly trackId?: string;
}
export interface SequenceSelection {
  readonly owner: InteractionOwner;
  readonly loci: readonly CoordinateLocus[];
  readonly trackId?: string;
}
export type RepresentationName =
  | "sequence"
  | "alignment"
  | "blocks"
  | "markers"
  | "bars"
  | "heatmap"
  | "swatch"
  | "links";
export interface SeqViewerCapabilities {
  readonly representations: readonly RepresentationName[];
  readonly supportsExternalHighlight: true;
  readonly supportsExternalSelection: true;
  readonly supportsNativeInteractions: true;
}
export interface SeqViewerViewportSegment {
  readonly segmentId: string;
  readonly spaceId: string;
  readonly start: number;
  readonly end: number;
}
export interface SeqViewerViewport {
  readonly offsetStart: number;
  readonly offsetEnd: number;
  readonly totalColumns: number;
  readonly segments: readonly SeqViewerViewportSegment[];
}
export interface SeqViewerInteraction {
  readonly kind: "hover" | "select" | "track-activate" | "viewport-change";
  readonly phase?: "set" | "clear";
  readonly documentId: string;
  readonly viewId: string;
  readonly sectionId?: string;
  readonly trackId?: string;
  readonly layerId?: string;
  readonly sequenceId?: string;
  readonly alignmentId?: string;
  readonly alignmentMemberId?: string;
  readonly annotationId?: string;
  readonly itemId?: string;
  readonly endpointRole?: string;
  readonly locusIndex?: number;
  readonly viewport?: SeqViewerViewport;
  readonly loci: readonly CoordinateLocus[];
  readonly nativeEvent?: Event;
}
export type TrackPresentationAction = Readonly<{
  readonly kind: "structure-profile" | "layer-inspection";
  readonly accessibleName: string;
  readonly tooltip: string;
  readonly icon: "box" | "layers";
}>;
export type TrackPresentation = Readonly<{
  readonly trackId: string;
  readonly action?: TrackPresentationAction;
}>;
/**
 * A presentation-only action for one concrete alignment member.  The action
 * intentionally carries no structure or mapping data: consumers publish the
 * member identity and let the harness decide what, if anything, can be shown.
 */
export type AlignmentMemberPresentationAction = Readonly<{
  readonly alignmentId: string;
  readonly memberId: string;
  readonly label: string;
  readonly kind?: "structure" | "layers";
}>;
export type SequenceWrapperPresentationConfig = Readonly<{
  /** Presentation fallback for every non-member track in dynamic documents. */
  readonly defaultTrackAction?: TrackPresentationAction;
  readonly tracks?: readonly TrackPresentation[];
  /** When present, this is the authoritative availability list for alignment members. */
  readonly alignmentMemberActions?: readonly AlignmentMemberPresentationAction[];
}>;
type View = SeqViewSpec["views"][number];
type Track = View["sections"][number]["tracks"][number];
type Layer = Track["layers"][number];
type Annotation = NonNullable<SeqViewSpec["annotations"]>[number];
type Segment = View["axis"]["segments"][number];
export interface RepresentationContext {
  readonly document: SeqViewSpec;
  readonly view: View;
  readonly layer: Layer;
  readonly resolvedRepresentation: RepresentationName;
}
export interface RepresentationInstance {
  readonly rendered: "exact" | "fallback";
  readonly representation: RepresentationName;
  dispose?(): void;
}
export interface RepresentationProvider {
  readonly id: string;
  readonly representation: RepresentationName;
  create(context: RepresentationContext): RepresentationInstance;
}
export interface ViewerBehaviorProvider {
  readonly id: string;
  install?(viewer: SeqViewer): undefined | (() => void);
}
export interface SeqViewerPluginSpec {
  readonly representations: readonly RepresentationProvider[];
  readonly behaviors?: readonly ViewerBehaviorProvider[];
}
export interface LayerLoadResult {
  readonly layerId: string;
  readonly requested: RepresentationName;
  readonly rendered?: RepresentationName;
  readonly providerId?: string;
  readonly status: "exact" | "degraded" | "rejected";
  readonly diagnosticCode?: string;
}
export interface LoadResult {
  readonly status: "rendered" | "superseded" | "failed";
  readonly generation: number;
  readonly documentId?: string;
  readonly viewId?: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly representations: readonly RepresentationInstance[];
  readonly layers: readonly LayerLoadResult[];
}
export interface SeqViewer {
  readonly capabilities: SeqViewerCapabilities;
  readonly interactions: Observable<SeqViewerInteraction>;
  load(document: SeqViewSpec, viewId: string, signal?: AbortSignal): Promise<LoadResult>;
  setHighlight(command: SequenceHighlight): void;
  setSelection(command: SequenceSelection): void;
  clearHighlight(owner?: InteractionOwner): void;
  clearSelection(owner?: InteractionOwner): void;
  resize(): void;
  hitTest(clientX: number, clientY: number): SeqViewerInteraction | undefined;
  dispose(): void;
}
export interface CreateSeqViewerOptions {
  readonly target: HTMLElement;
  readonly spec?: SeqViewerPluginSpec;
  /** Presentation-only wrapper configuration; it never changes SeqViewSpec semantics. */
  readonly presentation?: SequenceWrapperPresentationConfig;
}

interface ResolvedLayer {
  readonly layer: Layer;
  readonly representation: RepresentationName;
  readonly status: "exact" | "degraded";
}
interface Row {
  readonly sectionId: string;
  readonly track: Track;
  readonly layers: readonly ResolvedLayer[];
  readonly top: number;
  readonly height: number;
  readonly alignmentId?: string;
  readonly alignmentMemberId?: string;
  readonly sequenceId?: string;
  readonly label: string;
}
interface Active {
  readonly document: SeqViewSpec;
  readonly view: View;
  readonly rows: readonly Row[];
  readonly spaces: ReadonlyMap<string, CoordinateSpace>;
  readonly offsets: readonly number[];
  readonly units: number;
  readonly rulerHeight: number;
  readonly totalHeight: number;
  readonly lanes: ReadonlyMap<string, ReadonlyMap<string, number>>;
}
interface Hit {
  readonly layer: ResolvedLayer;
  readonly annotation?: Annotation;
  readonly itemId?: string;
  readonly endpointRole?: string;
  readonly locusIndex?: number;
  readonly loci: readonly CoordinateLocus[];
}
interface NavigationDrag {
  readonly mode: "pan" | "left" | "right";
  readonly pointerId: number;
  readonly startX: number;
  readonly offsetStart: number;
  readonly offsetEnd: number;
  changed: boolean;
}

const HEADER = 156,
  DEFAULT_ROW = 25,
  RULER = 20,
  GAP = 12,
  NAVIGATION_GAP = 8,
  NAVIGATION_CLEARANCE = 38,
  MIN_VISIBLE_COLUMNS = 2;
const NONE: readonly CoordinateLocus[] = [];
const names: readonly RepresentationName[] = [
  "sequence",
  "alignment",
  "blocks",
  "markers",
  "bars",
  "heatmap",
  "swatch",
  "links",
];
const provider = (representation: RepresentationName): RepresentationProvider => ({
  id: `seq-viewer.${representation}`,
  representation,
  create: () => ({ representation, rendered: "exact" }),
});
export const defaultSeqViewerPluginSpec: SeqViewerPluginSpec = Object.freeze({
  representations: Object.freeze(names.map(provider)),
});
const warning = (code: string, message: string, path = "/views"): Diagnostic => ({
  code,
  severity: "warning",
  message,
  path,
});
const coordinateSpace = (
  id: string,
  kind: "sequence" | "alignment",
  length: number,
): CoordinateSpace => Object.freeze({ id, kind, length });
const point = (space: CoordinateSpace, value: number): CoordinateLocus =>
  Object.freeze({ kind: "point", space, position: Object.freeze({ kind: "index", value }) });
const interval = (space: CoordinateSpace, start: number, end: number): CoordinateLocus =>
  Object.freeze({ kind: "interval", space, start, end });
const boundary = (space: CoordinateSpace, position: number): CoordinateLocus =>
  Object.freeze({ kind: "boundary", space, position });
const annotationById = (document: SeqViewSpec, id: string): Annotation | undefined =>
  document.annotations?.find((item) => item.id === id);
const layerAnnotation = (document: SeqViewSpec, layer: Layer): Annotation | undefined =>
  "annotation" in layer ? annotationById(document, layer.annotation) : undefined;
const layerColor = (
  resolved: ResolvedLayer,
  value: string | number | boolean | null,
  id?: string,
): string => {
  const layer = resolved.layer;
  if (layer.representation === "sequence" || layer.representation === "alignment")
    return layer.color?.color ?? "#102a43";
  const encoding =
    resolved.representation !== layer.representation ? layer.fallback?.color : layer.color;
  if (!encoding) return "#3b82f6";
  try {
    return evaluateColorEncoding(encoding, value, id);
  } catch {
    return "#94a3b8";
  }
};
const numericValues = (annotation: Annotation): readonly number[] =>
  annotation.kind === "values"
    ? (annotation.values.encoding === "dense"
        ? annotation.values.data
        : annotation.values.data.map((item) => item.value)
      ).filter((value): value is number => typeof value === "number")
    : [];
const locusContains = (locus: Locus, space: string, position: number): boolean =>
  locus.space === space &&
  ((locus.kind === "point" && locus.position === position) ||
    (locus.kind === "interval" && position >= locus.start && position < locus.end));

class CanvasSeqViewer implements SeqViewer {
  readonly capabilities: SeqViewerCapabilities;
  private readonly subject = new Subject<SeqViewerInteraction>();
  readonly interactions = this.subject.asObservable();
  private readonly root = document.createElement("div");
  private readonly canvas = document.createElement("canvas");
  private readonly headers = document.createElement("div");
  private readonly spacer = document.createElement("div");
  private readonly navigation = document.createElement("div");
  private readonly navigationAxis = document.createElement("div");
  private readonly navigationWindow = document.createElement("div");
  private readonly navigationLeftHandle = document.createElement("div");
  private readonly navigationRightHandle = document.createElement("div");
  private readonly abort = new AbortController();
  private readonly highlights = new Map<string, SequenceHighlight>();
  private readonly selections = new Map<string, SequenceSelection>();
  private readonly instances: RepresentationInstance[] = [];
  private readonly behaviorCleanup: (() => void)[] = [];
  private readonly observer: ResizeObserver | undefined;
  private active: Active | undefined;
  private generation = 0;
  private disposed = false;
  private frame = 0;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private zoom = 1;
  private pan = 0;
  private nativeHover: SeqViewerInteraction | undefined;
  private nativeSelection: SeqViewerInteraction | undefined;
  private navigationDrag: NavigationDrag | undefined;
  private activeHeaderKey: string | undefined;

  constructor(privateOptions: CreateSeqViewerOptions) {
    this.options = privateOptions;
    const installed =
      privateOptions.spec?.representations ?? defaultSeqViewerPluginSpec.representations;
    this.capabilities = Object.freeze({
      representations: Object.freeze([...new Set(installed.map((item) => item.representation))]),
      supportsExternalHighlight: true,
      supportsExternalSelection: true,
      supportsNativeInteractions: true,
    });
    Object.assign(this.root.style, {
      position: "relative",
      overflow: "auto",
      width: "100%",
      minWidth: "0",
      minHeight: "0",
      boxSizing: "border-box",
      background: "#fff",
      color: "#102a43",
      font: "12px/1.2 ui-monospace, monospace",
    });
    this.root.className = "seq-viewer";
    this.root.dataset.seqViewer = "root";
    Object.assign(this.canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "auto",
    });
    this.canvas.dataset.seqViewer = "canvas";
    Object.assign(this.headers.style, {
      position: "absolute",
      inset: "0 auto 0 0",
      width: `${HEADER - 4}px`,
      pointerEvents: "none",
      zIndex: "1",
    });
    this.configureNavigation();
    this.root.append(this.spacer, this.canvas, this.headers, this.navigation);
    privateOptions.target.replaceChildren(this.root);
    this.root.addEventListener("scroll", this.scroll, { signal: this.abort.signal });
    this.canvas.addEventListener("pointermove", this.hover, { signal: this.abort.signal });
    this.canvas.addEventListener("pointerleave", this.leave, { signal: this.abort.signal });
    this.canvas.addEventListener("click", this.select, { signal: this.abort.signal });
    this.canvas.addEventListener("wheel", this.wheel, {
      signal: this.abort.signal,
      passive: false,
    });
    this.navigation.addEventListener("click", this.navigationControl, {
      signal: this.abort.signal,
    });
    this.navigation.addEventListener("keydown", this.navigationKeydown, {
      signal: this.abort.signal,
    });
    this.navigationAxis.addEventListener("pointerdown", this.navigationPointerDown, {
      signal: this.abort.signal,
    });
    this.navigationAxis.addEventListener("pointermove", this.navigationPointerMove, {
      signal: this.abort.signal,
    });
    this.navigationAxis.addEventListener("pointerup", this.navigationPointerUp, {
      signal: this.abort.signal,
    });
    this.navigationAxis.addEventListener("pointercancel", this.navigationPointerUp, {
      signal: this.abort.signal,
    });
    this.navigationAxis.addEventListener("wheel", this.wheel, {
      signal: this.abort.signal,
      passive: false,
    });
    if (typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(this.resizeObserved);
      this.observer.observe(privateOptions.target);
    } else window.addEventListener("resize", this.resize, { signal: this.abort.signal });
    for (const behavior of privateOptions.spec?.behaviors ?? [])
      try {
        const cleanup = behavior.install?.(this);
        if (cleanup) this.behaviorCleanup.push(cleanup);
      } catch {
        /* a behavior cannot prevent base viewer creation */
      }
    this.resize();
  }
  private readonly options: CreateSeqViewerOptions;

  private configureNavigation(): void {
    this.navigation.dataset.seqViewerNavigation = "root";
    this.navigation.setAttribute("role", "group");
    this.navigation.setAttribute("aria-label", "Sequence navigation");
    Object.assign(this.navigation.style, {
      position: "absolute",
      left: `${HEADER}px`,
      right: "4px",
      bottom: "4px",
      height: "30px",
      display: "none",
      gridTemplateColumns: "minmax(0, 1fr) auto",
      alignItems: "center",
      columnGap: "4px",
      padding: "3px 4px",
      boxSizing: "border-box",
      zIndex: "2",
      pointerEvents: "auto",
      background: "rgb(255 255 255 / 94%)",
      border: "1px solid #cbd5e1",
      borderRadius: "4px",
      boxShadow: "0 1px 2px rgb(15 23 42 / 16%)",
      overflow: "hidden",
    });
    this.navigationAxis.dataset.seqViewerNavigation = "axis";
    this.navigationAxis.title =
      "Drag the window to pan. Drag handles to zoom. Shift-wheel pans; Ctrl-wheel zooms.";
    Object.assign(this.navigationAxis.style, {
      position: "relative",
      minWidth: "0",
      height: "18px",
      overflow: "hidden",
      cursor: "grab",
      background: "#e2e8f0",
      borderRadius: "3px",
      touchAction: "none",
    });
    this.navigationWindow.dataset.seqViewerNavigation = "window";
    this.navigationWindow.tabIndex = 0;
    this.navigationWindow.setAttribute("role", "slider");
    this.navigationWindow.setAttribute("aria-label", "Viewport window; drag to pan");
    Object.assign(this.navigationWindow.style, {
      position: "absolute",
      top: "1px",
      bottom: "1px",
      minWidth: "8px",
      boxSizing: "border-box",
      cursor: "grab",
      background: "rgb(37 99 235 / 24%)",
      border: "1px solid #2563eb",
      borderRadius: "2px",
      outlineOffset: "1px",
    });
    for (const [handle, side, label] of [
      [this.navigationLeftHandle, "left", "Zoom in or out from the left"],
      [this.navigationRightHandle, "right", "Zoom in or out from the right"],
    ] as const) {
      handle.dataset.seqViewerNavigationHandle = side;
      handle.tabIndex = 0;
      handle.setAttribute("role", "slider");
      handle.setAttribute("aria-label", label);
      Object.assign(handle.style, {
        position: "absolute",
        top: "-3px",
        bottom: "-3px",
        width: "6px",
        cursor: "ew-resize",
        background: "#1d4ed8",
        borderRadius: "2px",
      });
      // Handles stay inside the measured window so neither edge can be
      // clipped when the viewport reaches the beginning or end of the axis.
      handle.style[side] = "0";
    }
    this.navigationWindow.append(this.navigationLeftHandle, this.navigationRightHandle);
    const controls = document.createElement("div");
    controls.dataset.seqViewerNavigation = "controls";
    Object.assign(controls.style, {
      display: "flex",
      gap: "2px",
      alignItems: "center",
      flex: "0 0 auto",
    });
    const reset = document.createElement("button");
    reset.type = "button";
    reset.dataset.seqViewerNavigationControl = "reset";
    reset.setAttribute("aria-label", "Reset navigation");
    reset.title = "Reset navigation";
    reset.append(
      createLucideElement(RotateCcw, {
        "aria-hidden": "true",
        focusable: "false",
        height: 15,
        width: 15,
      }),
    );
    Object.assign(reset.style, {
      display: "inline-grid",
      placeItems: "center",
      height: "22px",
      width: "22px",
      padding: "0",
      border: "1px solid #94a3b8",
      borderRadius: "2px",
      background: "#fff",
      color: "#0f172a",
      cursor: "pointer",
    });
    controls.append(reset);
    this.navigationAxis.append(this.navigationWindow);
    this.navigation.append(this.navigationAxis, controls);
  }

  async load(document: SeqViewSpec, viewId: string, signal?: AbortSignal): Promise<LoadResult> {
    const generation = ++this.generation;
    const checked = validateSeqViewSpec(document);
    if (!checked.ok)
      return {
        status: "failed",
        generation,
        diagnostics: checked.diagnostics,
        representations: [],
        layers: [],
      };
    const view = checked.value.views.find((item) => item.id === viewId);
    if (!view)
      return {
        status: "failed",
        generation,
        diagnostics: [diagnostic("seqviewer.view.missing", `Unknown view '${viewId}'.`, "/views")],
        representations: [],
        layers: [],
      };
    if (signal?.aborted || this.disposed || generation !== this.generation)
      return { status: "superseded", generation, diagnostics: [], representations: [], layers: [] };
    const providerMap = new Map(
      (this.options.spec?.representations ?? defaultSeqViewerPluginSpec.representations).map(
        (item) => [item.representation, item],
      ),
    );
    const diagnostics: Diagnostic[] = [],
      instances: RepresentationInstance[] = [];
    const layerResults: LayerLoadResult[] = [],
      resolvedById = new Map<string, ResolvedLayer>();
    for (const section of view.sections)
      for (const track of section.tracks)
        for (const layer of track.layers) {
          const requested = layer.representation;
          const fallback = "fallback" in layer ? layer.fallback?.representation : undefined;
          const rendered = providerMap.has(requested)
            ? requested
            : fallback && providerMap.has(fallback)
              ? fallback
              : undefined;
          const installed = rendered ? providerMap.get(rendered) : undefined;
          if (!rendered || !installed) {
            const code = "seqviewer.representation.rejected";
            diagnostics.push(
              diagnostic(
                code,
                `No installed provider can render '${layer.id}' as '${requested}'${fallback ? ` or '${fallback}'` : ""}.`,
                "/views",
              ),
            );
            layerResults.push({
              layerId: layer.id,
              requested,
              status: "rejected",
              diagnosticCode: code,
            });
            continue;
          }
          let instance: RepresentationInstance;
          try {
            instance = installed.create({
              document: checked.value,
              view,
              layer,
              resolvedRepresentation: rendered,
            });
          } catch (error) {
            const code = "seqviewer.provider.create-failed";
            diagnostics.push(
              diagnostic(
                code,
                `Provider '${installed.id}' failed for '${layer.id}': ${error instanceof Error ? error.message : String(error)}`,
                "/views",
              ),
            );
            layerResults.push({
              layerId: layer.id,
              requested,
              rendered,
              providerId: installed.id,
              status: "rejected",
              diagnosticCode: code,
            });
            continue;
          }
          if (instance.representation !== rendered) {
            const code = "seqviewer.provider.representation-mismatch";
            diagnostics.push(
              diagnostic(
                code,
                `Provider '${installed.id}' returned '${instance.representation}' while resolving '${rendered}'.`,
                "/views",
              ),
            );
            layerResults.push({
              layerId: layer.id,
              requested,
              rendered,
              providerId: installed.id,
              status: "rejected",
              diagnosticCode: code,
            });
            this.disposeAll([instance], diagnostics);
            continue;
          }
          instances.push(instance);
          let degraded = rendered !== requested || instance.rendered === "fallback";
          let code =
            rendered !== requested
              ? "seqviewer.representation.fallback"
              : instance.rendered === "fallback"
                ? "seqviewer.provider.degraded"
                : undefined;
          if (rendered === "links" && this.droppedLinkGeometry(checked.value, view, layer)) {
            degraded = true;
            code = "seqviewer.links.geometry-dropped";
          }
          if (degraded && code)
            diagnostics.push(
              warning(code, `Layer '${layer.id}' rendered with degraded semantics.`),
            );
          resolvedById.set(
            layer.id,
            Object.freeze({
              layer,
              representation: rendered,
              status: degraded ? "degraded" : "exact",
            }),
          );
          layerResults.push({
            layerId: layer.id,
            requested,
            rendered,
            providerId: installed.id,
            status: degraded ? "degraded" : "exact",
            ...(code ? { diagnosticCode: code } : {}),
          });
        }
    if (layerResults.some((item) => item.status === "rejected")) {
      this.disposeAll(instances, diagnostics);
      return {
        status: "failed",
        generation,
        documentId: checked.value.id,
        viewId,
        diagnostics,
        representations: [],
        layers: Object.freeze(layerResults),
      };
    }
    if (signal?.aborted || this.disposed || generation !== this.generation) {
      this.disposeAll(instances, diagnostics);
      return { status: "superseded", generation, diagnostics, representations: [], layers: [] };
    }
    const next = this.buildActive(checked.value, view, resolvedById);
    this.disposeAll(this.instances.splice(0), diagnostics);
    this.instances.push(...instances);
    this.clearNativeHover();
    this.clearNativeSelection();
    this.cancelNavigationDrag();
    this.active = next;
    this.activeHeaderKey = undefined;
    this.zoom = 1;
    this.pan = 0;
    this.root.scrollTop = 0;
    this.syncSpacer();
    this.renderHeaders();
    this.renderNavigation();
    this.draw();
    this.emitViewport();
    return {
      status: "rendered",
      generation,
      documentId: checked.value.id,
      viewId,
      diagnostics: Object.freeze(diagnostics),
      representations: Object.freeze([...instances]),
      layers: Object.freeze(layerResults),
    };
  }

  setHighlight(command: SequenceHighlight): void {
    if (!this.disposed) {
      this.highlights.set(command.owner.id, command);
      this.schedule();
    }
  }
  setSelection(command: SequenceSelection): void {
    if (!this.disposed) {
      this.selections.set(command.owner.id, command);
      this.schedule();
    }
  }
  clearHighlight(owner?: InteractionOwner): void {
    if (owner) this.highlights.delete(owner.id);
    else this.highlights.clear();
    this.schedule();
  }
  clearSelection(owner?: InteractionOwner): void {
    if (owner) this.selections.delete(owner.id);
    else this.selections.clear();
    this.schedule();
  }
  resize = (): void => {
    this.resizeTo(this.options.target.clientWidth, this.options.target.clientHeight);
  };

  private readonly resizeObserved = (entries: ResizeObserverEntry[]): void => {
    const entry = entries.find((item) => item.target === this.options.target) ?? entries[0];
    if (entry) this.resizeTo(entry.contentRect.width, entry.contentRect.height);
    else this.resize();
  };

  private resizeTo(width: number, height: number): void {
    if (this.disposed) return;
    // ResizeObserver reports 0 × 0 while a target is detached or hidden. That
    // is not a viewer size: retain the last real canvas until the host is
    // visible again, and let the first non-zero observation initialize it.
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    const nextWidth = Math.round(width);
    const nextHeight = Math.round(height);
    const nextDpr = Math.max(1, window.devicePixelRatio || 1);
    if (nextWidth === this.width && nextHeight === this.height && nextDpr === this.dpr) return;
    this.width = nextWidth;
    this.height = nextHeight;
    this.dpr = nextDpr;
    this.root.style.height = `${this.height}px`;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.syncSpacer();
    this.renderNavigation();
    this.schedule();
  }

  private syncSpacer(): void {
    // The spacer is scrollable document content, never a measurement source for
    // the host. In particular it must not mirror the viewer height: doing so
    // turns a min-height host plus a 100%-sized child into a resize feedback loop.
    this.spacer.style.height = `${Math.max(
      1,
      (this.active?.totalHeight ?? 0) + (this.active === undefined ? 0 : NAVIGATION_CLEARANCE),
    )}px`;
  }

  hitTest(clientX: number, clientY: number): SeqViewerInteraction | undefined {
    const active = this.active;
    if (!active || this.disposed) return undefined;
    const box = this.canvas.getBoundingClientRect(),
      x = clientX - box.left,
      y = clientY - box.top + this.root.scrollTop;
    if (x < HEADER) return undefined;
    const row = active.rows.find((item) => y >= item.top && y < item.top + item.height);
    if (!row) return undefined;
    for (const layer of [...row.layers].reverse()) {
      const hit = this.hitLayer(active, row, layer, x);
      if (hit)
        return {
          kind: "hover",
          documentId: active.document.id,
          viewId: active.view.id,
          sectionId: row.sectionId,
          trackId: row.track.id,
          layerId: layer.layer.id,
          ...(row.sequenceId ? { sequenceId: row.sequenceId } : {}),
          ...(row.alignmentId ? { alignmentId: row.alignmentId } : {}),
          ...(row.alignmentMemberId ? { alignmentMemberId: row.alignmentMemberId } : {}),
          ...(hit.annotation ? { annotationId: hit.annotation.id } : {}),
          ...(hit.itemId ? { itemId: hit.itemId } : {}),
          ...(hit.endpointRole ? { endpointRole: hit.endpointRole } : {}),
          ...(hit.locusIndex !== undefined ? { locusIndex: hit.locusIndex } : {}),
          loci: hit.loci,
        };
    }
    return undefined;
  }

  dispose(): void {
    if (this.disposed) return;
    this.clearNativeHover();
    this.clearNativeSelection();
    this.cancelNavigationDrag();
    this.disposed = true;
    ++this.generation;
    try {
      this.abort.abort();
    } catch {
      /* cleanup continues */
    }
    try {
      this.observer?.disconnect();
    } catch {
      /* cleanup continues */
    }
    if (this.frame)
      try {
        cancelAnimationFrame(this.frame);
      } catch {
        /* cleanup continues */
      }
    this.frame = 0;
    this.disposeAll(this.instances.splice(0));
    for (const cleanup of this.behaviorCleanup.splice(0))
      try {
        cleanup();
      } catch {
        /* cleanup continues */
      }
    try {
      this.subject.complete();
    } catch {
      /* cleanup continues */
    }
    try {
      this.options.target.replaceChildren();
    } catch {
      /* cleanup continues */
    }
    this.active = undefined;
    this.highlights.clear();
    this.selections.clear();
  }

  private buildActive(
    document: SeqViewSpec,
    view: View,
    resolved: ReadonlyMap<string, ResolvedLayer>,
  ): Active {
    const spaces = new Map<string, CoordinateSpace>();
    for (const item of document.sequences)
      spaces.set(
        item.coordinateSpace,
        coordinateSpace(item.coordinateSpace, "sequence", [...item.residues].length),
      );
    for (const item of document.alignments ?? [])
      spaces.set(
        item.coordinateSpace,
        coordinateSpace(item.coordinateSpace, "alignment", item.length),
      );
    let units = 0;
    const offsets = view.axis.segments.map((segment) => {
      const result = units;
      units += segment.end - segment.start;
      return result;
    });
    const rulerHeight = view.axis.ruler?.visible === false ? 0 : RULER,
      rows: Row[] = [];
    let top = rulerHeight;
    for (const section of view.sections) {
      if (section.initiallyCollapsed) continue;
      for (const track of section.tracks) {
        const layers = track.layers
          .map((item) => resolved.get(item.id))
          .filter((item): item is ResolvedLayer => item !== undefined);
        const alignmentLayers = layers.filter((item) => item.layer.representation === "alignment");
        const firstAlignmentLayer = alignmentLayers[0];
        const alignmentId =
          firstAlignmentLayer?.layer.representation === "alignment"
            ? firstAlignmentLayer.layer.alignment
            : undefined;
        const alignment = alignmentId
          ? document.alignments?.find((item) => item.id === alignmentId)
          : undefined;
        const members = alignment
          ? alignment.members.filter((member) =>
              alignmentLayers.some(
                (item) =>
                  item.layer.representation === "alignment" &&
                  (item.layer.members === undefined || item.layer.members.includes(member.id)),
              ),
            )
          : [undefined];
        for (const member of members) {
          const height = track.height ?? DEFAULT_ROW;
          rows.push(
            Object.freeze({
              sectionId: section.id,
              track,
              layers: Object.freeze(layers),
              top,
              height,
              ...(alignment ? { alignmentId: alignment.id } : {}),
              ...(member ? { alignmentMemberId: member.id, sequenceId: member.sequence } : {}),
              label: `${track.label ?? track.id}${member ? ` · ${member.id}` : ""}`,
            }),
          );
          top += height;
        }
      }
    }
    const lanes = new Map<string, ReadonlyMap<string, number>>();
    for (const row of rows)
      for (const resolvedLayer of row.layers)
        if (resolvedLayer.representation === "blocks") {
          const annotation = layerAnnotation(document, resolvedLayer.layer);
          if (annotation?.kind !== "loci") continue;
          const laneEnds: number[] = [],
            itemLanes = new Map<string, number>();
          const items = annotation.items
            .map((item) => ({
              item,
              loci: item.loci.flatMap((locus) =>
                locus.kind === "interval"
                  ? [{ start: locus.start, end: locus.end }]
                  : locus.kind === "point"
                    ? [{ start: locus.position, end: locus.position + 1 }]
                    : [],
              ),
            }))
            .filter((item) => item.loci.length)
            .sort(
              (a, b) =>
                (a.loci[0]?.start ?? 0) - (b.loci[0]?.start ?? 0) ||
                a.item.id.localeCompare(b.item.id),
            );
          for (const entry of items) {
            const start = Math.min(...entry.loci.map((item) => item.start)),
              end = Math.max(...entry.loci.map((item) => item.end));
            let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
            if (lane < 0) lane = laneEnds.length;
            laneEnds[lane] = end;
            itemLanes.set(entry.item.id, lane);
          }
          lanes.set(resolvedLayer.layer.id, itemLanes);
        }
    return Object.freeze({
      document,
      view,
      rows: Object.freeze(rows),
      spaces,
      offsets: Object.freeze(offsets),
      units,
      rulerHeight,
      totalHeight: top,
      lanes,
    });
  }

  private hitLayer(active: Active, row: Row, resolved: ResolvedLayer, x: number): Hit | undefined {
    const layer = resolved.layer,
      annotation = layerAnnotation(active.document, layer);
    if (
      (resolved.representation === "markers" || resolved.representation === "links") &&
      annotation
    ) {
      const boundaries =
        annotation.kind === "loci"
          ? annotation.items.flatMap((item) =>
              item.loci.flatMap((locus, locusIndex) =>
                locus.kind === "boundary" ? [{ id: item.id, locus, locusIndex }] : [],
              ),
            )
          : annotation.kind === "relationships"
            ? annotation.items.flatMap((item) =>
                item.endpoints.flatMap((endpoint) =>
                  endpoint.loci.flatMap((locus, locusIndex) =>
                    locus.kind === "boundary"
                      ? [{ id: item.id, locus, locusIndex, endpointRole: endpoint.role }]
                      : [],
                  ),
                ),
              )
            : [];
      for (const item of boundaries) {
        const markerX = this.xForBoundary(active, item.locus);
        if (
          markerX !== undefined &&
          Math.abs(markerX - x) <= Math.max(3, Math.min(7, this.cell() / 4))
        ) {
          const space = active.spaces.get(item.locus.space);
          if (space) {
            const relationship =
              annotation.kind === "relationships"
                ? annotation.items.find((relationship) => relationship.id === item.id)
                : undefined;
            const lociItem =
              annotation.kind === "loci"
                ? annotation.items.find((candidate) => candidate.id === item.id)
                : undefined;
            return {
              layer: resolved,
              annotation,
              itemId: item.id,
              ...("endpointRole" in item && typeof item.endpointRole === "string"
                ? { endpointRole: item.endpointRole }
                : {}),
              locusIndex: item.locusIndex,
              loci: relationship
                ? this.relationshipLoci(active, relationship)
                : lociItem
                  ? this.lociItemLoci(active, lociItem)
                  : [boundary(space, item.locus.position)],
            };
          }
        }
      }
    }
    const located = this.segmentAt(x);
    if (!located) return undefined;
    const space = active.spaces.get(located.segment.space);
    if (!space) return undefined;
    if (resolved.representation === "sequence" && layer.representation === "sequence") {
      const sequence = active.document.sequences.find((item) => item.id === layer.sequence);
      return sequence?.coordinateSpace === located.segment.space
        ? { layer: resolved, loci: [point(space, located.position)] }
        : undefined;
    }
    if (resolved.representation === "alignment" && layer.representation === "alignment") {
      const alignment = active.document.alignments?.find((item) => item.id === layer.alignment);
      if (alignment?.coordinateSpace !== located.segment.space) return undefined;
      const loci: CoordinateLocus[] = [point(space, located.position)],
        member = alignment.members.find((item) => item.id === row.alignmentMemberId),
        mapped = member?.positions[located.position],
        sequence = active.document.sequences.find((item) => item.id === member?.sequence);
      if (mapped !== null && mapped !== undefined && sequence)
        loci.push(point(active.spaces.get(sequence.coordinateSpace) ?? space, mapped));
      return { layer: resolved, loci };
    }
    if (!annotation) return undefined;
    if (annotation.kind === "values")
      return annotation.space === located.segment.space
        ? { layer: resolved, annotation, loci: [point(space, located.position)] }
        : undefined;
    if (annotation.kind === "loci")
      for (const item of annotation.items) {
        const locus = item.loci.find((candidate) =>
          locusContains(candidate, located.segment.space, located.position),
        );
        if (locus)
          return {
            layer: resolved,
            annotation,
            itemId: item.id,
            // A pointer finds the item, not a single constituent locus.  Keep
            // the declared order so discontinuous annotations remain semantic.
            loci: this.lociItemLoci(active, item),
          };
      }
    if (annotation.kind === "relationships")
      for (const item of annotation.items)
        for (const endpoint of item.endpoints)
          for (const [locusIndex, locus] of endpoint.loci.entries())
            if (locusContains(locus, located.segment.space, located.position))
              return {
                layer: resolved,
                annotation,
                itemId: item.id,
                endpointRole: endpoint.role,
                locusIndex,
                loci: this.relationshipLoci(active, item),
              };
    return undefined;
  }

  private relationshipLoci(
    active: Active,
    relationship: Extract<Annotation, { kind: "relationships" }>["items"][number],
  ): readonly CoordinateLocus[] {
    return Object.freeze(
      relationship.endpoints.flatMap((endpoint) =>
        endpoint.loci.flatMap((locus) => {
          const space = active.spaces.get(locus.space);
          return space ? [this.convertLocus(space, locus)] : [];
        }),
      ),
    );
  }

  private lociItemLoci(
    active: Active,
    item: Extract<Annotation, { kind: "loci" }>["items"][number],
  ): readonly CoordinateLocus[] {
    return Object.freeze(
      item.loci.flatMap((locus) => {
        const space = active.spaces.get(locus.space);
        return space ? [this.convertLocus(space, locus)] : [];
      }),
    );
  }

  private convertLocus(space: CoordinateSpace, locus: Locus): CoordinateLocus {
    return locus.kind === "point"
      ? point(space, locus.position)
      : locus.kind === "boundary"
        ? boundary(space, locus.position)
        : interval(space, locus.start, locus.end);
  }
  private cell(): number {
    const active = this.active;
    if (!active) return 1;
    const gaps = Math.max(0, active.view.axis.segments.length - 1) * (active.view.axis.gap ?? GAP);
    return Math.max(1, ((this.width - HEADER - gaps) / Math.max(1, active.units)) * this.zoom);
  }
  private x(index: number, position: number): number {
    const active = this.active,
      offset = active?.offsets[index],
      segment = active?.view.axis.segments[index];
    if (!active || offset === undefined || !segment) return -1;
    return (
      HEADER +
      offset * this.cell() +
      index * (active.view.axis.gap ?? GAP) -
      this.pan * this.cell() +
      (position - segment.start) * this.cell()
    );
  }
  private segmentAt(
    x: number,
  ): { readonly segment: Segment; readonly position: number } | undefined {
    const active = this.active;
    if (!active) return undefined;
    let left = HEADER - this.pan * this.cell();
    for (const segment of active.view.axis.segments) {
      const width = (segment.end - segment.start) * this.cell();
      if (x >= left && x < left + width)
        return { segment, position: segment.start + Math.floor((x - left) / this.cell()) };
      left += width + (active.view.axis.gap ?? GAP);
    }
    return undefined;
  }
  private minimumVisibleColumns(active: Active): number {
    return Math.min(MIN_VISIBLE_COLUMNS, active.units);
  }
  private visibleColumnCount(active: Active): number {
    return Math.min(
      active.units,
      Math.max(this.minimumVisibleColumns(active), Math.round(active.units / this.zoom)),
    );
  }
  private setViewport(start: number, end: number): boolean {
    const active = this.active;
    if (!active) return false;
    const visible = Math.min(
      active.units,
      Math.max(this.minimumVisibleColumns(active), Math.round(end - start)),
    );
    const nextStart = Math.min(active.units - visible, Math.max(0, Math.round(start)));
    const nextZoom = active.units / visible;
    if (this.pan === nextStart && this.zoom === nextZoom) return false;
    this.pan = nextStart;
    this.zoom = nextZoom;
    this.renderNavigation();
    this.schedule();
    return true;
  }
  private panViewport(delta: number): boolean {
    const active = this.active;
    if (!active) return false;
    const width = this.visibleColumnCount(active);
    return this.setViewport(this.pan + delta, this.pan + delta + width);
  }
  private zoomViewport(direction: "in" | "out", center?: number): boolean {
    const active = this.active;
    if (!active) return false;
    const current = this.visibleColumnCount(active);
    const width =
      direction === "in"
        ? Math.max(this.minimumVisibleColumns(active), Math.floor(current / 1.25))
        : Math.min(active.units, Math.ceil(current * 1.25));
    const focal = center ?? this.pan + current / 2;
    return this.setViewport(focal - width / 2, focal + width / 2);
  }
  private resetViewport(): boolean {
    const active = this.active;
    return active ? this.setViewport(0, active.units) : false;
  }
  private viewportDescriptor(): SeqViewerViewport | undefined {
    const active = this.active;
    if (!active) return undefined;
    const offsetStart = this.pan,
      offsetEnd = offsetStart + this.visibleColumnCount(active);
    const segments = active.view.axis.segments.flatMap((segment, index) => {
      const segmentOffset = active.offsets[index];
      if (segmentOffset === undefined) return [];
      const start = Math.max(offsetStart, segmentOffset),
        end = Math.min(offsetEnd, segmentOffset + segment.end - segment.start);
      return start < end
        ? [
            Object.freeze({
              segmentId: segment.id,
              spaceId: segment.space,
              start: segment.start + start - segmentOffset,
              end: segment.start + end - segmentOffset,
            }),
          ]
        : [];
    });
    return Object.freeze({
      offsetStart,
      offsetEnd,
      totalColumns: active.units,
      segments: Object.freeze(segments),
    });
  }
  private emitViewport(nativeEvent?: Event): void {
    const active = this.active,
      viewport = this.viewportDescriptor();
    if (!active || !viewport) return;
    this.subject.next({
      kind: "viewport-change",
      phase: "set",
      documentId: active.document.id,
      viewId: active.view.id,
      viewport,
      loci: NONE,
      ...(nativeEvent ? { nativeEvent } : {}),
    });
  }
  private navigationAxisWidth(): number {
    // CSS grid owns the controls reserve.  Never derive this from a second
    // absolute-width formula: it is wrong as soon as controls are measured.
    return Math.max(1, this.navigationAxis.clientWidth);
  }
  private navigationCell(active: Active, width = this.navigationAxisWidth()): number {
    const gaps = Math.max(0, active.view.axis.segments.length - 1) * NAVIGATION_GAP;
    return Math.max(1, (width - gaps) / Math.max(1, active.units));
  }
  private navigationX(
    active: Active,
    offset: number,
    edge: "start" | "end",
    width = this.navigationAxisWidth(),
  ): number {
    const bounded = Math.max(0, Math.min(active.units, offset));
    for (const [index, segment] of active.view.axis.segments.entries()) {
      const start = active.offsets[index];
      if (start === undefined) continue;
      const end = start + segment.end - segment.start;
      if (bounded < end || (edge === "end" && bounded <= end))
        return index * NAVIGATION_GAP + bounded * this.navigationCell(active, width);
    }
    return width;
  }
  private renderNavigation(): void {
    const active = this.active;
    if (!active) {
      this.navigation.style.display = "none";
      return;
    }
    this.navigation.style.display = "grid";
    const viewport = this.viewportDescriptor();
    if (!viewport) return;
    const width = this.navigationAxisWidth();
    this.navigationAxis.replaceChildren();
    for (const [index, segment] of active.view.axis.segments.entries()) {
      const offset = active.offsets[index];
      if (offset === undefined) continue;
      const element = document.createElement("span");
      element.textContent = segment.id;
      element.dataset.seqViewerNavigationSegment = segment.id;
      const left = this.navigationX(active, offset, "start", width),
        right = this.navigationX(active, offset + segment.end - segment.start, "end", width);
      Object.assign(element.style, {
        position: "absolute",
        left: `${left}px`,
        width: `${Math.max(1, right - left)}px`,
        top: "0",
        bottom: "0",
        overflow: "hidden",
        pointerEvents: "none",
        background: index % 2 === 0 ? "#cbd5e1" : "#bfdbfe",
        color: "#334155",
        font: "9px/18px ui-monospace, monospace",
        textAlign: "center",
        whiteSpace: "nowrap",
      });
      this.navigationAxis.append(element);
    }
    const rawLeft = this.navigationX(active, viewport.offsetStart, "start", width),
      rawRight = this.navigationX(active, viewport.offsetEnd, "end", width),
      windowWidth = Math.min(width, Math.max(8, rawRight - rawLeft)),
      left = Math.max(0, Math.min(width - windowWidth, rawLeft));
    this.navigationWindow.style.left = `${left}px`;
    this.navigationWindow.style.width = `${windowWidth}px`;
    this.navigationWindow.setAttribute("aria-valuemin", "0");
    this.navigationWindow.setAttribute("aria-valuemax", String(active.units));
    this.navigationWindow.setAttribute("aria-valuenow", String(viewport.offsetStart));
    this.navigationWindow.setAttribute(
      "aria-valuetext",
      `Columns ${viewport.offsetStart + 1} to ${viewport.offsetEnd} of ${active.units}`,
    );
    for (const [handle, value] of [
      [this.navigationLeftHandle, viewport.offsetStart],
      [this.navigationRightHandle, viewport.offsetEnd],
    ] as const) {
      handle.setAttribute("aria-valuemin", "0");
      handle.setAttribute("aria-valuemax", String(active.units));
      handle.setAttribute("aria-valuenow", String(value));
    }
    this.navigationAxis.append(this.navigationWindow);
  }
  private offsetAtClientX(clientX: number): number | undefined {
    const active = this.active,
      box = this.canvas.getBoundingClientRect();
    if (!active) return undefined;
    const located = this.segmentAt(clientX - box.left);
    if (!located) return undefined;
    const index = active.view.axis.segments.indexOf(located.segment),
      offset = active.offsets[index];
    return offset === undefined
      ? undefined
      : offset + located.position - located.segment.start + 0.5;
  }
  private xForBoundary(
    active: Active,
    locus: Extract<Locus, { kind: "boundary" }>,
  ): number | undefined {
    const index = active.view.axis.segments.findIndex(
      (segment) =>
        segment.space === locus.space &&
        locus.position >= segment.start &&
        locus.position <= segment.end,
    );
    return index < 0 ? undefined : this.x(index, locus.position);
  }
  private anchors(active: Active, locus: Locus): readonly number[] {
    const values: number[] = [];
    active.view.axis.segments.forEach((segment, index) => {
      if (segment.space !== locus.space) return;
      if (locus.kind === "point" && locus.position >= segment.start && locus.position < segment.end)
        values.push(this.x(index, locus.position) + this.cell() / 2);
      else if (
        locus.kind === "boundary" &&
        locus.position >= segment.start &&
        locus.position <= segment.end
      )
        values.push(this.x(index, locus.position));
      else if (locus.kind === "interval") {
        const start = Math.max(locus.start, segment.start),
          end = Math.min(locus.end, segment.end);
        if (start < end) values.push((this.x(index, start) + this.x(index, end)) / 2);
      }
    });
    return values;
  }
  private droppedLinkGeometry(document: SeqViewSpec, view: View, layer: Layer): boolean {
    if (!("annotation" in layer)) return false;
    const annotation = annotationById(document, layer.annotation);
    if (annotation?.kind !== "relationships") return false;
    return annotation.items.some((item) =>
      item.endpoints.some((endpoint) =>
        endpoint.loci.some(
          (locus) =>
            !view.axis.segments.some(
              (segment) =>
                segment.space === locus.space &&
                (locus.kind === "point"
                  ? locus.position >= segment.start && locus.position < segment.end
                  : locus.kind === "boundary"
                    ? locus.position >= segment.start && locus.position <= segment.end
                    : locus.start < segment.end && locus.end > segment.start),
            ),
        ),
      ),
    );
  }

  private draw(): void {
    const context = this.canvas.getContext("2d"),
      active = this.active,
      scroll = this.root.scrollTop;
    if (!context) return;
    this.canvas.style.transform = `translateY(${scroll}px)`;
    this.headers.style.transform = `translateY(${scroll}px)`;
    this.navigation.style.transform = `translateY(${scroll}px)`;
    context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    context.clearRect(0, 0, this.width, this.height);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, this.width, this.height);
    if (!active) return;
    active.rows.forEach((row, index) => {
      const button = this.headers.children.item(index) as HTMLElement | null;
      if (button) button.style.top = `${row.top - scroll}px`;
    });
    this.drawRuler(context, active);
    for (const row of active.rows)
      if (row.top + row.height >= scroll && row.top <= scroll + this.height)
        this.drawRow(context, active, row, row.top - scroll);
    this.drawApplied(context, active);
  }
  private drawRuler(context: CanvasRenderingContext2D, active: Active): void {
    if (!active.rulerHeight || this.root.scrollTop >= active.rulerHeight) return;
    const y = -this.root.scrollTop,
      oneBased = active.view.axis.ruler?.numbering !== "zero-based";
    context.fillStyle = "#eef2ff";
    context.fillRect(HEADER, y, this.width - HEADER, RULER - 1);
    context.fillStyle = "#475569";
    for (const [index, segment] of active.view.axis.segments.entries())
      for (
        let position = segment.start, step = Math.max(1, Math.ceil(32 / this.cell()));
        position < segment.end;
        position += step
      ) {
        const x = this.x(index, position);
        if (x >= HEADER && x <= this.width) {
          context.fillRect(x, y + 15, 1, 5);
          context.fillText(String(position + (oneBased ? 1 : 0)), x + 2, y + 11);
        }
      }
  }
  private drawRow(context: CanvasRenderingContext2D, active: Active, row: Row, y: number): void {
    context.fillStyle = "#f8fafc";
    context.fillRect(HEADER, y, this.width - HEADER, row.height - 1);
    for (const layer of row.layers) this.drawLayer(context, active, row, layer, y);
    context.globalAlpha = 1;
    context.strokeStyle = "#dbeafe";
    context.beginPath();
    context.moveTo(HEADER, y + row.height - 0.5);
    context.lineTo(this.width, y + row.height - 0.5);
    context.stroke();
  }
  private drawLayer(
    context: CanvasRenderingContext2D,
    active: Active,
    row: Row,
    resolved: ResolvedLayer,
    y: number,
  ): void {
    const layer = resolved.layer,
      annotation = layerAnnotation(active.document, layer);
    context.globalAlpha = layer.opacity ?? 1;
    if (resolved.representation === "links" && annotation?.kind === "relationships") {
      this.drawLinks(context, active, row, resolved, annotation, y);
      return;
    }
    for (const [index, segment] of active.view.axis.segments.entries()) {
      const origin = this.x(index, segment.start),
        first = Math.max(
          segment.start,
          segment.start + Math.floor((HEADER - origin) / this.cell()),
        ),
        last = Math.min(
          segment.end,
          segment.start + Math.ceil((this.width - origin) / this.cell()),
        );
      for (let position = first; position < last; position += 1)
        this.drawCell(
          context,
          active,
          row,
          resolved,
          annotation,
          segment,
          position,
          this.x(index, position),
          y,
        );
    }
    if (resolved.representation === "markers" && annotation?.kind === "loci")
      for (const item of annotation.items)
        for (const locus of item.loci)
          if (locus.kind === "boundary") {
            const x = this.xForBoundary(active, locus);
            if (x !== undefined) {
              context.fillStyle = layerColor(resolved, item.value ?? null, item.id);
              this.drawMarker(
                context,
                layer.representation === "markers" ? (layer.shape ?? "circle") : "circle",
                x,
                y + row.height / 2,
                Math.min(7, row.height / 3),
              );
            }
          }
    if (resolved.representation === "markers" && annotation?.kind === "relationships")
      for (const item of annotation.items)
        for (const endpoint of item.endpoints)
          for (const locus of endpoint.loci)
            if (locus.kind === "boundary") {
              const x = this.xForBoundary(active, locus);
              if (x !== undefined) {
                context.fillStyle = layerColor(resolved, item.value ?? null, item.id);
                this.drawMarker(
                  context,
                  "circle",
                  x,
                  y + row.height / 2,
                  Math.min(7, row.height / 3),
                );
              }
            }
  }
  private drawCell(
    context: CanvasRenderingContext2D,
    active: Active,
    row: Row,
    resolved: ResolvedLayer,
    annotation: Annotation | undefined,
    segment: Segment,
    position: number,
    x: number,
    y: number,
  ): void {
    const layer = resolved.layer,
      rep = resolved.representation,
      cell = this.cell();
    if (rep === "sequence" && layer.representation === "sequence") {
      const sequence = active.document.sequences.find((item) => item.id === layer.sequence),
        residue =
          sequence?.coordinateSpace === segment.space
            ? [...sequence.residues][position]
            : undefined;
      if (residue && layer.showLetters !== false && cell >= 7) {
        context.fillStyle = layerColor(resolved, null);
        context.fillText(
          residue,
          x + Math.max(1, (cell - context.measureText(residue).width) / 2),
          y + Math.min(row.height - 5, 17),
        );
      }
      return;
    }
    if (rep === "alignment" && layer.representation === "alignment") {
      const alignment = active.document.alignments?.find((item) => item.id === layer.alignment);
      if (alignment?.coordinateSpace !== segment.space) return;
      const member = alignment.members.find((item) => item.id === row.alignmentMemberId),
        sequence = active.document.sequences.find((item) => item.id === member?.sequence),
        mapped = member?.positions[position],
        residue =
          mapped === null || mapped === undefined ? "-" : [...(sequence?.residues ?? "")][mapped];
      if (layer.showLetters !== false && cell >= 7) {
        context.fillStyle =
          mapped === null || mapped === undefined ? "#94a3b8" : layerColor(resolved, null);
        context.fillText(residue ?? "", x + 2, y + Math.min(row.height - 5, 17));
      }
      return;
    }
    if (!annotation) return;
    if (annotation.kind === "values") {
      if (annotation.space !== segment.space) return;
      const value =
        annotation.values.encoding === "dense"
          ? annotation.values.data[position]
          : annotation.values.data.find((item) => item.position === position)?.value;
      if (value === undefined) return;
      if (rep === "bars" && typeof value === "number")
        this.drawBar(context, row, resolved, annotation, value, x, y);
      else {
        context.fillStyle = layerColor(resolved, value ?? null);
        context.fillRect(x, y + 2, cell, row.height - 4);
      }
      return;
    }
    if (annotation.kind === "loci") {
      const matches = annotation.items.filter((item) =>
        item.loci.some((locus) => locusContains(locus, segment.space, position)),
      );
      for (const item of matches) {
        context.fillStyle = layerColor(resolved, item.value ?? null, item.id);
        if (rep === "markers")
          this.drawMarker(
            context,
            layer.representation === "markers" ? (layer.shape ?? "circle") : "circle",
            x + cell / 2,
            y + row.height / 2,
            Math.min(7, Math.max(4, cell / 2)),
          );
        else if (rep === "blocks") {
          const stacked = layer.representation === "blocks" && layer.laneMode === "stack",
            lane = stacked ? (active.lanes.get(layer.id)?.get(item.id) ?? 0) : 0,
            laneCount = stacked
              ? Math.max(
                  1,
                  ...[...(active.lanes.get(layer.id)?.values() ?? [])].map((value) => value + 1),
                )
              : 1,
            laneHeight = row.height / laneCount;
          context.fillRect(x, y + lane * laneHeight + 2, cell, Math.max(2, laneHeight - 4));
        }
      }
      return;
    }
    if (rep === "markers" || rep === "blocks")
      for (const item of annotation.items)
        if (
          item.endpoints.some((endpoint) =>
            endpoint.loci.some((locus) => locusContains(locus, segment.space, position)),
          )
        ) {
          context.fillStyle = layerColor(resolved, item.value ?? null, item.id);
          if (rep === "markers")
            this.drawMarker(
              context,
              "circle",
              x + cell / 2,
              y + row.height / 2,
              Math.min(7, cell / 2),
            );
          else context.fillRect(x, y + 3, cell, row.height - 6);
        }
  }
  private drawBar(
    context: CanvasRenderingContext2D,
    row: Row,
    resolved: ResolvedLayer,
    annotation: Annotation,
    value: number,
    x: number,
    y: number,
  ): void {
    const layer = resolved.layer,
      values = numericValues(annotation),
      fallbackDomain: readonly [number, number] = values.length
        ? [Math.min(...values), Math.max(...values)]
        : [0, 1],
      configured =
        layer.representation === "bars" && resolved.representation === "bars"
          ? layer.scale
          : undefined,
      domain = configured?.domain ?? fallbackDomain,
      start = domain[0] ?? 0,
      rawEnd = domain[1] ?? 1,
      end = rawEnd === start ? start + 1 : rawEnd,
      clamp = configured?.clamp !== false,
      norm = (input: number) => {
        const raw = (input - start) / (end - start);
        return clamp ? Math.max(0, Math.min(1, raw)) : raw;
      },
      a = norm(value),
      b = norm(configured?.baseline ?? start),
      top = Math.min(a, b),
      bottom = Math.max(a, b);
    context.save();
    context.beginPath();
    context.rect(x, y, this.cell(), row.height - 1);
    context.clip();
    context.fillStyle = layerColor(resolved, value);
    context.fillRect(
      x,
      y + row.height * (1 - bottom),
      this.cell(),
      Math.max(1, row.height * (bottom - top)),
    );
    context.restore();
  }
  private drawMarker(
    context: CanvasRenderingContext2D,
    shape: "circle" | "diamond" | "line",
    x: number,
    y: number,
    radius: number,
  ): void {
    context.beginPath();
    if (shape === "line") {
      context.fillRect(x - 1, y - radius, 2, radius * 2);
      return;
    }
    if (shape === "diamond") {
      context.moveTo(x, y - radius);
      context.lineTo(x + radius, y);
      context.lineTo(x, y + radius);
      context.lineTo(x - radius, y);
      context.closePath();
    } else context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  private drawLinks(
    context: CanvasRenderingContext2D,
    active: Active,
    row: Row,
    resolved: ResolvedLayer,
    annotation: Extract<Annotation, { kind: "relationships" }>,
    y: number,
  ): void {
    context.save();
    context.globalAlpha = resolved.layer.opacity ?? 1;
    context.strokeStyle = layerColor(resolved, null);
    context.lineWidth = 2;
    for (const item of annotation.items) {
      const endpoints = item.endpoints.map((endpoint) =>
        endpoint.loci.flatMap((locus) => this.anchors(active, locus)),
      );
      for (let index = 1; index < endpoints.length; index += 1)
        for (const first of endpoints[index - 1] ?? [])
          for (const second of endpoints[index] ?? []) {
            context.beginPath();
            context.moveTo(first, y + row.height - 4);
            context.bezierCurveTo(first, y + 2, second, y + 2, second, y + row.height - 4);
            context.stroke();
          }
    }
    context.restore();
  }
  private drawApplied(context: CanvasRenderingContext2D, active: Active): void {
    for (const command of this.highlights.values())
      this.drawCommand(context, active, command, "rgb(250 204 21 / 35%)");
    for (const command of this.selections.values())
      this.drawCommand(context, active, command, "rgb(59 130 246 / 25%)");
    if (this.nativeHover)
      this.drawLoci(context, active, this.nativeHover.loci, "rgb(250 204 21 / 55%)");
    if (this.nativeSelection)
      this.drawLoci(context, active, this.nativeSelection.loci, "rgb(37 99 235 / 45%)");
  }
  private drawCommand(
    context: CanvasRenderingContext2D,
    active: Active,
    command: SequenceHighlight | SequenceSelection,
    color: string,
  ): void {
    this.drawLoci(context, active, command.loci, color, command.trackId);
  }
  private drawLoci(
    context: CanvasRenderingContext2D,
    active: Active,
    loci: readonly CoordinateLocus[],
    color: string,
    trackId?: string,
  ): void {
    context.fillStyle = color;
    for (const row of active.rows) {
      if (trackId && trackId !== row.track.id) continue;
      const y = row.top - this.root.scrollTop;
      for (const locus of loci)
        active.view.axis.segments.forEach((segment, index) => {
          if (segment.space !== locus.space.id) return;
          if (
            locus.kind === "point" &&
            locus.position.kind === "index" &&
            locus.position.value >= segment.start &&
            locus.position.value < segment.end
          )
            context.fillRect(this.x(index, locus.position.value), y, this.cell(), row.height);
          else if (locus.kind === "interval") {
            const start = Math.max(locus.start, segment.start),
              end = Math.min(locus.end, segment.end);
            if (start < end)
              context.fillRect(
                this.x(index, start),
                y,
                this.x(index, end) - this.x(index, start),
                row.height,
              );
          } else if (
            locus.kind === "boundary" &&
            locus.position >= segment.start &&
            locus.position <= segment.end
          )
            context.fillRect(this.x(index, locus.position) - 1, y, 2, row.height);
        });
    }
  }

  private renderHeaders(): void {
    this.headers.replaceChildren();
    const active = this.active;
    if (!active) return;
    for (const row of active.rows) {
      const trackPresentation = this.options.presentation?.tracks?.find(
        (item) => item.trackId === row.track.id,
      );
      const configuredMemberActions = this.options.presentation?.alignmentMemberActions;
      const memberPresentation =
        row.alignmentId === undefined || row.alignmentMemberId === undefined
          ? undefined
          : configuredMemberActions?.find(
              (item) =>
                item.alignmentId === row.alignmentId && item.memberId === row.alignmentMemberId,
            );
      // A configured member-action list is an availability declaration.  Keep
      // the same affordance for unlisted members, but make the lack of a
      // structure honest and non-interactive rather than silently activating a
      // generic track action.
      const memberAvailabilityKnown =
        row.alignmentId !== undefined &&
        row.alignmentMemberId !== undefined &&
        configuredMemberActions !== undefined;
      const action =
        row.alignmentMemberId === undefined || configuredMemberActions === undefined
          ? (trackPresentation?.action ?? this.options.presentation?.defaultTrackAction)
          : memberPresentation;
      const actionVisible = action !== undefined || memberAvailabilityKnown;
      const header = document.createElement("div");
      const headerKey = this.headerKey(row);
      header.dataset.seqViewerTrackHeader = headerKey;
      header.dataset.seqViewerTrackActive = String(this.activeHeaderKey === headerKey);
      Object.assign(header.style, {
        position: "absolute",
        top: `${row.top}px`,
        left: "0",
        width: "100%",
        height: `${row.height - 1}px`,
        display: "grid",
        gridTemplateColumns: actionVisible ? "minmax(0, 1fr) 20px" : "minmax(0, 1fr)",
        gap: actionVisible ? "2px" : "0",
        boxSizing: "border-box",
        borderBottom: "1px solid #dbeafe",
        borderLeft: "3px solid transparent",
        background: "#f8fafc",
        pointerEvents: "auto",
      });
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = row.label;
      button.title = row.label;
      button.dataset.seqViewerTrack = row.track.id;
      button.dataset.seqstarTrackActivate = row.track.id;
      button.setAttribute("aria-label", `Activate track ${row.label}`);
      button.setAttribute("aria-pressed", String(this.activeHeaderKey === headerKey));
      Object.assign(button.style, {
        width: "100%",
        height: `${row.height - 1}px`,
        border: "0",
        minWidth: "0",
        background: "transparent",
        color: "#102a43",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        textAlign: "left",
        padding: "0 6px",
        cursor: "pointer",
        font: "600 12px/1.25 system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        pointerEvents: "auto",
      });
      button.addEventListener("click", (event) => this.activateHeader(active, row, event), {
        signal: this.abort.signal,
      });
      header.append(button);
      if (actionVisible) {
        const actionButton = document.createElement("button");
        actionButton.type = "button";
        actionButton.dataset.seqViewerTrackAction = row.track.id;
        if (row.alignmentId !== undefined)
          actionButton.dataset.seqViewerAlignment = row.alignmentId;
        if (row.alignmentMemberId !== undefined)
          actionButton.dataset.seqViewerAlignmentMember = row.alignmentMemberId;
        if (action !== undefined)
          actionButton.dataset.seqViewerTrackActionKind =
            "icon" in action ? action.kind : (action.kind ?? "structure");
        if (action === undefined) actionButton.dataset.seqViewerTrackActionUnavailable = "true";
        actionButton.append(
          createLucideElement(
            action !== undefined &&
              ("icon" in action ? action.icon === "box" : action.kind !== "layers")
              ? Box
              : Layers,
            {
              width: 13,
              height: 13,
              "aria-hidden": "true",
              focusable: "false",
            },
          ),
        );
        const availableLabel =
          action === undefined
            ? `Structure unavailable for ${row.label}`
            : "accessibleName" in action
              ? action.accessibleName
              : action.label;
        actionButton.setAttribute("aria-label", availableLabel);
        actionButton.title =
          action !== undefined && "tooltip" in action ? action.tooltip : availableLabel;
        actionButton.setAttribute("aria-pressed", String(this.activeHeaderKey === headerKey));
        if (action === undefined) actionButton.disabled = true;
        Object.assign(actionButton.style, {
          width: "20px",
          height: "20px",
          padding: "0",
          alignSelf: "center",
          border: "1px solid #94a3b8",
          borderRadius: "0",
          background: "#fff",
          color: "#102a43",
          display: "grid",
          placeItems: "center",
        });
        actionButton.addEventListener(
          "click",
          (event) => {
            event.stopPropagation();
            this.activateHeader(active, row, event);
          },
          { signal: this.abort.signal },
        );
        header.append(actionButton);
      }
      this.headers.append(header);
      this.paintHeader(header, this.activeHeaderKey === headerKey);
    }
  }
  private headerKey(row: Row): string {
    return [row.sectionId, row.track.id, row.alignmentId ?? "", row.alignmentMemberId ?? ""]
      .map(encodeURIComponent)
      .join(":");
  }
  private paintHeader(header: HTMLElement, active: boolean): void {
    header.dataset.seqViewerTrackActive = String(active);
    header.style.background = active ? "#dbeafe" : "#f8fafc";
    header.style.borderLeftColor = active ? "#2563eb" : "transparent";
    header.style.boxShadow = active ? "inset 0 0 0 1px rgb(37 99 235 / 28%)" : "none";
    for (const button of header.querySelectorAll<HTMLButtonElement>("button")) {
      button.setAttribute("aria-pressed", String(active && !button.disabled));
      button.style.color = active ? "#1d4ed8" : "#102a43";
      if (button.dataset.seqViewerTrackAction !== undefined)
        button.style.background = active ? "#eff6ff" : "#fff";
    }
  }
  private setActiveHeader(row: Row): void {
    this.activeHeaderKey = this.headerKey(row);
    for (const header of this.headers.querySelectorAll<HTMLElement>(
      "[data-seq-viewer-track-header]",
    ))
      this.paintHeader(header, header.dataset.seqViewerTrackHeader === this.activeHeaderKey);
  }
  private activateHeader(active: Active, row: Row, event: Event): void {
    this.setActiveHeader(row);
    let alignmentLayerId: string | undefined;
    if (row.alignmentId !== undefined && row.alignmentMemberId !== undefined)
      for (const { layer } of row.layers)
        if (
          layer.representation === "alignment" &&
          layer.alignment === row.alignmentId &&
          (layer.members === undefined || layer.members.includes(row.alignmentMemberId))
        )
          // Match Nightingale's stable layer-order resolution when a track
          // deliberately contains multiple layers for the same alignment.
          alignmentLayerId = layer.id;
    this.subject.next({
      kind: "track-activate",
      documentId: active.document.id,
      viewId: active.view.id,
      sectionId: row.sectionId,
      trackId: row.track.id,
      ...(alignmentLayerId === undefined ? {} : { layerId: alignmentLayerId }),
      ...(row.sequenceId === undefined ? {} : { sequenceId: row.sequenceId }),
      ...(row.alignmentId === undefined ? {} : { alignmentId: row.alignmentId }),
      ...(row.alignmentMemberId === undefined ? {} : { alignmentMemberId: row.alignmentMemberId }),
      loci: NONE,
      nativeEvent: event,
    });
  }
  private readonly hover = (event: PointerEvent): void => {
    const hit = this.hitTest(event.clientX, event.clientY);
    if (hit) this.setNativeHover(hit, event);
    else this.clearNativeHover(event);
  };
  private readonly leave = (event: PointerEvent): void => {
    this.clearNativeHover(event);
  };
  private readonly scroll = (event: Event): void => {
    this.clearNativeHover(event);
    this.schedule();
  };
  private setNativeHover(hit: SeqViewerInteraction, event: PointerEvent): void {
    const next = { ...hit, kind: "hover" as const, phase: "set" as const };
    if (this.sameNativeTarget(this.nativeHover, next)) return;
    this.clearNativeHover(event);
    this.nativeHover = next;
    this.draw();
    this.subject.next({ ...next, nativeEvent: event });
  }
  private clearNativeHover(event?: Event): void {
    if (!this.nativeHover) return;
    const previous = this.nativeHover;
    this.nativeHover = undefined;
    this.draw();
    this.subject.next({
      ...previous,
      phase: "clear",
      ...(event ? { nativeEvent: event } : {}),
    });
  }
  private readonly select = (event: MouseEvent): void => {
    const hit = this.hitTest(event.clientX, event.clientY);
    if (hit) this.setNativeSelection(hit, event);
    else this.clearNativeSelection(event);
  };
  private setNativeSelection(hit: SeqViewerInteraction, event: MouseEvent): void {
    const next = { ...hit, kind: "select" as const, phase: "set" as const };
    if (this.sameNativeTarget(this.nativeSelection, next)) {
      this.clearNativeSelection(event);
      return;
    }
    this.clearNativeSelection(event);
    this.nativeSelection = next;
    this.draw();
    this.subject.next({ ...next, nativeEvent: event });
  }
  private clearNativeSelection(event?: Event): void {
    if (!this.nativeSelection) return;
    const previous = this.nativeSelection;
    this.nativeSelection = undefined;
    this.draw();
    this.subject.next({
      ...previous,
      phase: "clear",
      ...(event ? { nativeEvent: event } : {}),
    });
  }
  private sameNativeTarget(
    current: SeqViewerInteraction | undefined,
    next: SeqViewerInteraction,
  ): boolean {
    if (!current) return false;
    return (
      current.kind === next.kind &&
      current.documentId === next.documentId &&
      current.viewId === next.viewId &&
      current.sectionId === next.sectionId &&
      current.trackId === next.trackId &&
      current.layerId === next.layerId &&
      current.sequenceId === next.sequenceId &&
      current.alignmentId === next.alignmentId &&
      current.alignmentMemberId === next.alignmentMemberId &&
      current.annotationId === next.annotationId &&
      current.itemId === next.itemId &&
      current.endpointRole === next.endpointRole &&
      current.locusIndex === next.locusIndex &&
      JSON.stringify(current.loci) === JSON.stringify(next.loci)
    );
  }
  private readonly navigationPointerDown = (event: PointerEvent): void => {
    const active = this.active;
    if (!active || !(event.target instanceof Element)) return;
    const handle = event.target.closest<HTMLElement>("[data-seq-viewer-navigation-handle]");
    const window = event.target.closest<HTMLElement>("[data-seq-viewer-navigation=window]");
    const mode =
      handle?.dataset.seqViewerNavigationHandle === "left"
        ? "left"
        : handle?.dataset.seqViewerNavigationHandle === "right"
          ? "right"
          : window
            ? "pan"
            : undefined;
    const viewport = this.viewportDescriptor();
    if (!mode || !viewport) return;
    event.preventDefault();
    this.navigationDrag = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      offsetStart: viewport.offsetStart,
      offsetEnd: viewport.offsetEnd,
      changed: false,
    };
    this.navigationAxis.setPointerCapture(event.pointerId);
  };
  private readonly navigationPointerMove = (event: PointerEvent): void => {
    const active = this.active,
      drag = this.navigationDrag;
    if (!active || !drag || drag.pointerId !== event.pointerId) return;
    const delta = Math.round((event.clientX - drag.startX) / this.navigationCell(active));
    const changed =
      drag.mode === "pan"
        ? this.setViewport(drag.offsetStart + delta, drag.offsetEnd + delta)
        : drag.mode === "left"
          ? this.setViewport(drag.offsetStart + delta, drag.offsetEnd)
          : this.setViewport(drag.offsetStart, drag.offsetEnd + delta);
    drag.changed ||= changed;
  };
  private readonly navigationPointerUp = (event: PointerEvent): void => {
    const drag = this.navigationDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this.navigationDrag = undefined;
    try {
      this.navigationAxis.releasePointerCapture(event.pointerId);
    } catch {
      /* pointer capture may already be released */
    }
    if (drag.changed) this.emitViewport(event);
  };
  private cancelNavigationDrag(): void {
    const drag = this.navigationDrag;
    this.navigationDrag = undefined;
    if (!drag) return;
    try {
      this.navigationAxis.releasePointerCapture(drag.pointerId);
    } catch {
      /* replacement may already have released pointer capture */
    }
  }
  private readonly navigationControl = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    const control = event.target.closest<HTMLElement>("[data-seq-viewer-navigation-control]")
      ?.dataset.seqViewerNavigationControl;
    const changed =
      control === "pan-left"
        ? this.panViewport(-1)
        : control === "pan-right"
          ? this.panViewport(1)
          : control === "zoom-out"
            ? this.zoomViewport("out")
            : control === "zoom-in"
              ? this.zoomViewport("in")
              : control === "reset"
                ? this.resetViewport()
                : false;
    if (changed) this.emitViewport(event);
  };
  private readonly navigationKeydown = (event: KeyboardEvent): void => {
    const step = event.shiftKey ? 4 : 1;
    const changed =
      event.key === "ArrowLeft"
        ? this.panViewport(-step)
        : event.key === "ArrowRight"
          ? this.panViewport(step)
          : event.key === "ArrowUp" || event.key === "+" || event.key === "="
            ? this.zoomViewport("in")
            : event.key === "ArrowDown" || event.key === "-"
              ? this.zoomViewport("out")
              : event.key === "Home" || event.key.toLowerCase() === "r"
                ? this.resetViewport()
                : event.key === "End"
                  ? this.panViewport(Number.MAX_SAFE_INTEGER)
                  : false;
    if (!changed) return;
    event.preventDefault();
    this.emitViewport(event);
  };
  private readonly wheel = (event: WheelEvent): void => {
    if (!this.active || (!event.ctrlKey && !event.metaKey && !event.shiftKey && event.deltaX === 0))
      return;
    event.preventDefault();
    const zoom = event.ctrlKey || event.metaKey;
    const delta = event.deltaX || event.deltaY;
    const changed = zoom
      ? this.zoomViewport(delta < 0 ? "in" : "out", this.offsetAtClientX(event.clientX))
      : this.panViewport(Math.sign(delta) * Math.max(1, Math.round(Math.abs(delta) / 80)));
    if (changed) this.emitViewport(event);
  };
  private readonly schedule = (): void => {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  };
  private disposeAll(
    instances: readonly RepresentationInstance[],
    diagnostics?: Diagnostic[],
  ): void {
    for (const instance of instances)
      try {
        instance.dispose?.();
      } catch (error) {
        diagnostics?.push(
          warning(
            "seqviewer.provider.dispose-failed",
            `Provider disposal failed: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      }
  }
}

export const createSeqViewer = (options: CreateSeqViewerOptions): SeqViewer =>
  new CanvasSeqViewer(options);
export interface SeqViewerPackageBoundary {
  readonly packageName: "@seq-star/seq-viewer";
}
