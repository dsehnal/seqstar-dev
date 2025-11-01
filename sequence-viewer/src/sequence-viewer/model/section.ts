import { BehaviorSubject, Subject } from "rxjs"
import type { Context } from "../context"
import type { Feature, Track } from "../data"
import type { FeatureTableView } from "../data/coordinates"
import type { LayoutSection } from "../data/specification"
import type { SectionName, TrackId } from "../data/types"
import { createSectionWheelEventHandler } from "../interactions/navigation"
import { assignStacking, getFeatureTableView } from "../utils/coordinates"
import { memoizeLatest, shallowEqual } from "../utils/object"
import { ReactiveModel } from "../utils/reactive-model"
import { CanvasModel } from "./canvas"

interface SectionInfo {
  dataVersion: number
  tracks: Track[]
  relativeTrackOffsets: number[]
  averageRelativeTrackHeight: number
  trackIds: Set<TrackId>
  trackCache: Map<
    string,
    {
      views: Map<Feature, FeatureTableView>
      general: Map<Feature, Record<string, any>>
    }
  >
}

interface SectionModelState {
  trackOffset: number
}

export class SectionModel extends ReactiveModel {
  constructor(context: Context, name: SectionName) {
    super()

    this.context = context
    this.name = name
    this.canvas = new CanvasModel(this)

    this.subscribe(this.context.state.spec, () => {
      this.checkTrackOffset()
    })
  }

  readonly context: Context
  readonly name: SectionName
  readonly canvas: CanvasModel

  state = new BehaviorSubject<SectionModelState>({
    trackOffset: 0,
  })

  events = {
    resized: new Subject<number>(),
  }

  readonly info: SectionInfo = {
    dataVersion: 0,
    tracks: [],
    relativeTrackOffsets: [],
    averageRelativeTrackHeight: 1,
    trackIds: new Set(),
    trackCache: new Map(),
  }

  get view() {
    return this.context.layout.getSpec(this.name)?.horizontalView
  }

  get baseTrackHeight() {
    const spec = this.context.layout.getSpec(this.name)
    const base = spec?.trackStyle?.baseHeight ?? this.context.layout.current.baseTrackHeight
    let f = 1
    if (spec?.verticalView === "full") {
      const { canvasHeight: height } = this.canvas
      const { relativeTrackOffsets } = this.info
      const relativeHeight = relativeTrackOffsets[relativeTrackOffsets.length - 1] || 1
      f = height / (base * relativeHeight || 1)
    }

    return f * base
  }

  get spec() {
    return this.context.layout.getSpec(this.name)
  }

  get columnWidth() {
    const canvasWidth = this.canvas.width
    let columnCount: number
    if (this.view !== "full") {
      const wp = this.context.viewport.current
      columnCount = Math.ceil(Math.round(100 * (wp.range.end - wp.range.start)) / 100)
    } else {
      columnCount = this.context.viewport.maxWidth
    }
    return canvasWidth / (columnCount || 1)
  }

  get verticalPadding() {
    return this.context.layout.getSpec(this.name)?.verticalPadding ?? 0
  }

  get viewRange() {
    return this.view === "full"
      ? { start: 0, end: this.context.dataView.current.view.width }
      : this.context.viewport.current.range
  }

  get baseColumnOffset() {
    if (this.view === "full" || !this.context.spec.smoothScroll?.x) return 0
    return -((this.viewRange.start - Math.floor(this.viewRange.start)) * this.columnWidth)
  }

  get baseRowOffset() {
    if (!this.context.spec.smoothScroll?.y) return 0
    const { trackOffset } = this.state.value
    const rowIndex = Math.floor(this.state.value.trackOffset)
    if (rowIndex < 0 || rowIndex >= this.info.tracks.length) return 0
    const f = this.info.tracks[rowIndex] ?? 0
    const height = this.baseTrackHeight * (f.heightFactor ?? 1)
    return -(trackOffset - rowIndex) * height
  }

  updateState(update: Partial<SectionModelState>) {
    const next = { ...this.state.value, ...update }
    if (!this.context.spec.smoothScroll?.y) {
      next.trackOffset = Math.round(next.trackOffset)
    }
    next.trackOffset = Math.min(this.getMaxTrackOffset(), Math.max(0, next.trackOffset))
    if (!shallowEqual(this.state.value, next)) {
      this.state.next(next)
    }
  }

  setTracks(trackIds: TrackId[], trackMap: ReadonlyMap<TrackId, Track>, forceClear: boolean) {
    const tracks: Track[] = []

    for (const id of trackIds) {
      const track = trackMap.get(id)
      if (track) {
        tracks.push(track)
      }
    }

    if (this.info.tracks.length === tracks.length && !forceClear) {
      let equal = true
      for (let i = 0; i < tracks.length; i++) {
        if (this.info.tracks[i] !== tracks[i]) {
          equal = false
          break
        }
      }
      if (equal) return
    }

    this.info.dataVersion++
    this.info.trackIds.clear()
    this.info.tracks = tracks
    this.info.relativeTrackOffsets.length = 0
    this.info.averageRelativeTrackHeight = 0
    let offset = 0
    this.info.relativeTrackOffsets.push(0)
    for (const track of tracks) {
      this.info.trackIds.add(track.id)
      const f = track.heightFactor ?? 1
      offset += f
      this.info.averageRelativeTrackHeight += f
      this.info.relativeTrackOffsets.push(offset)
      this.info.trackCache.set(track.id, {
        views: new Map(),
        general: new Map(),
      })
    }
    this.info.averageRelativeTrackHeight /= tracks.length || 1
    if (this.info.averageRelativeTrackHeight < 0.1) this.info.averageRelativeTrackHeight = 0.1

    this.checkTrackOffset()
  }

  checkTrackOffset() {
    const maxTrackOffset = this.getMaxTrackOffset()
    if (this.state.value.trackOffset > maxTrackOffset) {
      this.updateState({ trackOffset: maxTrackOffset })
    }
  }

  private sizeVersion = 0
  resized() {
    this.sizeVersion++
    this.events.resized.next(this.sizeVersion)
  }

  private _getMaxTrackOffset = memoizeLatest(
    (height: number, baseTrackHeight: number, tracks: Track[]) => {
      let offset = 0
      for (let i = tracks.length - 1; i >= 0; i--) {
        offset += baseTrackHeight * (tracks[i].heightFactor ?? 1)
        if (offset > height + 1) {
          return i + 1
        }
      }
      return 0
    },
  )

  getMaxTrackOffset() {
    const { canvasHeight: height } = this.canvas
    const { baseTrackHeight } = this
    return this._getMaxTrackOffset(height, baseTrackHeight, this.info.tracks)
  }

  scrollToTrack(id: string) {
    // Apply scroll in the next animation frame so all changes propagate
    requestAnimationFrame(() => {
      const trackOffset = this.info.tracks.findIndex((track) => track.id === id)
      if (trackOffset < 0) return
      this.updateState({ trackOffset })
    })
  }

  featureCache = {
    clear: () => {
      this.info.trackCache.forEach((cache) => {
        cache.general.clear()
        cache.views.clear()
      })
    },
    getView: (track: Track, feature: Feature) => {
      const views = this.info.trackCache.get(track.id)?.views
      if (!views) return

      if (views.has(feature)) {
        return views.get(feature)
      }

      if (track.options?.stackFeatures && track.features.length > 1) {
        const stackedViews: FeatureTableView[] = []
        for (const fId of track.features) {
          const f = this.context.getFeature(fId)
          if (!f) continue
          const view = getFeatureTableView(
            this.context.data.coordinateSystem,
            this.context.dataView.current,
            f,
          )
          views.set(f, view)
          stackedViews.push(view)
        }
        assignStacking(stackedViews)
        return views.get(feature)
      }

      const view = getFeatureTableView(
        this.context.data.coordinateSystem,
        this.context.dataView.current,
        feature,
      )
      views.set(feature, view)
      return view
    },
    tryGet: (track: Track, feature: Feature, key: string) => {
      const cache = this.info.trackCache.get(track.id)
      return cache?.general.get(feature)?.[key]
    },
    set: (track: Track, feature: Feature, key: string, value: any) => {
      const cache = this.info.trackCache.get(track.id)?.general
      if (!cache) return

      if (!cache.has(feature)) {
        cache.set(feature, { [key]: value })
      } else {
        cache.get(feature)![key] = value
      }
    },
  }

  track = {
    isExpanded: (track: Track) => {
      if (!track.children?.length) return false
      for (const childId of track.children) {
        if (this.info.trackIds.has(childId)) return true
      }
      return false
    },
    expandTrackIds: (track: Track, action: "expand" | "collapse"): TrackId[] | undefined => {
      if (!track.children?.length) return

      const { tracks } = this.info
      const newTrackIds: TrackId[] = []
      for (const t of tracks) {
        if (!this.context.track.hasParent(track, t.id)) {
          newTrackIds.push(t.id)
        }

        if (action === "collapse" || t.id !== track.id) continue

        for (const childId of track.children) {
          newTrackIds.push(childId)
        }
      }

      return newTrackIds
    },
  }

  wheelScroll = createSectionWheelEventHandler(this)

  private _getVisibleTracks = memoizeLatest(
    (
      trackOffset: number,
      tracks: Track[],
      height: number,
      baseTrackHeight: number,
      baseRowOffset: number,
      spec: LayoutSection | undefined,
    ) => {
      const visibleTracks: Track[] = []
      const offsets: number[] = []

      let offsetY = baseRowOffset + (spec?.verticalPadding ?? 0)
      for (let i = Math.floor(trackOffset); i < tracks.length; i++) {
        const track = tracks[i]
        visibleTracks.push(track)
        offsets.push(offsetY)
        offsetY += baseTrackHeight * (track.heightFactor ?? 1)
        if (offsetY > height) break
      }

      return { tracks: visibleTracks, offsets }
    },
  )

  get visibleTracks() {
    return this._getVisibleTracks(
      this.state.value.trackOffset,
      this.info.tracks,
      this.canvas.canvasHeight,
      this.baseTrackHeight,
      this.baseRowOffset,
      this.spec,
    )
  }

  render() {
    this.canvas.render()
  }

  getTrackIdFromY(localY: number) {
    const { baseRowOffset } = this
    if (localY < baseRowOffset) return

    const { trackOffset } = this.state.value
    const { tracks } = this.info
    const { baseTrackHeight } = this

    let offsetY = baseRowOffset
    for (let i = Math.floor(trackOffset); i < tracks.length; i++) {
      const h = baseTrackHeight * (tracks[i].heightFactor ?? 1)
      const start = offsetY
      const end = offsetY + h
      if (localY >= start && localY < end) {
        return tracks[i].id
      }
      offsetY += h
    }
  }

  highlight(localX: number, localY: number) {
    const { columnWidth, viewRange, baseColumnOffset: offsetX } = this
    const start = Math.floor(viewRange.start)

    let column: number | undefined = Math.floor((localX - offsetX) / columnWidth)

    const { maxWidth } = this.context.viewport
    if (column < 0 || column >= maxWidth) {
      column = undefined
    } else {
      column += start
    }

    if (typeof column === "number" && this.view !== "full") {
      if (column < start || column >= viewRange.end) {
        column = undefined
      }
    }

    const { totalHeight: height } = this.canvas
    if (localY < 0 || localY > height) {
      this.context.updateHighlight({ column, sectionName: this.name })
      return
    }

    const trackId = this.getTrackIdFromY(localY)
    this.context.updateHighlight({ column, trackId, sectionName: this.name })
  }
}
