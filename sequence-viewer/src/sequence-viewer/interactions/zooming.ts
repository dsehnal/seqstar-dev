import { MIN_VIEWPORT_COLUMNS } from "../data/specification"
import type { CanvasModel } from "../model/canvas"
import { dragWrapper } from "../utils/interactions"

export function setupCanvasZooming(canvas: CanvasModel) {
  dragWrapper(canvas, canvas.slider.extendViewRight, {
    cursor: "ew-resize",
    project: canvas.getInteractionXY,
    onStart: (startX, startY) => {
      canvas.section.highlight(-1, startY)
      canvas.context.viewport.state.isUpdating.next(true)
      canvas.slider.columnOffset.style.cursor = "ew-resize"
      return { startX, startViewport: canvas.context.viewport.current }
    },
    onMove: (x, _, { startX, startViewport }) => {
      let delta = (x - startX) / canvas.section.columnWidth
      if (!canvas.context.spec.smoothScroll?.x) {
        delta = Math.round(delta)
      }
      let end = startViewport.range.end + delta
      const size = end - startViewport.range.start
      if (size < MIN_VIEWPORT_COLUMNS) {
        end = startViewport.range.start + MIN_VIEWPORT_COLUMNS
      }
      canvas.context.viewport.updateRange({ end })
    },
    onEnd: (x, y) => {
      canvas.context.viewport.state.isUpdating.next(false)
      canvas.section.highlight(x, y)
      canvas.slider.columnOffset.style.cursor = "grab"
    },
  })

  dragWrapper(canvas, canvas.slider.extendViewLeft, {
    cursor: "ew-resize",
    project: canvas.getInteractionXY,
    onStart: (startX, startY) => {
      canvas.section.highlight(-1, startY)
      canvas.context.viewport.state.isUpdating.next(true)
      canvas.slider.columnOffset.style.cursor = "ew-resize"
      return { startX, startViewport: canvas.context.viewport.current }
    },
    onMove: (x, _, { startX, startViewport }) => {
      let delta = (x - startX) / canvas.section.columnWidth
      if (!canvas.context.spec.smoothScroll?.x) {
        delta = Math.round(delta)
      }
      let start = startViewport.range.start + delta
      const size = startViewport.range.end - start
      if (size < MIN_VIEWPORT_COLUMNS) {
        start = startViewport.range.end - MIN_VIEWPORT_COLUMNS
      }
      canvas.context.viewport.updateRange({ start })
    },
    onEnd: (x, y) => {
      canvas.context.viewport.state.isUpdating.next(false)
      canvas.section.highlight(x, y)
      canvas.slider.columnOffset.style.cursor = "grab"
    },
  })

  canvas.event(canvas.root, "wheel", (e) => {
    e.preventDefault()
    if (!e.shiftKey || !canvas.isFull) return

    const zoomColumnWidth = canvas.section.columnWidth
    const zoomCenter = Math.floor(canvas.getInteractionX(e.clientX) / zoomColumnWidth)
    const f = e.deltaY > 0 ? 1.1 : 0.9
    const { start, end } = canvas.context.viewport.current.range
    let w = f * (end - start)
    if (!canvas.context.spec.smoothScroll?.x) {
      w = Math.round(w)
    }
    canvas.context.viewport.focusAt(zoomCenter, w)
  })
}
