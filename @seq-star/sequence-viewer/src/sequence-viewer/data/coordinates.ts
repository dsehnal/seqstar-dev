import type { PolymerName, Range, Ranges, SoA } from "./types"

/** The coordinate system defines a basic frame of reference for rendering features in the sequence viewer */
export interface CoordinateSystem {
  polymers: Range<{ name: PolymerName }>[]
  polymerGap: number
}

/** View of the coordinate system */
export interface View {
  ranges: Ranges<Range<{ gap: number }>>
  width: number
}

/**
 * A segment is a combination of a polymer and a range within that polymer
 * It contains:
 * - raw ranges in the parent coordinate system
 * - range of columns relative to the parent View
 */
export interface Segment {
  polymerName: PolymerName | null
  start: number
  end: number
  rangeStart: number
  rangeEnd: number
}

/** A tabular version of a coordinate system view */
export interface TableView {
  view: View

  polymerSegments: Record<PolymerName, Segment[]>
  segments: TableViewSegments
}

/** A list of segments represented as Struct of Arrays */
export interface TableViewSegments extends SoA<Segment> {}

/** A view of a feature ranges projected onto a parent TableView */
export interface FeatureTableView {
  segments: TableViewSegments
  stackDepth: number
  maxStackDepth: number
}

export type ColumnSelection = Range[]

export type Highlight = {
  sectionName?: string
  trackId?: string
  column?: number
}

export type SequenceLocation = {
  polymerName: PolymerName
  position: number
}
