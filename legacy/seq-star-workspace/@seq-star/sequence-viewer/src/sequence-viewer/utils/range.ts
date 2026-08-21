import type { Segment, TableView } from "../data/coordinates"
import type { Range, Ranges } from "../data/types"

export function normalizeRange(ranges: Range[]): Range[] {
  if (ranges.length === 0) return []

  // Sort ranges by start position
  const sorted = [...ranges].sort((a, b) => a.start - b.start)

  const normalized: Range[] = [{ ...sorted[0] }]

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const last = normalized[normalized.length - 1]

    // If ranges overlap, merge them
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end)
    } else {
      normalized.push({ ...current })
    }
  }

  return normalized
}

export function intersectOne(
  out: [number, number],
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
) {
  if (aEnd < bStart || bEnd < aStart) {
    out[0] = 0
    out[1] = 0
  } else {
    out[0] = Math.max(aStart, bStart)
    out[1] = Math.min(aEnd, bEnd)
  }
}

export function intersect(a: Range[], b: Range[]): Range[] {
  const result: Range[] = []

  let i = 0
  let j = 0

  while (i < a.length && j < b.length) {
    const startA = a[i].start
    const endA = a[i].end
    const startB = b[j].start
    const endB = b[j].end

    // Check for overlap
    if (endA >= startB && endB >= startA) {
      result.push({
        start: Math.max(startA, startB),
        end: Math.min(endA, endB),
      })
    }

    // Move to the next range
    if (endA < endB) {
      i++
    } else {
      j++
    }
  }

  return result
}

export function intersectWithSegments(segments: Segment[], a: Range[]): Segment[] {
  const result: Segment[] = []

  let i = 0
  let j = 0

  while (i < a.length && j < segments.length) {
    const startA = a[i].start
    const endA = a[i].end
    const startB = segments[j].rangeStart
    const endB = segments[j].rangeEnd

    // Check for overlap
    if (endA >= startB && endB >= startA) {
      const rangeStart = Math.max(startA, startB)
      const rangeEnd = Math.min(endA, endB)
      const startDelta = rangeStart - startB
      const start = segments[j].start + startDelta
      result.push({
        polymerName: segments[j].polymerName,
        start,
        end: start + rangeEnd - rangeStart,
        rangeStart,
        rangeEnd,
      })
    }

    // Move to the next range
    if (endA < endB) {
      i++
    } else {
      j++
    }
  }

  return result
}

export function subtract(a: Range[], b: Range[]): Range[] {
  const result: Range[] = []

  let i = 0
  let j = 0

  while (i < a.length) {
    const startA = a[i].start
    const endA = a[i].end

    // If we've exhausted b, add the rest of a
    if (j >= b.length) {
      result.push({ start: startA, end: endA })
      i++
      continue
    }

    const startB = b[j].start
    const endB = b[j].end

    if (endA <= startB) {
      // No overlap, a is before b
      result.push({ start: startA, end: endA })
      i++
    } else if (endB <= startA) {
      // No overlap, b is before a
      j++
    } else {
      // Overlap exists
      if (startA < startB) {
        result.push({ start: startA, end: startB })
      }
      if (endA > endB) {
        // Move a's start to the end of b and continue checking
        a[i].start = endB
        j++
      } else {
        // Move to the next range in a
        i++
      }
    }
  }

  return result
}

export function union(a: Range[], b: Range[]): Range[] {
  return normalizeRange([...a, ...b])
}

export function rangesInclude(ranges: Range[], position: number) {
  for (const range of ranges) {
    if (position >= range.start && position < range.end) {
      return true
    }
  }
  return false
}

export function getTableViewRangesFromColumns(view: TableView, ranges: Range[]): Ranges {
  const result: Ranges = {}

  const { segments } = view

  const intersection: [number, number] = [0, 0]

  for (const { start, end } of ranges) {
    const N = segments.start.length

    for (let sI = 0; sI < N; sI++) {
      const polymerName = segments.polymerName[sI]
      if (polymerName === null) continue

      const segStart = segments.start[sI]
      const segEnd = segments.end[sI]

      intersectOne(intersection, segStart, segEnd, start, end)
      if (intersection[0] >= intersection[1]) continue

      const deltaStart = intersection[0] - segStart
      const deltaEnd = intersection[1] - segStart

      const rangeStart = segments.rangeStart[sI] + deltaStart
      const rangeEnd = segments.rangeStart[sI] + deltaEnd

      result[polymerName] = result[polymerName] || []
      result[polymerName].push({
        start: rangeStart,
        end: rangeEnd,
      })
    }
  }

  return result
}

export function isEmptyRanges(range: Ranges): boolean {
  return Object.keys(range).length === 0
}

export function unionRanges(...ranges: Ranges[]): Ranges {
  const result: Ranges = {}

  for (const range of ranges) {
    for (const polymerName in range) {
      result[polymerName] = result[polymerName]
        ? union(result[polymerName] || [], range[polymerName])
        : range[polymerName]
    }
  }

  return result
}

export function intersectRanges(...ranges: Ranges[]): Ranges {
  let result: Ranges = ranges[0] || {}
  if (ranges.length <= 1) return result

  for (let i = 1; i < ranges.length; i++) {
    const current: Ranges = {}
    for (const polymerName in ranges[i]) {
      if (!result[polymerName]) continue
      current[polymerName] = intersect(ranges[i][polymerName], result[polymerName])
    }
    result = current
  }

  return result
}

export function subtractRanges(a: Ranges, b: Ranges): Ranges {
  const result: Ranges = {}

  for (const polymerName in a) {
    if (!(polymerName in b)) {
      result[polymerName] = a[polymerName]
      continue
    }
    const sub = subtract(a[polymerName], b[polymerName])
    if (sub.length > 0) result[polymerName] = sub
  }

  return result
}
