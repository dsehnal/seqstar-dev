import type { CoordinateLocus, CoordinateSpace } from "@seq-star/seq-coords";
import { type Diagnostic, diagnostic } from "@seq-star/seq-core";
import {
  evaluateColorEncoding,
  type Locus,
  type SeqViewSpec,
  validateSeqViewSpec,
} from "@seq-star/seq-view-spec";
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
  readonly loci: readonly CoordinateLocus[];
  readonly nativeEvent?: Event;
}
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

const HEADER = 156,
  DEFAULT_ROW = 25,
  RULER = 20,
  GAP = 12;
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
  private width = 1;
  private height = 1;
  private dpr = 1;
  private zoom = 1;
  private pan = 0;
  private nativeHover: SeqViewerInteraction | undefined;

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
      height: "100%",
      minHeight: "120px",
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
    this.root.append(this.spacer, this.canvas, this.headers);
    privateOptions.target.replaceChildren(this.root);
    this.root.addEventListener("scroll", this.schedule, { signal: this.abort.signal });
    this.canvas.addEventListener("pointermove", this.hover, { signal: this.abort.signal });
    this.canvas.addEventListener("pointerleave", this.leave, { signal: this.abort.signal });
    this.canvas.addEventListener("click", this.select, { signal: this.abort.signal });
    this.canvas.addEventListener("wheel", this.wheel, {
      signal: this.abort.signal,
      passive: false,
    });
    if (typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(() => this.resize());
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
    this.active = next;
    this.nativeHover = undefined;
    this.zoom = 1;
    this.pan = 0;
    this.root.scrollTop = 0;
    this.spacer.style.height = `${Math.max(this.height, next.totalHeight)}px`;
    this.renderHeaders();
    this.draw();
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
    if (this.disposed) return;
    const box = this.options.target.getBoundingClientRect();
    this.width = Math.max(1, Math.floor(box.width || this.options.target.clientWidth || 800));
    this.height = Math.max(1, Math.floor(box.height || this.options.target.clientHeight || 300));
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.spacer.style.height = `${Math.max(this.height, this.active?.totalHeight ?? 0)}px`;
    this.schedule();
  };

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
    this.nativeHover = undefined;
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
          if (space)
            return {
              layer: resolved,
              annotation,
              itemId: item.id,
              ...("endpointRole" in item && typeof item.endpointRole === "string"
                ? { endpointRole: item.endpointRole }
                : {}),
              locusIndex: item.locusIndex,
              loci: [boundary(space, item.locus.position)],
            };
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
            loci: [this.convertLocus(space, locus)],
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
                loci: [this.convertLocus(space, locus)],
              };
    return undefined;
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
            Math.min(7, cell / 2),
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
  }
  private drawCommand(
    context: CanvasRenderingContext2D,
    active: Active,
    command: SequenceHighlight | SequenceSelection,
    color: string,
  ): void {
    context.fillStyle = color;
    for (const row of active.rows) {
      if (command.trackId && command.trackId !== row.track.id) continue;
      const y = row.top - this.root.scrollTop;
      for (const locus of command.loci)
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
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = row.label;
      button.dataset.seqViewerTrack = row.track.id;
      button.setAttribute("aria-label", `Activate track ${row.label}`);
      Object.assign(button.style, {
        position: "absolute",
        top: `${row.top}px`,
        left: "0",
        width: "100%",
        height: `${row.height - 1}px`,
        border: "0",
        borderBottom: "1px solid #dbeafe",
        background: "#f8fafc",
        color: "#102a43",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        textAlign: "left",
        pointerEvents: "auto",
      });
      button.addEventListener(
        "click",
        (event) =>
          this.subject.next({
            kind: "track-activate",
            documentId: active.document.id,
            viewId: active.view.id,
            sectionId: row.sectionId,
            trackId: row.track.id,
            loci: NONE,
            nativeEvent: event,
          }),
        { signal: this.abort.signal },
      );
      this.headers.append(button);
    }
  }
  private readonly hover = (event: PointerEvent): void => {
    const hit = this.hitTest(event.clientX, event.clientY);
    if (hit) {
      this.nativeHover = { ...hit, kind: "hover", phase: "set" };
      this.subject.next({ ...this.nativeHover, nativeEvent: event });
    } else this.clearNativeHover(event);
  };
  private readonly leave = (event: PointerEvent): void => {
    this.clearNativeHover(event);
  };
  private clearNativeHover(event: PointerEvent): void {
    if (!this.nativeHover) return;
    const previous = this.nativeHover;
    this.nativeHover = undefined;
    this.subject.next({ ...previous, phase: "clear", nativeEvent: event });
  }
  private readonly select = (event: MouseEvent): void => {
    const hit = this.hitTest(event.clientX, event.clientY);
    if (hit) this.subject.next({ ...hit, kind: "select", phase: "set", nativeEvent: event });
  };
  private readonly wheel = (event: WheelEvent): void => {
    if (!this.active || (!event.ctrlKey && !event.shiftKey)) return;
    event.preventDefault();
    if (event.ctrlKey)
      this.zoom = Math.min(32, Math.max(0.5, this.zoom * (event.deltaY < 0 ? 1.2 : 1 / 1.2)));
    else this.pan = Math.max(0, this.pan + event.deltaY / Math.max(1, this.cell()));
    this.schedule();
    this.subject.next({
      kind: "viewport-change",
      documentId: this.active.document.id,
      viewId: this.active.view.id,
      loci: NONE,
      nativeEvent: event,
    });
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
