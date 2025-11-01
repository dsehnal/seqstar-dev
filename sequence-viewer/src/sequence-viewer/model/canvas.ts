import { combineLatest, distinctUntilKeyChanged, filter } from "rxjs"
import type { RenderFeatureOptions } from "../data/specification"
import type { Range } from "../data/types"
import { setupCanvasInteractions } from "../interactions"
import { DefaultFeatureRenderer, DefaultGapRenderer } from "../renderers/defaults"
import { getSegmentIndex, getSegmentIndexRange } from "../utils/coordinates"
import { immediatePromise } from "../utils/immediate"
import { intersectOne } from "../utils/range"
import { ReactiveModel } from "../utils/reactive-model"
import { assignStyles, createCanvas, invalidateCanvasSize } from "../utils/styles"
import type { SectionModel } from "./section"

const CANVAS_PADDING = 8
const MIN_HORIZONTAL_SCROLL_HEIGHT = 36

export class CanvasModel extends ReactiveModel {
  constructor(section: SectionModel) {
    super()

    this.section = section

    const { theme } = section.context.spec

    assignStyles(this.root, ["absolute", { left: `${CANVAS_PADDING}px`, right: `12px` }])
    assignStyles(this.trackCanvasParent, ["absolute"])

    assignStyles(
      [this.slider.extendViewLeft, this.slider.extendViewRight, this.slider.columnOffset],
      {
        display: "none",
        position: "absolute",
        top: "0",
        bottom: "0",
      },
    )
    assignStyles([this.slider.extendViewLeft, this.slider.extendViewRight], {
      cursor: "ew-resize",
      backgroundColor: "transparent",
      width: "4px",
    })
    assignStyles(this.slider.columnOffset, {
      borderWidth: "1.5px",
      borderStyle: "solid",
      borderColor: theme.horizontalCanvasSliderBorderColor,
      cursor: "grab",
    })
    assignStyles(
      [this.slider.leftColumnOverlay, this.slider.rightColumnOverlay],
      [
        {
          position: "absolute",
          top: "0",
          bottom: "0",
          display: "none",
          backgroundColor: theme.horizontalCanvasSliderOverlayColor,
          pointerEvents: "none",
        },
      ],
    )
    assignStyles(this.slider.rowOffset, {
      display: "none",
      position: "absolute",
      top: "0",
      width: `${CANVAS_PADDING}px`,
      right: "0",
      backgroundColor: theme.verticalCanvasSliderColor,
      cursor: "grab",
    })

    assignStyles([this.canvas.borders, this.canvas.selection], {
      left: `-${CANVAS_PADDING}px`,
    })

    this.root.appendChild(this.trackCanvasParent)

    this.trackCanvasParent.appendChild(this.canvas.tracks)
    this.trackCanvasParent.appendChild(this.canvas.borders)
    this.root.appendChild(this.canvas.selection)

    this.root.appendChild(this.slider.leftColumnOverlay)
    this.root.appendChild(this.slider.rightColumnOverlay)
    this.root.appendChild(this.slider.columnOffset)
    this.root.appendChild(this.slider.extendViewLeft)
    this.root.appendChild(this.slider.extendViewRight)
  }

  readonly section: SectionModel
  readonly root = document.createElement("div")
  readonly trackCanvasParent = document.createElement("div")
  readonly canvas = {
    tracks: createCanvas(),
    borders: createCanvas(),
    selection: createCanvas(),
  }

  readonly slider = {
    leftColumnOverlay: document.createElement("div"),
    rightColumnOverlay: document.createElement("div"),

    columnOffset: document.createElement("div"),
    extendViewLeft: document.createElement("div"),
    extendViewRight: document.createElement("div"),

    rowOffset: document.createElement("div"),
  }

  private invalidateSize() {
    const changed = invalidateCanvasSize(this.canvas.tracks, 0)
    invalidateCanvasSize(this.canvas.selection, CANVAS_PADDING)
    invalidateCanvasSize(this.canvas.borders, CANVAS_PADDING)

    if (!changed) return

    this.isDirty.tracks = true
    this.isDirty.selection = true
    this.isDirty.slider = true

    this.section.resized()
  }

  private isDirty = {
    tracks: false,
    selection: false,
    slider: false,
  }

  get context() {
    return this.section.context
  }

  get totalHeight() {
    return this.root.getBoundingClientRect().height
  }

  get canvasHeight() {
    const padding = this.context.layout.getSpec(this.section.name)?.verticalPadding ?? 0
    return this.root.getBoundingClientRect().height - padding * 2
  }

  get width() {
    return this.root.getBoundingClientRect().width
  }

  get isFull() {
    return this.section.view === "full"
  }

  mount(parent: HTMLDivElement) {
    parent.appendChild(this.root)
    parent.appendChild(this.slider.rowOffset)

    this.subscribe(this.context.state.spec, () => {
      const padding = this.context.layout.getSpec(this.section.name)?.verticalPadding ?? 0
      assignStyles(this.trackCanvasParent, [
        "absolute",
        { top: `${padding}px`, bottom: `${padding}px` },
      ])
    })

    // This must be before the next one because of the !this.full condition
    this.subscribe(
      combineLatest([
        this.section.state,
        this.context.state.base.pipe(distinctUntilKeyChanged("viewport")),
      ]),
      () => {
        this.isDirty.tracks = !this.isFull
        this.isDirty.selection = true
        this.isDirty.slider = true
      },
    )

    let syncedSectionVersion = -1
    this.subscribe(
      combineLatest([
        this.context.state.base.pipe(distinctUntilKeyChanged("dataView")),
        this.context.state.base.pipe(
          filter(() => this.section.info.dataVersion !== syncedSectionVersion),
        ),
        this.context.state.spec,
      ]),
      () => {
        syncedSectionVersion = this.section.info.dataVersion
        this.isDirty.tracks = true
        this.isDirty.selection = true
        this.isDirty.slider = true
      },
    )

    this.subscribe(
      combineLatest([this.context.state.highlight, this.context.state.selection]),
      () => {
        this.isDirty.selection = true
      },
    )

    this.subscribe(this.context.state.spec.pipe(distinctUntilKeyChanged("theme")), (spec) => {
      const { theme } = spec
      assignStyles(this.slider.columnOffset, {
        borderColor: theme.horizontalCanvasSliderBorderColor,
      })
      assignStyles(this.slider.rowOffset, { backgroundColor: theme.verticalCanvasSliderColor })
      assignStyles([this.slider.leftColumnOverlay, this.slider.rightColumnOverlay], {
        backgroundColor: theme.horizontalCanvasSliderOverlayColor,
      })
    })

    this.section.resized()
    setupCanvasInteractions(this, parent)
  }

  getInteractionXY = (out: [number, number], clientX: number, clientY: number) => {
    const rect = this.root.getBoundingClientRect()
    out[0] = clientX - rect.left
    out[1] = clientY - rect.top - this.section.verticalPadding
  }

  getInteractionX(clientX: number) {
    const rect = this.root.getBoundingClientRect()
    return clientX - rect.left
  }

  getInteractionY(clientY: number) {
    const rect = this.root.getBoundingClientRect()
    return clientY - rect.top - this.section.verticalPadding
  }

  dispose(): void {
    super.dispose()
    this.root.remove()
    this.slider.rowOffset.remove()
  }

  private currentRenderId = 0
  render() {
    this.invalidateSize()

    this.currentRenderId++
    this.renderTracks(this.currentRenderId)
    this.renderSlider()
    this.renderSelection()
  }

  getVerticalScrollControlInfo() {
    const maxTrackOffset = this.section.getMaxTrackOffset()
    const { totalHeight: height } = this
    if (maxTrackOffset > 0) {
      const offsets = this.section.info.relativeTrackOffsets
      return {
        maxTrackOffset,
        ctrlHeight: Math.max(
          MIN_HORIZONTAL_SCROLL_HEIGHT,
          (1 - maxTrackOffset / offsets.length) * height,
        ),
        height,
      }
    }
    return { maxTrackOffset: 0, ctrlHeight: 0, height }
  }

  private renderSelection() {
    if (!this.isDirty.selection) return
    this.isDirty.selection = false

    const canvas = this.canvas.selection
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const highlight = this.context.state.highlight.value
    const selection = this.context.state.selection.value
    if (typeof highlight?.column !== "number" && !highlight?.trackId && selection.length === 0)
      return

    const dpr = window.devicePixelRatio || 1
    const { trackOffset } = this.section.state.value
    const { tracks } = this.section.info
    const {
      columnWidth,
      viewRange: fractionalViewRange,
      baseTrackHeight,
      spec,
      verticalPadding,
    } = this.section
    const { canvasHeight: height, isFull } = this
    const { current: currentView } = this.context.base.dataView
    const { theme } = this.context.spec
    const { range: viewportRange } = this.context.viewport.current

    const viewRange: Range = {
      start: Math.floor(fractionalViewRange.start),
      end: Math.ceil(fractionalViewRange.end),
    }
    const offsetX = -(fractionalViewRange.start - viewRange.start) * columnWidth

    // Render vertical selection rectangles
    const selectionSegment: [number, number] = [0, 0]
    for (const range of selection) {
      if (spec?.trackStyle?.hideSelection) continue

      const N = currentView.segments.start.length
      for (let sI = 0; sI < N; sI++) {
        if (currentView.segments.polymerName[sI] === null) continue

        const viewStart = currentView.segments.start[sI]
        const viewEnd = currentView.segments.end[sI]

        intersectOne(selectionSegment, viewStart, viewEnd, range.start, range.end)

        if (selectionSegment[0] >= selectionSegment[1]) continue

        const [start, end] = selectionSegment

        if (!isFull && (end <= viewportRange.start || start >= viewportRange.end)) {
          continue
        }

        ctx.fillStyle = theme.selectColumnColor
        ctx.strokeStyle = theme.selectColumnBorderColor
        ctx.lineWidth = 0.25 * dpr

        let left = CANVAS_PADDING + offsetX + (start - viewRange.start) * columnWidth - 0.25
        let width = columnWidth * (end - start) + 0.5

        if (left < CANVAS_PADDING) {
          width -= CANVAS_PADDING - left
          left = CANVAS_PADDING
        }

        ctx.fillRect(dpr * left, 0, dpr * width, canvas.height)
        ctx.strokeRect(dpr * left, -2 * dpr, dpr * width, canvas.height + dpr * 4)
      }
    }

    // Render currently highlighted column
    if (
      typeof highlight.column === "number" &&
      highlight.column >= viewRange.start &&
      highlight.column < viewRange.end
    ) {
      const segmentIndex = getSegmentIndex(currentView.segments, highlight.column)
      if (currentView.segments.polymerName[segmentIndex]) {
        ctx.fillStyle = theme.highlightColumnColor
        let left =
          CANVAS_PADDING + offsetX + (highlight.column - viewRange.start) * columnWidth + 0.5
        let width = columnWidth
        if (left < CANVAS_PADDING) {
          width -= CANVAS_PADDING - left
          left = CANVAS_PADDING
        }
        ctx.fillRect(dpr * left, 0, dpr * width, canvas.height)
      }
    }

    if (!highlight.trackId) return

    // Render currently highlighted row
    ctx.fillStyle = theme.highlightRowColor
    let offsetY = this.section.verticalPadding + this.section.baseRowOffset
    for (let i = Math.floor(trackOffset); i < tracks.length; i++) {
      const track = tracks[i]

      const h = (track.heightFactor ?? 1) * baseTrackHeight

      if (track.id === highlight.trackId) {
        const heightOffset = spec?.trackStyle?.borders ? 1 : 0

        if (this.isFull) {
          // Render highlighted row outside the slider window
          ctx.fillStyle = theme.highlightRowColor
          ctx.fillRect(
            0,
            dpr * offsetY,
            dpr * (columnWidth * viewportRange.start + CANVAS_PADDING - 4),
            dpr * (h - heightOffset),
          )
          ctx.fillRect(
            dpr * (columnWidth * viewportRange.end + CANVAS_PADDING + 4),
            dpr * offsetY,
            dpr * (columnWidth * (viewRange.end - viewportRange.end) + CANVAS_PADDING),
            dpr * (h - heightOffset),
          )

          // Render highlighted row inside the slider window
          ctx.fillStyle = theme.highlightRowInSliderColor
          ctx.fillRect(
            dpr * (columnWidth * viewportRange.start + CANVAS_PADDING - 4),
            dpr * offsetY,
            dpr * (columnWidth * (viewportRange.end - viewportRange.start) + 8),
            dpr * (h - heightOffset),
          )
        } else {
          ctx.fillStyle = theme.highlightRowColor
          ctx.fillRect(0, dpr * offsetY, canvas.width, dpr * (h - heightOffset))
        }

        break
      }

      offsetY += h
      if (offsetY >= height + verticalPadding || i === tracks.length - 1) break
    }
  }

  private renderSlider() {
    if (!this.isDirty.slider) return
    this.isDirty.slider = false

    // Update state of horizontal and vertical sliders

    const { maxTrackOffset, ctrlHeight, height } = this.getVerticalScrollControlInfo()

    if (maxTrackOffset > 0 && this.section.info.tracks.length > 1) {
      const { trackOffset } = this.section.state.value
      const top = (trackOffset / maxTrackOffset) * (height - ctrlHeight)

      assignStyles(this.slider.rowOffset, {
        display: "block",
        height: `${ctrlHeight}px`,
        top: `${top}px`,
      })
    } else {
      assignStyles(this.slider.rowOffset, {
        display: "none",
      })
    }

    if (!this.isFull) {
      this.slider.columnOffset.style.display = "none"
      this.slider.extendViewLeft.style.display = "none"
      this.slider.extendViewRight.style.display = "none"
      this.slider.leftColumnOverlay.style.display = "none"
      this.slider.rightColumnOverlay.style.display = "none"
      return
    }

    const { columnWidth } = this.section
    const { start, end } = this.context.viewport.current.range

    assignStyles(this.slider.columnOffset, {
      display: "block",
      left: `${start * columnWidth - 4}px`,
      width: `${(end - start) * columnWidth + 8}px`,
    })

    assignStyles(this.slider.extendViewLeft, {
      display: "block",
      left: `${start * columnWidth - 4}px`,
    })

    assignStyles(this.slider.extendViewRight, {
      display: "block",
      left: `${end * columnWidth}px`,
    })

    assignStyles(this.slider.leftColumnOverlay, {
      display: "block",
      left: `${-CANVAS_PADDING}px`,
      width: `${start * columnWidth + CANVAS_PADDING - 4}px`,
    })

    assignStyles(this.slider.rightColumnOverlay, {
      display: "block",
      left: `${end * columnWidth + 4}px`,
      right: "0",
    })
  }

  private currentTrackRenderId = 0
  private visibleOffsets: number[] = []
  private renderMask: number[] = []
  private async renderTracks(renderId: number) {
    if (!this.isDirty.tracks) return
    this.isDirty.tracks = false

    // Because the track rendering is asynchronous, we need to keep track of the current render ID
    // to be able to cancel old renders
    this.currentTrackRenderId = renderId

    const ctx = this.canvas.tracks.getContext("2d")
    const bordersCtx = this.canvas.borders.getContext("2d")
    if (!ctx || !bordersCtx) return

    // Clear the canvas
    ctx.clearRect(0, 0, this.canvas.tracks.width, this.canvas.tracks.height)

    // Borders are drawn on a separate canvas due to padding around the default one
    bordersCtx.clearRect(0, 0, this.canvas.borders.width, this.canvas.borders.height)

    const { context, totalHeight: height } = this
    const { trackOffset } = this.section.state.value
    const { tracks } = this.section.info
    const { columnWidth, viewRange: fractionalViewRange, baseTrackHeight, spec } = this.section
    const { theme, defaultRenderer, gapRenderer } = this.context.spec
    const { segments: viewSegments } = this.context.dataView.current
    const { isUpdating: isViewportUpdating } = this.context.viewport

    const dpr = window.devicePixelRatio || 1

    // default to visible colors to make bugs in color assignment more apparent
    ctx.fillStyle = "red"
    ctx.strokeStyle = "red"

    this.context.theme.setFont(ctx, 1, "monospace")

    const viewRange: Range = {
      start: Math.floor(fractionalViewRange.start),
      end: Math.ceil(fractionalViewRange.end),
    }
    const offsetX = -(fractionalViewRange.start - viewRange.start) * columnWidth

    // Set up the feature render options
    const renderOptions: RenderFeatureOptions = {
      section: this.section,
      track: undefined as any,
      feature: undefined as any,
      data: this.context.base.data,
      ctx2d: ctx,
      columnWidth,
      offsetX,
      offsetY: 0,
      height: 0,
      dpr,
      monospaceTextMetrics: ctx.measureText("A"),
      viewport: {
        range: viewRange,
      },
      segment: {
        polymerName: "",
        start: 0,
        end: 0,
        rangeEnd: 0,
        rangeStart: 0,
      },
      stackDepth: 0,
      maxStackDepth: 0,
    }

    let startTime = performance.now()
    const maxRenderTime = isViewportUpdating ? 1000 / 90 : 1000 / 15

    let offsetY = this.section.baseRowOffset
    this.visibleOffsets.length = 0

    const baseTrackIndex = Math.floor(trackOffset)

    // Identify all tracks that need to be rendered
    for (let i = baseTrackIndex; i < tracks.length; i++) {
      const track = tracks[i]
      const h = (track.heightFactor ?? 1) * baseTrackHeight
      this.visibleOffsets.push(offsetY)
      offsetY += h
      if (offsetY >= height) break
    }

    // Reset the render mask
    if (this.renderMask.length !== this.visibleOffsets.length) {
      this.renderMask.length = this.visibleOffsets.length
    }
    this.renderMask.fill(0)

    const segmentIndexRange: [number, number] = [0, 0]
    const maxDepth = Math.ceil(
      this.visibleOffsets.length > 0 ? Math.log2(this.visibleOffsets.length) : 0,
    )

    const defaultRenderers = [defaultRenderer ?? DefaultFeatureRenderer]
    const renderGap = gapRenderer ?? DefaultGapRenderer

    let nRendered = 0
    // The tracks are rendered progressively in a binary-tree-like pattern
    // This looks a lot better than sequential rendering due to the renders
    // being interrupted to keep the app inteaction responsive for large dataset
    for (let depth = 0; depth <= maxDepth; depth++) {
      const stride = Math.ceil(this.renderMask.length / 2 ** depth)
      for (let i = 0; i < this.renderMask.length; i += stride) {
        if (this.renderMask[i]) continue
        this.renderMask[i] = 1
        nRendered++

        const trackIndex = i + baseTrackIndex
        if (trackIndex >= tracks.length) break

        const track = tracks[trackIndex]
        const h = (track.heightFactor ?? 1) * baseTrackHeight
        offsetY = this.visibleOffsets[i]

        renderOptions.track = track
        renderOptions.offsetY = offsetY
        renderOptions.height = h

        // Draw gaps between view ranges as dashes
        if (track.options?.drawGaps) {
          renderOptions.stackDepth = 0
          renderOptions.maxStackDepth = 0
          renderOptions.segment.rangeStart = 0
          renderOptions.segment.rangeEnd = 0
          renderOptions.segment.polymerName = ""

          const N = viewSegments.start.length
          for (let sI = 0; sI < N; sI++) {
            if (viewSegments.polymerName[sI]) continue

            intersectOne(
              segmentIndexRange,
              viewSegments.start[sI],
              viewSegments.end[sI],
              viewRange.start,
              viewRange.end,
            )

            const [start, end] = segmentIndexRange
            if (start >= end) continue

            renderOptions.segment.start = start
            renderOptions.segment.end = end
            renderGap(renderOptions)
          }
        }

        // Draw all track features within the view range
        for (const fId of track.features) {
          const f = context.getFeature(fId)
          if (!f) continue
          const view = this.section.featureCache.getView(track, f)
          if (!view) continue

          renderOptions.feature = f

          const renderers = this.context.spec.featureRenderers[f.kind] ?? defaultRenderers
          getSegmentIndexRange(segmentIndexRange, view.segments, viewRange)

          for (let sI = segmentIndexRange[0]; sI < segmentIndexRange[1]; sI++) {
            const start = view.segments.start[sI]
            const end = view.segments.end[sI]

            renderOptions.stackDepth = view.stackDepth
            renderOptions.maxStackDepth = view.maxStackDepth

            // Adjust for stacking
            const maxStackDepth = view.maxStackDepth
            if (maxStackDepth > 0) {
              const splitH = h / (maxStackDepth + 1)
              renderOptions.offsetY = offsetY + view.stackDepth * splitH
              renderOptions.height = splitH
            } else {
              renderOptions.offsetY = offsetY
              renderOptions.height = h
            }

            renderOptions.segment.start = start
            renderOptions.segment.end = end
            renderOptions.segment.rangeStart = view.segments.rangeStart[sI]
            renderOptions.segment.rangeEnd = view.segments.rangeEnd[sI]
            renderOptions.segment.polymerName = view.segments.polymerName[sI] || ""

            for (const r of renderers) {
              r(renderOptions)
            }
          }
        }

        // Render borders between tracks
        if (h > 8 && spec?.trackStyle?.borders) {
          bordersCtx.lineWidth = 1 * dpr
          bordersCtx.strokeStyle = theme.borderColor
          bordersCtx.beginPath()
          bordersCtx.moveTo(0, dpr * (offsetY + h - 0.5))
          bordersCtx.lineTo(this.canvas.borders.width, dpr * (offsetY + h - 0.5))
          bordersCtx.stroke()
        }

        // Throttle rendering to improve performance
        if (nRendered % 32 === 0) {
          const now = performance.now()
          const elapsed = now - startTime
          if (elapsed > maxRenderTime) {
            startTime = now
            await immediatePromise()
            // Cancel the render if it has been superseeded
            if (this.currentTrackRenderId !== renderId) {
              return
            }
          }
        }
      }
    }
  }
}
