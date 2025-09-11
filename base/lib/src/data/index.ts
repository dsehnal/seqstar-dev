import type { CoordinateSystem, TableView } from "./coordinates"
import type { FeatureId, FeatureKind, Range, Ranges, SectionName, TrackId } from "./types"

export interface Feature {
  id: FeatureId
  kind: FeatureKind
  ranges: Ranges
  data?: any
}

export interface Track {
  id: TrackId
  children?: TrackId[]

  header?: string
  heightFactor?: number

  features: FeatureId[]
  data?: any
  values?: Record<string, any>
  options?: {
    // If enabled, draws a visual representation of a gap in the parent view
    drawGaps?: boolean
    // If enabled, splits the track into multiple subtracks when features overlap
    stackFeatures?: boolean
  }
}

export interface Data {
  coordinateSystem: CoordinateSystem
  features: Feature[]
  tracks: Track[]
  sections: Record<SectionName, TrackId[]>
  custom?: Record<string, any>
}

export interface Viewport {
  range: Range
}

export interface BaseState {
  data: Data
  dataView: {
    default: TableView
    current: TableView
  }
  viewport: Viewport
}
