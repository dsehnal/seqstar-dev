import type { Feature } from "../data"
import type {
  CoordinateSystem,
  FeatureTableView,
  Segment,
  SequenceLocation,
  TableView,
  TableViewSegments,
  View,
} from "../data/coordinates"
import type { PolymerName, Range, Ranges } from "../data/types"
import { findPredecessorIndex } from "./object"
import { intersect, intersectWithSegments, normalizeRange } from "./range"

export function fullCoordinateSystemRanges(coordinates: CoordinateSystem): Ranges {
  const ret: Ranges = {}
  for (const polymer of coordinates.polymers) {
    ret[polymer.name] = [{ start: polymer.start, end: polymer.end }]
  }
  return ret
}

export function createDefaultView(coordinates: CoordinateSystem): View {
  const { polymers, polymerGap } = coordinates

  const view: View = {
    ranges: {},
    width: 0,
  }

  for (const polymer of polymers) {
    view.ranges[polymer.name] = [
      {
        start: polymer.start,
        end: polymer.end,
        gap: polymerGap,
      },
    ]
    view.width += polymer.end - polymer.start
    if (polymer !== polymers[polymers.length - 1]) {
      view.width += polymerGap
    }
  }

  return view
}

export function createViewFromRanges(coordinates: CoordinateSystem, ranges: Ranges) {
  const view: View = {
    ranges: {},
    width: 0,
  }

  let prev: Range<{ gap: number }>[] | undefined
  for (let i = 0; i < coordinates.polymers.length; i++) {
    const polymer = coordinates.polymers[i]
    const currentRanges = ranges[polymer.name]
    if (!currentRanges?.length) {
      if (prev) prev[prev.length - 1].gap = 0
      continue
    }

    const intersection = intersect([polymer], currentRanges)
    if (!intersection.length) {
      if (prev) prev[prev.length - 1].gap = 0
      continue
    }

    const viewRanges: Range<{ gap: number }>[] = intersection.map((r) => ({
      start: r.start,
      end: r.end,
      gap: coordinates.polymerGap,
    }))

    const isLast = i === coordinates.polymers.length - 1
    if (isLast) {
      viewRanges[viewRanges.length - 1].gap = 0
    }

    view.ranges[polymer.name] = viewRanges
    prev = viewRanges
  }

  for (const polymer of coordinates.polymers) {
    if (!view.ranges[polymer.name]) continue
    for (const range of view.ranges[polymer.name]) {
      view.width += range.end - range.start + range.gap
    }
  }

  return view
}

export function createTableView(coordinates: CoordinateSystem, view: View) {
  const tableView: TableView = {
    view,
    polymerSegments: {},
    segments: {
      polymerName: [],
      start: [],
      end: [],
      rangeStart: [],
      rangeEnd: [],
    },
  }

  const allIntersections: [
    polymer: PolymerName,
    polymerSegments: Segment[],
    intersection: Range,
  ][] = []

  let offset = 0
  for (const polymer of coordinates.polymers) {
    const viewRanges = view.ranges[polymer.name]
    if (!viewRanges?.length) continue

    const polymerRange: Range[] = [{ start: polymer.start, end: polymer.end }]
    const polymerSegments: Segment[] = []

    const intersection = intersect(polymerRange, viewRanges)
    for (const range of intersection) {
      allIntersections.push([polymer.name, polymerSegments, range])
    }
  }

  for (const [polymerName, polymerSegments, range] of allIntersections) {
    const start = offset
    const length = range.end - range.start
    tableView.segments.start.push(start)
    tableView.segments.end.push(start + length)
    tableView.segments.rangeStart.push(range.start)
    tableView.segments.rangeEnd.push(range.end)
    tableView.segments.polymerName.push(polymerName)

    polymerSegments.push({
      polymerName,
      start,
      end: start + length,
      rangeStart: range.start,
      rangeEnd: range.end,
    })
    tableView.polymerSegments[polymerName] = polymerSegments

    offset += length

    const isLastIntersection = range === allIntersections[allIntersections.length - 1][2]
    if (isLastIntersection) continue

    tableView.segments.polymerName.push(null) // Gap between polymers
    tableView.segments.start.push(offset)
    tableView.segments.end.push(offset + coordinates.polymerGap)
    tableView.segments.rangeStart.push(0)
    tableView.segments.rangeEnd.push(0)

    offset += coordinates.polymerGap
  }

  return tableView
}

export function getFeatureTableView(
  coordinates: CoordinateSystem,
  view: TableView,
  feature: Feature,
): FeatureTableView {
  const result: TableViewSegments = {
    polymerName: [],
    start: [],
    end: [],
    rangeStart: [],
    rangeEnd: [],
  }

  for (const polymer of coordinates.polymers) {
    const segments = view.polymerSegments[polymer.name]
    const ranges = feature.ranges[polymer.name]
    if (!segments?.length || !ranges?.length) continue

    const normalized = normalizeRange(ranges)

    for (const segment of intersectWithSegments(segments, normalized)) {
      result.polymerName.push(segment.polymerName)
      result.start.push(segment.start)
      result.end.push(segment.end)
      result.rangeStart.push(segment.rangeStart)
      result.rangeEnd.push(segment.rangeEnd)
    }
  }

  return { segments: result, stackDepth: 0, maxStackDepth: 0 }
}

export function getSegmentIndex(segments: TableViewSegments, query: number): number {
  const idx = findPredecessorIndex(segments.end, query + 1)
  const start = segments.start[idx]
  const end = segments.end[idx]
  return start <= query && end > query ? idx : -1
}

export function getSegmentIndexRange(
  out: [number, number],
  segments: TableViewSegments,
  query: Range,
) {
  const N = segments.start.length
  const start = findPredecessorIndex(segments.end, query.start)
  const end = findPredecessorIndex(segments.start, query.end)
  if (start >= N) {
    out[0] = out[1] = -1
  }
  out[0] = start
  out[1] = end
}

export function getTableViewSequenceLocation(
  view: TableView,
  column: number,
): SequenceLocation | undefined {
  const idx = getSegmentIndex(view.segments, column)
  if (idx === -1) return undefined
  const polymerName = view.segments.polymerName[idx]
  if (polymerName === null) return undefined
  if (column >= view.segments.end[idx]) return undefined

  const delta = column - view.segments.start[idx]
  const location: SequenceLocation = {
    polymerName,
    position: view.segments.rangeStart[idx] + delta,
  }
  return location
}

export function assignStacking(views: FeatureTableView[]) {
  if (views.length < 2) return

  for (const view of views) {
    view.maxStackDepth = 0
    view.stackDepth = 0
  }

  let hasOverlap = false

  for (let i = 1; i < views.length; i++) {
    const sA = views[i].segments
    for (let j = i - 1; j >= 0; j--) {
      const sB = views[j].segments

      if (!segmentsIntersect(sA, sB)) continue

      hasOverlap = true
      break
    }
    if (hasOverlap) break
  }

  if (!hasOverlap) return

  for (let i = 0; i < views.length; i++) {
    views[i].stackDepth = i
    views[i].maxStackDepth = views.length - 1
  }
}

function segmentsIntersect(a: TableViewSegments, b: TableViewSegments): boolean {
  const lenA = a.start.length
  const lenB = b.start.length
  let i = 0
  let j = 0

  while (i < lenA && j < lenB) {
    const startA = a.start[i]
    const endA = a.end[i]
    const startB = b.start[j]
    const endB = b.end[j]

    // Check for overlap
    if (endA >= startB && endB >= startA) {
      return true
    }

    // Move to the next range
    if (endA < endB) {
      i++
    } else {
      j++
    }
  }

  return false
}
