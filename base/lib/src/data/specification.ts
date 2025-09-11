import type { SectionModel } from "../model/section"
import type { Data, Feature, Track, Viewport } from "."
import type { Segment } from "./coordinates"
import type { FeatureKind, PolymerName } from "./types"

export const MIN_VIEWPORT_COLUMNS = 20

export const DefaultTheme = {
  borderColor: "rgb(229, 231, 235)",
  highlightColumnColor: "rgba(43, 127, 255, 0.1)",
  highlightRowColor: "rgba(43, 127, 255, 0.1)",
  highlightRowInSliderColor: "rgba(43, 127, 255, 0.05)",
  selectColumnColor: "rgba(0, 0, 0, 0.05)",
  selectColumnBorderColor: "rgba(0, 0, 0, 0.33)",
  verticalCanvasSliderColor: "rgba(0, 0, 0, 0.1)",
  horizontalCanvasSliderBorderColor: "rgba(45, 102, 248, 0.66)",
  horizontalCanvasSliderOverlayColor: "rgba(0, 0, 0, 0.015)", // "rgba(45, 102, 248, 0.025)"
  baseFontSizePx: 12,
  uiFontFamily: "ui-sans-serif, system-ui, sans-serif",
  monospaceFontFamily: "ui-monospace, monospace",
}

export type Theme = typeof DefaultTheme

export interface RenderFeatureOptions {
  track: Track
  feature: Feature
  data: Data
  section: SectionModel
  ctx2d: CanvasRenderingContext2D

  columnWidth: number
  offsetY: number
  height: number
  /** device pixel ratio */
  dpr: number
  /** Measure of letter A using monospace font at base size */
  monospaceTextMetrics: TextMetrics

  viewport: Viewport
  segment: Segment

  stackDepth: number
  maxStackDepth: number
}

export type RenderFeatureFn = (options: RenderFeatureOptions) => void
export type RenderGapFn = (options: Omit<RenderFeatureOptions, "feature">) => void
export type PolymerPropertyGetter<T> = (
  polymer: PolymerName,
  position: number,
  options: RenderFeatureOptions,
) => T
export type RendererPropertyGetter<T> = (options: RenderFeatureOptions) => T

export interface LayoutColumn {
  name: string
  width?: string | number
  isHidden?: boolean
}

export interface LayoutSection {
  hasData?: boolean
  name: string
  maxHeight?: number
  verticalPadding?: number
  height?: "min-content" | "auto" | `${number}px` | number
  isHidden?: boolean
  horizontalView?: "zoomed" | "full"
  verticalView?: "default" | "full"
  trackStyle?: {
    baseHeight?: number
    borders?: boolean
    hideSelection?: boolean
  }
}

export interface Layout {
  baseTrackHeight: number
  columns: LayoutColumn[]
  sections: LayoutSection[]
}

export interface Spec {
  theme: Theme
  gapRenderer?: RenderGapFn
  defaultRenderer?: RenderFeatureFn
  featureRenderers: Record<FeatureKind, RenderFeatureFn[]>
  layout: Layout
}
