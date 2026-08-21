import { LitElement } from "lit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Constructor<T = {}> = new (...args: any[]) => T;
export type SeqstarInteractionFamily = "highlight" | "selection";
export type SeqstarRegion = { readonly start: number; readonly end: number };
export type SeqstarNativeInteraction = {
  readonly kind: "hover" | "select" | "activate";
  readonly phase: "set" | "clear";
  readonly generation: number;
  readonly trackId: string;
  readonly layerId: string;
  readonly featureId?: string;
  readonly regions: readonly SeqstarRegion[];
};

const nativeEventName = "nightingale-interaction";
const firstRenderEventName = "nightingale-first-render";
const svgNamespace = "http://www.w3.org/2000/svg";
const regionsFromHighlight = (value: unknown): readonly SeqstarRegion[] =>
  typeof value !== "string"
    ? []
    : value.split(",").flatMap((segment) => {
        const values = segment.split(":").map(Number);
        const start = values[0];
        const end = values[1];
        return start !== undefined && end !== undefined && start > 0 && end >= start
          ? [{ start, end }]
          : [];
      });
const regionsFromDetail = (detail: Record<string, unknown>): readonly SeqstarRegion[] => {
  const highlighted = regionsFromHighlight(detail.highlight);
  if (highlighted.length > 0) return highlighted;
  const candidates = [detail, detail.feature].flatMap((value) =>
    value && typeof value === "object" ? [value as Record<string, unknown>] : [],
  );
  for (const candidate of candidates) {
    const start = typeof candidate.start === "number" ? candidate.start : undefined;
    const end = typeof candidate.end === "number" ? candidate.end : start;
    if (start !== undefined && end !== undefined && start > 0 && end >= start)
      return [{ start, end }];
    const position =
      typeof candidate.position === "number" ? candidate.position : undefined;
    if (position !== undefined && position > 0) return [{ start: position, end: position }];
  }
  return [];
};
const hoverRegionFromPointer = (
  detail: Record<string, unknown>,
  element: HTMLElement,
): readonly SeqstarRegion[] => {
  const parentEvent = detail.parentEvent;
  if (!(parentEvent instanceof MouseEvent)) return [];
  const coordinate = element as HTMLElement & {
    getSeqPositionFromX?(x: number): number | undefined;
    length?: number;
  };
  if (coordinate.getSeqPositionFromX === undefined) return [];
  const position = coordinate.getSeqPositionFromX(
    parentEvent.clientX - element.getBoundingClientRect().left,
  );
  if (position === undefined || !Number.isFinite(position)) return [];
  const rounded = Math.round(position);
  const clamped = Math.max(1, Math.min(coordinate.length ?? rounded, rounded));
  return [{ start: clamped, end: clamped }];
};
const externalFeatureId = (detail: Record<string, unknown>): string | undefined => {
  if (typeof detail.selectedId === "string") return detail.selectedId;
  const feature = detail.feature;
  if (feature && typeof feature === "object") {
    const record = feature as Record<string, unknown>;
    if (typeof record.externalId === "string") return record.externalId;
    if (typeof record.accession === "string") return record.accession;
  }
  return undefined;
};

class NightingaleElement extends LitElement {
  /** Stable IDs supplied by an embedding application; never inferred from labels or DOM order. */
  seqstarTrackId = "";
  seqstarLayerId = "";
  seqstarGeneration = 0;
  #lastRenderedGeneration = 0;
  #applied = new Map<SeqstarInteractionFamily, Map<string, readonly SeqstarRegion[]>>();
  #nativeChange = (event: Event): void => {
    if (event.target !== this || !(event instanceof CustomEvent)) return;
    const detail = event.detail;
    if (!detail || typeof detail !== "object") return;
    const record = detail as Record<string, unknown>;
    const eventType = record.eventType ?? record.eventtype;
    const kind =
      eventType === "click"
        ? "select"
        : eventType === "mouseover"
          ? "hover"
          : eventType === "mouseout"
            ? "hover"
            : undefined;
    if (kind === undefined) return;
    const pointerRegions =
      eventType === "mouseover" ? hoverRegionFromPointer(record, this) : [];
    const regions =
      eventType === "mouseout"
        ? []
        : pointerRegions.length > 0
          ? pointerRegions
          : regionsFromDetail(record);
    if (kind === "select" && regions.length === 0) return;
    this.emitSeqstarInteraction({
      kind,
      phase: eventType === "mouseout" ? "clear" : "set",
      featureId: externalFeatureId(record),
      regions,
    });
  };

  override connectedCallback() {
    super.connectedCallback();
    this.style.display = "inline-block";
    this.style.lineHeight = "0";
    this.addEventListener("change", this.#nativeChange);
  }

  override disconnectedCallback(): void {
    this.removeEventListener("change", this.#nativeChange);
    super.disconnectedCallback();
  }

  override createRenderRoot() {
    return this;
  }

  /** Collision-free DOM-safe encoding; stable for all Unicode external IDs. */
  seqstarDomId(externalId: string): string {
    return `seqstar-${[...externalId]
      .map((value) => value.codePointAt(0)?.toString(16) ?? "0")
      .join("-")}`;
  }

  /** One normalized native event surface shared by all selected Nightingale packages. */
  emitSeqstarInteraction(
    value: Omit<SeqstarNativeInteraction, "generation" | "trackId" | "layerId">,
  ): void {
    this.dispatchEvent(
      new CustomEvent<SeqstarNativeInteraction>(nativeEventName, {
        bubbles: true,
        composed: true,
        detail: {
          ...value,
          generation: this.seqstarGeneration,
          trackId: this.seqstarTrackId,
          layerId: this.seqstarLayerId,
        },
      }),
    );
  }

  activateSeqstarTrack(): void {
    this.emitSeqstarInteraction({ kind: "activate", phase: "set", regions: [] });
  }

  waitForSeqstarFirstRender(generation: number, signal?: AbortSignal): Promise<void> {
    if (this.#lastRenderedGeneration === generation) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const cleanup = (): void => {
        this.removeEventListener(firstRenderEventName, onRender);
        signal?.removeEventListener("abort", onAbort);
      };
      const onAbort = (): void => {
        cleanup();
        reject(new DOMException("superseded", "AbortError"));
      };
      const onRender = (event: Event): void => {
        if (!(event instanceof CustomEvent) || event.detail?.generation !== generation) return;
        cleanup();
        resolve();
      };
      this.addEventListener(firstRenderEventName, onRender);
      if (signal?.aborted) onAbort();
      else signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  /** Called by leaf renderers only after their D3 frame is materially usable. */
  protected notifySeqstarFirstRender(): void {
    this.#lastRenderedGeneration = this.seqstarGeneration;
    this.renderSeqstarInteractions();
    this.dispatchEvent(
      new CustomEvent(firstRenderEventName, {
        detail: { generation: this.seqstarGeneration },
      }),
    );
  }

  setSeqstarInteraction(
    family: SeqstarInteractionFamily,
    owner: string,
    regions: readonly SeqstarRegion[],
  ): void {
    const owners = this.#applied.get(family) ?? new Map<string, readonly SeqstarRegion[]>();
    owners.set(owner, regions.map((region) => ({ ...region })));
    this.#applied.set(family, owners);
    this.renderSeqstarInteractions();
  }

  clearSeqstarInteraction(family: SeqstarInteractionFamily, owner: string): void {
    const owners = this.#applied.get(family);
    owners?.delete(owner);
    if (owners?.size === 0) this.#applied.delete(family);
    this.renderSeqstarInteractions();
  }

  private renderSeqstarInteractions(): void {
    const svg = this.querySelector("svg");
    if (svg === null) return;
    svg.querySelectorAll("g[data-seqstar-applied]").forEach((node) => node.remove());
    const coordinate = this as unknown as {
      getXFromSeqPosition?(position: number): number;
      getSingleBaseWidth?(): number;
      height?: number;
    };
    if (
      coordinate.getXFromSeqPosition === undefined ||
      coordinate.getSingleBaseWidth === undefined
    )
      return;
    for (const family of ["highlight", "selection"] as const) {
      const group = document.createElementNS(svgNamespace, "g");
      group.dataset.seqstarApplied = family;
      group.style.pointerEvents = "none";
      const regions = [...(this.#applied.get(family)?.values() ?? [])].flat();
      for (const region of regions) {
        const rectangle = document.createElementNS(svgNamespace, "rect");
        rectangle.setAttribute("x", String(coordinate.getXFromSeqPosition(region.start)));
        rectangle.setAttribute(
          "width",
          String(
            Math.max(0, coordinate.getSingleBaseWidth() * (region.end - region.start + 1)),
          ),
        );
        rectangle.setAttribute("height", String(coordinate.height ?? 1));
        if (family === "highlight") {
          rectangle.setAttribute("fill", "#38BDF8");
          rectangle.setAttribute("fill-opacity", "0.38");
        } else {
          rectangle.setAttribute("fill", "none");
          rectangle.setAttribute("stroke", "#DC2626");
          rectangle.setAttribute("stroke-width", "2");
        }
        group.append(rectangle);
      }
      svg.append(group);
    }
  }
}

export default NightingaleElement;
