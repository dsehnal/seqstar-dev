import { combineLatest, distinctUntilChanged, distinctUntilKeyChanged, map, Subject } from "rxjs"
import type { Context } from "../context"
import type { Layout, LayoutSection } from "../data/specification"
import type { SectionName } from "../data/types"
import { deepEqual } from "../utils/object"
import { ReactiveModel } from "../utils/reactive-model"
import { formatStyleValue } from "../utils/styles"

export class LayoutModel extends ReactiveModel {
  events = {
    updated: new Subject<number>(),
  }

  get current() {
    return this.context.spec.layout
  }

  private version = 0
  private parent: HTMLDivElement | null = null

  private sections: Record<string, LayoutSection> = {}

  private sync = () => {
    if (!this.parent) return

    const { layout: grid } = this.context.spec

    this.sections = {}

    const columns: string[] = []
    const rows: string[] = []
    const areas: string[] = []

    for (const col of grid.columns) {
      if (col.isHidden) continue
      columns.push(formatStyleValue(col.width ?? "auto", "px"))
    }

    for (const section of grid.sections) {
      this.sections[section.name] = section
      if (section.isHidden) continue
      const { height, maxHeight } = section

      if (!height && maxHeight) {
        const sectionModel = this.context.getSection(section.name)
        if (sectionModel) {
          const { baseTrackHeight } = sectionModel
          const { relativeTrackOffsets } = sectionModel.info
          const relativeHeight = relativeTrackOffsets[relativeTrackOffsets.length - 1] || 0
          const h = Math.min(relativeHeight * baseTrackHeight, maxHeight)
          rows.push(formatStyleValue(Math.max(0, h - 1), "px"))
        } else {
          rows.push("0px")
        }
      } else {
        rows.push(formatStyleValue(height ?? "auto", "px"))
      }

      const area: string[] = []
      for (const col of grid.columns) {
        if (col.isHidden) continue
        area.push(this.getAreaName(section.name, col.name))
      }
      areas.push(`"${area.join(" ")}"`)
    }

    this.parent.style.gridTemplateColumns = columns.join(" ")
    this.parent.style.gridTemplateRows = rows.join(" ")
    this.parent.style.gridTemplateAreas = areas.join("\n")

    this.version++
    this.events.updated.next(this.version)
  }

  mount(parent: HTMLDivElement) {
    this.parent = parent

    this.subscribe(
      combineLatest([
        this.context.state.spec.pipe(
          map((spec) => spec.layout),
          distinctUntilChanged((a, b) => deepEqual(a, b)),
        ),
        this.context.state.base.pipe(distinctUntilKeyChanged("data")),
      ]),
      this.sync,
    )
  }

  dispose(): void {
    super.dispose()
    this.parent = null
  }

  update(grid: Layout) {
    const current = this.context.spec.layout
    if (deepEqual(current, grid)) return

    this.context.state.spec.next({
      ...this.context.spec,
      layout: grid,
    })
  }

  getSectionIndex(name: string) {
    const { current } = this
    let idx = 0
    for (const section of current.sections) {
      if (section.isHidden) continue
      if (section.name === name) return idx
      idx++
    }
    return -1
  }

  getColumnIndex(name: string) {
    const { current } = this
    let idx = 0
    for (const col of current.columns) {
      if (col.isHidden) continue
      if (col.name === name) return idx
      idx++
    }
    return -1
  }

  getAreaName(section: string, column: string) {
    return `${section}-${column}`
  }

  isVisible(section: string | undefined, column: string | undefined) {
    let found = false
    if (section) {
      for (const sec of this.current.sections) {
        if (sec.name === section) {
          if (sec.isHidden) return false
          found = true
        }
      }

      if (!found) return false
    }

    if (column) {
      found = false
      for (const col of this.current.columns) {
        if (col.name === column) {
          if (col.isHidden) return false
          found = true
        }
      }
    }

    return found
  }

  getSpec(section: SectionName): LayoutSection | undefined {
    return this.sections[section]
  }

  constructor(private context: Context) {
    super()
  }
}
