import { BehaviorSubject } from "rxjs"
import type { BaseState, Data, Feature, Track } from "./data"
import type { ColumnSelection, Highlight } from "./data/coordinates"
import { MIN_VIEWPORT_COLUMNS, type Spec } from "./data/specification"
import type { FeatureId, SectionName, TrackId } from "./data/types"
import { InteractionModel } from "./model/interaction"
import { LayoutModel } from "./model/layout"
import { SectionModel } from "./model/section"
import { ViewportModel } from "./model/viewport"
import { createDefaultView, createTableView } from "./utils/coordinates"
import { deepEqual, shallowEqual } from "./utils/object"
import { getTableViewRangesFromColumns } from "./utils/range"
import { ReactiveModel } from "./utils/reactive-model"

const EmptyCoordinateSystem = {
  polymers: [],
  polymerGap: 0,
}

const EmptyTableView = createTableView(
  EmptyCoordinateSystem,
  createDefaultView(EmptyCoordinateSystem),
)

const DefaultState: BaseState = {
  data: {
    coordinateSystem: EmptyCoordinateSystem,
    features: [],
    tracks: [],
    sections: {},
  },
  dataView: {
    default: EmptyTableView,
    current: EmptyTableView,
  },
  viewport: {
    range: {
      start: 0,
      end: 0,
    },
  },
}

const EmptyHighlight: Highlight = {}

export class Context extends ReactiveModel {
  constructor(defaultSpec: Spec) {
    super()
    this.state.spec.next(defaultSpec)
  }

  state = {
    base: new BehaviorSubject<
      BaseState & { sections: Record<SectionName, SectionModel | undefined> }
    >({ ...DefaultState, sections: {} }),
    spec: new BehaviorSubject<Spec>(undefined as any),
    highlight: new BehaviorSubject<Highlight>(EmptyHighlight),
    selection: new BehaviorSubject<ColumnSelection>([]),
    interactionMode: new BehaviorSubject<"default" | "pan">("default"),
  }

  private _sections: SectionModel[] = []
  private _renderFrame: number | undefined = undefined
  private _featureMap: Map<FeatureId, Feature> = new Map()
  private _trackMap: Map<TrackId, Track> = new Map()
  private _trackParentMap: Map<TrackId, TrackId> = new Map()

  readonly viewport = new ViewportModel(this)
  readonly layout = new LayoutModel(this)
  readonly interaction = new InteractionModel(this)

  get spec() {
    return this.state.spec.value
  }

  get coordinateSystem() {
    return this.state.base.value.data.coordinateSystem
  }

  get base() {
    return this.state.base.value
  }

  get data() {
    return this.base.data
  }

  get dataView() {
    return this.base.dataView
  }

  get interactionMode() {
    return this.state.interactionMode.value
  }

  get highlight() {
    return this.state.highlight.value
  }

  getSection(name: SectionName) {
    return this.base.sections[name]
  }

  getSelectedRanges() {
    return getTableViewRangesFromColumns(this.dataView.current, this.state.selection.value)
  }

  updateBaseState(updates: Partial<Omit<BaseState, "data">>) {
    const next: BaseState = {
      ...this.state.base.value,
      ...updates,
    }

    if (next.dataView !== this.dataView) {
      for (const s of this._sections) {
        s.featureCache.clear()
      }
    }

    this.state.base.next({
      ...this.state.base.value,
      ...updates,
    })
  }

  setData(data: Data) {
    const currentSections = this.base.sections
    const sections: SectionModel[] = []
    const sectionMap: Record<SectionName, SectionModel> = {}
    this._featureMap.clear()
    this._trackMap.clear()
    this._trackParentMap.clear()

    for (const f of data.features) {
      this._featureMap.set(f.id, f)
    }

    for (const t of data.tracks) {
      this._trackMap.set(t.id, t)
      if (t.children) {
        for (const child of t.children) {
          this._trackParentMap.set(child, t.id)
        }
      }
    }

    const forceClearTracks = this.base.data.custom !== data.custom

    for (const [sectionName, trackIds] of Object.entries(data.sections)) {
      const sectionModel = this.getSection(sectionName) ?? new SectionModel(this, sectionName)
      sectionModel.setTracks(trackIds, this._trackMap, forceClearTracks)
      sections.push(sectionModel)
      sectionMap[sectionName] = sectionModel
    }
    const oldSections = this._sections.filter((section) => !currentSections[section.name])
    for (const section of oldSections) {
      section.dispose()
    }
    this._sections = sections

    const view = createDefaultView(data.coordinateSystem)
    const tableView = createTableView(data.coordinateSystem, view)

    this.state.highlight.next(EmptyHighlight)

    const coordinateSystemChanged = !deepEqual(
      this.base.data.coordinateSystem,
      data.coordinateSystem,
    )

    if (coordinateSystemChanged) {
      this.state.selection.next([])
      this.state.base.next({
        ...this.state.base.value,
        data,
        dataView: { default: tableView, current: tableView },
        viewport: { range: { start: 0, end: Math.min(2 * MIN_VIEWPORT_COLUMNS, view.width) } },
        sections: sectionMap,
      })
    } else {
      this.state.base.next({
        ...this.state.base.value,
        data,
        sections: sectionMap,
      })
    }
  }

  updateHighlight(highlight: Highlight | undefined) {
    if (!shallowEqual(this.state.highlight.value, highlight ?? EmptyHighlight)) {
      this.state.highlight.next(highlight ?? EmptyHighlight)
    }
  }

  track = {
    get: (id: TrackId | undefined) => {
      if (!id) return
      return this._trackMap.get(id)
    },
    getParent: (id: TrackId | undefined) => {
      if (!id) return
      return this._trackParentMap.get(id)
    },
    getDepth: (id: TrackId | undefined) => {
      if (!id) return 0
      const track = this._trackMap.get(id)
      if (!track) return 0
      let depth = 0
      let parent = this._trackParentMap.get(id)
      while (parent) {
        depth++
        parent = this._trackParentMap.get(parent)
      }
      return depth
    },
    hasParent: (parent: Track, id: TrackId) => {
      let currentId = this._trackParentMap.get(id)
      while (currentId) {
        if (currentId === parent.id) return true
        currentId = this._trackParentMap.get(currentId)
      }
      return false
    },
    expand: (id: TrackId, sectionNames: SectionName[], action: "expand" | "collapse") => {
      const track = this.track.get(id)
      if (!track) return

      const update: Record<SectionName, TrackId[]> = {}

      for (const section of sectionNames) {
        const model = this.getSection(section)
        if (!model) continue
        const trackIds = model.track.expandTrackIds(track, action)
        if (trackIds) {
          update[section] = trackIds
        }
      }

      if (!Object.keys(update).length) return

      this.setData({
        ...this.data,
        sections: {
          ...this.data.sections,
          ...update,
        },
      })
    },
    remove: (id: TrackId | undefined, setData?: (data: Data) => void) => {
      const track = this.track.get(id)
      if (!track) return

      const { data } = this.base
      const featureIds = new Set(track.features)

      const nextData: Data = {
        ...data,
        features: track.children?.length
          ? data.features
          : data.features.filter((f) => !featureIds.has(f.id)),
        tracks: data.tracks.filter((t) => t.id !== track.id),
        sections: {
          ...data.sections,
        },
      }

      for (const sectionName of Object.keys(nextData.sections)) {
        const section = nextData.sections[sectionName]
        if (!section?.includes(track.id)) continue
        nextData.sections[sectionName] = section.filter((t) => t !== track.id)
      }

      if (setData) {
        setData(nextData)
      } else {
        this.setData(nextData)
      }
    },
  }

  getFeature(id: FeatureId | undefined) {
    if (!id) return
    return this._featureMap.get(id)
  }

  theme = {
    setFont: (ctx: CanvasRenderingContext2D, factor: number, kind: "ui" | "monospace") => {
      const dpr = window.devicePixelRatio || 1
      const family =
        kind === "monospace" ? this.spec.theme.monospaceFontFamily : this.spec.theme.uiFontFamily
      ctx.font = `${dpr * factor * this.spec.theme.baseFontSizePx}px ${family}`
    },
  }

  mount() {
    this.render()
  }

  render = () => {
    for (const section of this._sections) {
      section.render()
    }
    this._renderFrame = requestAnimationFrame(this.render)
  }

  dispose(): void {
    super.dispose()
    if (this._renderFrame !== undefined) {
      cancelAnimationFrame(this._renderFrame)
      this._renderFrame = undefined
    }
  }
}
