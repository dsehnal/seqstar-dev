import type { JsonObject } from "@seq-star/seq-core";
import { Box, createElement as createLucideElement, Layers } from "lucide";

export interface NightingaleViewportDescriptor extends JsonObject {
  /** One-based, inclusive biological coordinates. */
  readonly start: number;
  /** One-based, inclusive biological coordinates. */
  readonly end: number;
  readonly length: number;
}

/**
 * Presentation is intentionally wrapper-local: a SeqViewSpec describes the
 * sequence view, while a host decides whether a track has a 3D action.
 */
export interface NightingaleTrackAction extends JsonObject {
  readonly trackId: string;
  readonly label: string;
  readonly kind?: "structure" | "layers";
}

export interface NightingaleDefaultTrackAction extends JsonObject {
  readonly label: string;
  readonly kind?: "structure" | "layers";
}

/**
 * A member action is deliberately presentation-only.  It identifies a frozen
 * alignment member, but contains neither a structure identifier nor a mapping
 * instruction: the harness/plugin remains responsible for any structure work.
 */
export interface NightingaleAlignmentMemberAction extends JsonObject {
  readonly alignmentId: string;
  readonly memberId: string;
  readonly label: string;
  readonly kind?: "structure" | "layers";
}

export interface NightingaleInitialViewport extends JsonObject {
  readonly start?: number;
  readonly end?: number;
}

export interface NightingalePresentation extends JsonObject {
  readonly initialViewport?: NightingaleInitialViewport;
  /** Presentation fallback for every non-member track in dynamic documents. */
  readonly defaultTrackAction?: NightingaleDefaultTrackAction;
  readonly trackActions?: readonly NightingaleTrackAction[];
  readonly alignmentMemberActions?: readonly NightingaleAlignmentMemberAction[];
}

export class NightingalePresentationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "NightingalePresentationError";
    this.code = code;
  }
}

const presentationError = (code: string, message: string): never => {
  throw new NightingalePresentationError(code, message);
};

const isArrayIndex = (key: string): boolean => /^(?:0|[1-9][0-9]*)$/u.test(key);

/** Reject hostile values before reading any presentation property. */
const assertJsonSafe = (value: unknown, seen = new WeakSet<object>()): void => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return;
  if (typeof value !== "object")
    presentationError(
      "wrapper.nightingale.presentation.json",
      "Nightingale presentation must contain JSON-safe values only.",
    );
  const objectValue = value as object;
  if (seen.has(objectValue))
    presentationError(
      "wrapper.nightingale.presentation.json",
      "Nightingale presentation cannot contain cycles.",
    );
  seen.add(objectValue);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype)
      presentationError(
        "wrapper.nightingale.presentation.json",
        "Nightingale presentation arrays must be plain arrays.",
      );
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (key === "length") continue;
      if (!isArrayIndex(key) || !("value" in descriptor) || !descriptor.enumerable)
        presentationError(
          "wrapper.nightingale.presentation.json",
          "Nightingale presentation arrays cannot contain accessors or extra properties.",
        );
      assertJsonSafe(descriptor.value, seen);
    }
    for (let index = 0; index < value.length; index += 1)
      if (!Object.hasOwn(value, index))
        presentationError(
          "wrapper.nightingale.presentation.json",
          "Nightingale presentation arrays cannot contain holes.",
        );
    return;
  }
  if (
    Object.getPrototypeOf(objectValue) !== Object.prototype ||
    Reflect.ownKeys(objectValue).some((key) => typeof key !== "string")
  )
    presentationError(
      "wrapper.nightingale.presentation.json",
      "Nightingale presentation objects must be plain objects without symbol keys.",
    );
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(objectValue))) {
    if (!("value" in descriptor) || !descriptor.enumerable)
      presentationError(
        "wrapper.nightingale.presentation.json",
        "Nightingale presentation cannot contain accessors or hidden properties.",
      );
    assertJsonSafe(descriptor.value, seen);
  }
};

const stringValue = (value: unknown, path: string): string => {
  if (typeof value !== "string" || value.trim() === "")
    presentationError(
      "wrapper.nightingale.presentation.shape",
      `${path} must be a non-empty string.`,
    );
  return value as string;
};

const positiveInteger = (value: unknown, path: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    presentationError(
      "wrapper.nightingale.presentation.range",
      `${path} must be a positive integer.`,
    );
  return value as number;
};

const allowedKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
  path: string,
): void => {
  for (const key of Object.keys(value))
    if (!keys.includes(key))
      presentationError(
        "wrapper.nightingale.presentation.shape",
        `${path}.${key} is not a supported presentation property.`,
      );
};

/**
 * Detaches and freezes host presentation before a renderer is created. It is a
 * runtime boundary, not merely a TypeScript convenience type.
 */
export const snapshotNightingalePresentation = (value: unknown): NightingalePresentation => {
  if (value === undefined) return Object.freeze({});
  assertJsonSafe(value);
  if (Object.getPrototypeOf(value) !== Object.prototype)
    presentationError(
      "wrapper.nightingale.presentation.shape",
      "Nightingale presentation must be a plain object.",
    );
  const presentation = value as Record<string, unknown>;
  allowedKeys(
    presentation,
    ["initialViewport", "defaultTrackAction", "trackActions", "alignmentMemberActions"],
    "presentation",
  );
  let initialViewport: NightingaleInitialViewport | undefined;
  if (presentation.initialViewport !== undefined) {
    if (
      presentation.initialViewport === null ||
      typeof presentation.initialViewport !== "object" ||
      Array.isArray(presentation.initialViewport)
    )
      presentationError(
        "wrapper.nightingale.presentation.shape",
        "presentation.initialViewport must be a plain object.",
      );
    const initial = presentation.initialViewport as Record<string, unknown>;
    allowedKeys(initial, ["start", "end"], "presentation.initialViewport");
    const start =
      initial.start === undefined
        ? undefined
        : positiveInteger(initial.start, "presentation.initialViewport.start");
    const end =
      initial.end === undefined
        ? undefined
        : positiveInteger(initial.end, "presentation.initialViewport.end");
    if (start !== undefined && end !== undefined && start > end)
      presentationError(
        "wrapper.nightingale.presentation.range",
        "presentation.initialViewport.start cannot exceed end.",
      );
    initialViewport = Object.freeze({
      ...(start === undefined ? {} : { start }),
      ...(end === undefined ? {} : { end }),
    });
  }
  let defaultTrackAction: NightingaleDefaultTrackAction | undefined;
  if (presentation.defaultTrackAction !== undefined) {
    const action = presentation.defaultTrackAction;
    if (action === null || typeof action !== "object" || Array.isArray(action))
      presentationError(
        "wrapper.nightingale.presentation.shape",
        "presentation.defaultTrackAction must be a plain object.",
      );
    const record = action as Record<string, unknown>;
    allowedKeys(record, ["label", "kind"], "presentation.defaultTrackAction");
    const label = stringValue(record.label, "presentation.defaultTrackAction.label");
    const kind =
      record.kind === undefined
        ? undefined
        : record.kind === "structure" || record.kind === "layers"
          ? record.kind
          : presentationError(
              "wrapper.nightingale.presentation.shape",
              "presentation.defaultTrackAction.kind must be structure or layers.",
            );
    defaultTrackAction = Object.freeze({ label, ...(kind === undefined ? {} : { kind }) });
  }
  let trackActions: readonly NightingaleTrackAction[] | undefined;
  const configuredActions = presentation.trackActions;
  if (configuredActions !== undefined) {
    if (!Array.isArray(configuredActions)) {
      presentationError(
        "wrapper.nightingale.presentation.shape",
        "presentation.trackActions must be an array.",
      );
    }
    const actionValues = configuredActions as unknown[];
    const ids = new Set<string>();
    trackActions = Object.freeze(
      actionValues.map((candidate, index) => {
        if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate))
          presentationError(
            "wrapper.nightingale.presentation.shape",
            `presentation.trackActions[${index}] must be a plain object.`,
          );
        const action = candidate as Record<string, unknown>;
        allowedKeys(action, ["trackId", "label", "kind"], `presentation.trackActions[${index}]`);
        const trackId = stringValue(action.trackId, `presentation.trackActions[${index}].trackId`);
        const label = stringValue(action.label, `presentation.trackActions[${index}].label`);
        const kind =
          action.kind === undefined
            ? undefined
            : action.kind === "structure" || action.kind === "layers"
              ? action.kind
              : presentationError(
                  "wrapper.nightingale.presentation.shape",
                  `presentation.trackActions[${index}].kind must be structure or layers.`,
                );
        if (ids.has(trackId))
          presentationError(
            "wrapper.nightingale.presentation.duplicate-track",
            `presentation.trackActions contains duplicate track '${trackId}'.`,
          );
        ids.add(trackId);
        return Object.freeze({
          trackId,
          label,
          ...(kind === undefined ? {} : { kind }),
        });
      }),
    );
  }
  let alignmentMemberActions: readonly NightingaleAlignmentMemberAction[] | undefined;
  const configuredMemberActions = presentation.alignmentMemberActions;
  if (configuredMemberActions !== undefined) {
    if (!Array.isArray(configuredMemberActions))
      presentationError(
        "wrapper.nightingale.presentation.shape",
        "presentation.alignmentMemberActions must be an array.",
      );
    const keys = new Set<string>();
    alignmentMemberActions = Object.freeze(
      (configuredMemberActions as unknown[]).map((candidate, index) => {
        if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate))
          presentationError(
            "wrapper.nightingale.presentation.shape",
            `presentation.alignmentMemberActions[${index}] must be a plain object.`,
          );
        const action = candidate as Record<string, unknown>;
        const path = `presentation.alignmentMemberActions[${index}]`;
        allowedKeys(action, ["alignmentId", "memberId", "label", "kind"], path);
        const alignmentId = stringValue(action.alignmentId, `${path}.alignmentId`);
        const memberId = stringValue(action.memberId, `${path}.memberId`);
        const label = stringValue(action.label, `${path}.label`);
        const kind =
          action.kind === undefined
            ? undefined
            : action.kind === "structure" || action.kind === "layers"
              ? action.kind
              : presentationError(
                  "wrapper.nightingale.presentation.shape",
                  `${path}.kind must be structure or layers.`,
                );
        const key = `${alignmentId}\u0000${memberId}`;
        if (keys.has(key))
          presentationError(
            "wrapper.nightingale.presentation.duplicate-member",
            `presentation.alignmentMemberActions contains duplicate member '${alignmentId}/${memberId}'.`,
          );
        keys.add(key);
        return Object.freeze({
          alignmentId,
          memberId,
          label,
          ...(kind === undefined ? {} : { kind }),
        });
      }),
    );
  }
  return Object.freeze({
    ...(initialViewport === undefined ? {} : { initialViewport }),
    ...(defaultTrackAction === undefined ? {} : { defaultTrackAction }),
    ...(trackActions === undefined ? {} : { trackActions }),
    ...(alignmentMemberActions === undefined ? {} : { alignmentMemberActions }),
  });
};

export type NightingaleViewportElement = HTMLElement & {
  length?: number;
  width?: number;
  "display-start"?: number;
  "display-end"?: number;
  applyZoomTranslation?(): void;
  zoomRefreshed?(): void;
  getXFromSeqPosition?(position: number): number;
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

const rounded = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
const FOCUS_RADIUS = 20;

/**
 * Synchronizes the already-vendored native elements without importing
 * nightingale-manager. It owns only display geometry and never reaches into
 * vendor-private D3 state.
 */
export class NightingaleViewportController {
  readonly navigation: HTMLDivElement;
  private readonly overview: HTMLDivElement;
  private readonly window: HTMLDivElement;
  private readonly slider: HTMLInputElement;
  private readonly elements = new Set<NightingaleViewportElement>();
  private descriptor: NightingaleViewportDescriptor;
  private plot: HTMLElement | undefined;
  private disposed = false;
  private applying = false;
  private drag:
    | {
        readonly pointerId: number;
        readonly offset: number;
      }
    | undefined;
  private readonly root: HTMLElement;

  constructor(root: HTMLElement, length: number, initial?: NightingaleInitialViewport) {
    this.root = root;
    const normalizedLength = Math.max(1, Math.floor(length));
    const start = clamp(rounded(initial?.start, 1), 1, normalizedLength);
    const end = clamp(
      Math.max(start, rounded(initial?.end, normalizedLength)),
      start,
      normalizedLength,
    );
    this.descriptor = Object.freeze({ start, end, length: normalizedLength });

    this.navigation = document.createElement("div");
    this.navigation.dataset.seqstarNightingaleViewport = "root";
    this.navigation.setAttribute("aria-label", "Sequence viewport overview");
    this.navigation.className = "seqstar-nightingale-viewport";
    const spacer = document.createElement("div");
    spacer.setAttribute("aria-hidden", "true");
    this.overview = document.createElement("div");
    this.overview.className = "seqstar-nightingale-viewport-overview";
    this.overview.dataset.seqstarNightingaleViewport = "overview";
    this.overview.title = "Drag to pan. Double-click to focus or reset.";
    this.window = document.createElement("div");
    this.window.className = "seqstar-nightingale-viewport-window";
    this.window.dataset.seqstarNightingaleViewport = "window";
    this.window.setAttribute("aria-hidden", "true");
    this.slider = document.createElement("input");
    this.slider.type = "range";
    this.slider.min = "1";
    this.slider.step = "1";
    this.slider.setAttribute("aria-label", "Viewport window; drag to pan");
    this.slider.className = "seqstar-nightingale-viewport-slider";
    this.overview.append(this.window, this.slider);
    this.navigation.append(spacer, this.overview);
    root.append(this.navigation);

    root.addEventListener("change", this.onNativeRange);
    root.addEventListener("wheel", this.onWheel, { capture: true, passive: false });
    this.slider.addEventListener("input", this.onSlider);
    this.overview.addEventListener("pointerdown", this.onOverviewPointer);
    this.overview.addEventListener("pointermove", this.onOverviewPointerMove);
    this.overview.addEventListener("pointerup", this.onOverviewPointerEnd);
    this.overview.addEventListener("pointercancel", this.onOverviewPointerEnd);
    this.overview.addEventListener("lostpointercapture", this.onOverviewPointerEnd);
    this.overview.addEventListener("dblclick", this.onOverviewDoubleClick);
    this.publish();
  }

  register(element: NightingaleViewportElement, plot: HTMLElement): void {
    this.elements.add(element);
    this.plot ??= plot;
    this.applyTo(element);
  }

  get value(): NightingaleViewportDescriptor {
    return this.descriptor;
  }

  resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, Math.floor(this.plot?.getBoundingClientRect().width ?? 0));
    if (width > 1)
      for (const element of this.elements) {
        element.width = width;
        element.setAttribute("width", String(width));
      }
    this.publish();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeEventListener("change", this.onNativeRange);
    this.root.removeEventListener("wheel", this.onWheel, true);
    this.slider.removeEventListener("input", this.onSlider);
    this.overview.removeEventListener("pointerdown", this.onOverviewPointer);
    this.overview.removeEventListener("pointermove", this.onOverviewPointerMove);
    this.overview.removeEventListener("pointerup", this.onOverviewPointerEnd);
    this.overview.removeEventListener("pointercancel", this.onOverviewPointerEnd);
    this.overview.removeEventListener("lostpointercapture", this.onOverviewPointerEnd);
    this.overview.removeEventListener("dblclick", this.onOverviewDoubleClick);
    this.drag = undefined;
    this.elements.clear();
    this.navigation.remove();
  }

  private readonly onNativeRange = (event: Event): void => {
    if (this.applying || !(event instanceof CustomEvent)) return;
    const target = event.target;
    if (
      !(target instanceof HTMLElement) ||
      !this.elements.has(target as NightingaleViewportElement)
    )
      return;
    const detail = event.detail as Record<string, unknown> | undefined;
    if (detail === undefined || !("display-start" in detail || "display-end" in detail)) return;
    this.setRange(
      rounded(detail["display-start"], this.descriptor.start),
      rounded(detail["display-end"], this.descriptor.end),
    );
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (this.disposed) return;
    const target = event.target;
    if (!(target instanceof Node) || !this.root.contains(target)) return;
    const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey;
    event.preventDefault();
    event.stopPropagation();
    if (horizontal) {
      const delta = event.deltaX === 0 ? event.deltaY : event.deltaX;
      const baseWidth = Math.max(1, this.plotWidth() / this.span());
      this.pan(Math.round(delta / baseWidth));
    } else this.zoom(event.deltaY, event.clientX);
  };

  private readonly onSlider = (): void => {
    this.setRange(Number(this.slider.value), Number(this.slider.value) + this.span() - 1);
  };

  private readonly onOverviewPointer = (event: PointerEvent): void => {
    const box = this.overview.getBoundingClientRect();
    if (box.width <= 0) return;
    event.preventDefault();
    const windowBox = this.window.getBoundingClientRect();
    const insideWindow = event.clientX >= windowBox.left && event.clientX <= windowBox.right;
    this.drag = {
      pointerId: event.pointerId,
      offset: insideWindow ? event.clientX - windowBox.left : windowBox.width / 2,
    };
    this.overview.setPointerCapture(event.pointerId);
    this.panOverviewTo(event.clientX);
  };

  private readonly onOverviewPointerMove = (event: PointerEvent): void => {
    if (this.drag?.pointerId !== event.pointerId) return;
    event.preventDefault();
    this.panOverviewTo(event.clientX);
  };

  private readonly onOverviewPointerEnd = (event: PointerEvent): void => {
    if (this.drag?.pointerId !== event.pointerId) return;
    this.drag = undefined;
    if (this.overview.hasPointerCapture(event.pointerId))
      this.overview.releasePointerCapture(event.pointerId);
  };

  private readonly onOverviewDoubleClick = (event: MouseEvent): void => {
    if (this.disposed) return;
    event.preventDefault();
    if (this.span() < this.descriptor.length) {
      this.setRange(1, this.descriptor.length);
      return;
    }
    const box = this.overview.getBoundingClientRect();
    if (box.width <= 0) return;
    const fraction = clamp((event.clientX - box.left) / box.width, 0, 1),
      center =
        1 + Math.min(this.descriptor.length - 1, Math.floor(fraction * this.descriptor.length)),
      span = Math.min(this.descriptor.length, FOCUS_RADIUS * 2 + 1);
    this.setRange(center - FOCUS_RADIUS, center - FOCUS_RADIUS + span - 1);
  };

  /** Keep the rendered window under the pointer for the whole drag. */
  private panOverviewTo(clientX: number): void {
    const drag = this.drag;
    if (drag === undefined) return;
    const box = this.overview.getBoundingClientRect();
    const windowWidth = this.window.getBoundingClientRect().width;
    const travel = Math.max(0, box.width - windowWidth);
    const startRange = Math.max(0, this.descriptor.length - this.span());
    const left = clamp(clientX - box.left - drag.offset, 0, travel);
    const start = 1 + (travel === 0 ? 0 : Math.round((left / travel) * startRange));
    this.setRange(start, start + this.span() - 1);
  }

  private pan(delta: number): void {
    if (delta === 0) return;
    this.setRange(this.descriptor.start + delta, this.descriptor.end + delta);
  }

  private zoom(deltaY: number, clientX: number): void {
    const priorSpan = this.span();
    const nextSpan = clamp(
      Math.round(priorSpan * Math.exp(deltaY * 0.002)),
      Math.min(2, this.descriptor.length),
      this.descriptor.length,
    );
    if (nextSpan === priorSpan) return;
    const box = this.plot?.getBoundingClientRect();
    const fraction =
      box === undefined || box.width <= 0 ? 0.5 : clamp((clientX - box.left) / box.width, 0, 1);
    const anchor = this.descriptor.start + fraction * (priorSpan - 1);
    this.setRange(
      Math.round(anchor - fraction * (nextSpan - 1)),
      Math.round(anchor + (1 - fraction) * (nextSpan - 1)),
    );
  }

  private setRange(start: number, end: number): void {
    const span = clamp(Math.round(end) - Math.round(start) + 1, 1, this.descriptor.length);
    const clampedStart = clamp(Math.round(start), 1, this.descriptor.length - span + 1);
    const next = Object.freeze({
      start: clampedStart,
      end: clampedStart + span - 1,
      length: this.descriptor.length,
    });
    if (next.start === this.descriptor.start && next.end === this.descriptor.end) return;
    this.descriptor = next;
    for (const element of this.elements) this.applyTo(element);
    this.publish();
  }

  private applyTo(element: NightingaleViewportElement): void {
    this.applying = true;
    element["display-start"] = this.descriptor.start;
    element["display-end"] = this.descriptor.end;
    element.setAttribute("display-start", String(this.descriptor.start));
    element.setAttribute("display-end", String(this.descriptor.end));
    element.applyZoomTranslation?.();
    element.zoomRefreshed?.();
    this.applying = false;
  }

  private span(): number {
    return this.descriptor.end - this.descriptor.start + 1;
  }

  private plotWidth(): number {
    return Math.max(1, this.plot?.getBoundingClientRect().width ?? 1);
  }

  private publish(): void {
    const span = this.span();
    const maximum = Math.max(1, this.descriptor.length - span + 1);
    this.slider.max = String(maximum);
    this.slider.value = String(clamp(this.descriptor.start, 1, maximum));
    const left = ((this.descriptor.start - 1) / this.descriptor.length) * 100;
    const width = (span / this.descriptor.length) * 100;
    this.window.style.insetInlineStart = `${left}%`;
    this.window.style.width = `${width}%`;
    this.root.dataset.seqstarViewportStart = String(this.descriptor.start);
    this.root.dataset.seqstarViewportEnd = String(this.descriptor.end);
    this.root.dataset.seqstarViewportLength = String(this.descriptor.length);
  }
}

export const createNightingaleTrackActionIcon = (
  kind: NightingaleTrackAction["kind"],
): SVGElement => {
  const icon = createLucideElement(kind === "structure" ? Box : Layers, {
    "aria-hidden": "true",
    focusable: "false",
    height: 16,
    width: 16,
  });
  return icon;
};
