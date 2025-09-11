import { BehaviorSubject } from "rxjs"
import type { Context } from "../context"
import type { Viewport } from "../data"
import { MIN_VIEWPORT_COLUMNS } from "../data/specification"
import type { Ranges, TrackId } from "../data/types"
import { createTableView, createViewFromRanges } from "../utils/coordinates"
import { shallowEqual } from "../utils/object"
import { unionRanges } from "../utils/range"

export class ViewportModel {
  constructor(private context: Context) {}

  state = {
    isUpdating: new BehaviorSubject<boolean>(false),
  }

  get current() {
    return this.context.base.viewport
  }

  get maxWidth() {
    return this.context.base.dataView.current.view.width
  }

  get isUpdating() {
    return this.state.isUpdating.value
  }

  pan(delta: number, base?: Viewport) {
    if (!delta && !base) return

    const current = base || this.current
    const { maxWidth } = this

    let finalDelta = delta
    if (delta < 0 && -delta > current.range.start) {
      finalDelta = -current.range.start
    } else if (delta > 0 && delta > maxWidth - current.range.end) {
      finalDelta = maxWidth - current.range.end
    }

    this.updateRange({
      start: current.range.start + finalDelta,
      end: current.range.end + finalDelta,
    })
  }

  focusAt(center: number, width?: number) {
    const current = this.current

    let w = width ?? current.range.end - current.range.start
    w = Math.max(w, MIN_VIEWPORT_COLUMNS)
    if (w % 2 === 1) w++
    let start = center - w / 2
    let end = center + w / 2

    const { maxWidth } = this
    if (start < 0) {
      end = Math.min(Math.max(end - start, MIN_VIEWPORT_COLUMNS), maxWidth)
      start = 0
    }

    if (end > maxWidth) {
      start = Math.max(start - (end - maxWidth), 0)
      end = maxWidth
    }

    this.updateRange({ start, end })
  }

  updateRange(update: Partial<Viewport["range"]>) {
    const currentRange = this.current.range
    const newRange = { ...currentRange, ...update }

    const { maxWidth } = this
    if (newRange.end > maxWidth) newRange.end = maxWidth
    if (newRange.start < 0) newRange.start = 0

    if (!shallowEqual(currentRange, newRange)) {
      this.context.updateBaseState({ viewport: { range: newRange } })
    }
  }

  setRangeView(ranges: Ranges) {
    const cs = this.context.coordinateSystem
    const view = createViewFromRanges(cs, ranges)
    const tableView = createTableView(cs, view)

    this.context.state.selection.next([])
    this.context.updateBaseState({
      dataView: {
        ...this.context.dataView,
        current: tableView,
      },
      viewport: { range: { start: 0, end: view.width } },
    })
  }

  focusTrack(id: TrackId) {
    const track = this.context.track.get(id)
    if (!track || track.features.length < 1) return

    const ranges = track.features.map((f) => this.context.getFeature(f)?.ranges).filter((f) => !!f)
    if (!ranges.length) return
    this.setRangeView(unionRanges(...ranges))
  }

  resetView = () => {
    const tableView = this.context.dataView.default
    this.context.state.selection.next([])
    this.context.updateBaseState({
      dataView: {
        ...this.context.dataView,
        current: tableView,
      },
      viewport: {
        range: { start: 0, end: Math.min(2 * MIN_VIEWPORT_COLUMNS, tableView.view.width) },
      },
    })
  }
}
