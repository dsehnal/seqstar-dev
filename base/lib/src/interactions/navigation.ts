import { MIN_VIEWPORT_COLUMNS } from "../data/specification"
import type { CanvasModel } from "../model/canvas"
import { dragWrapper } from "../utils/interactions"

export function setupCanvasNavigation(canvas: CanvasModel, parent: HTMLElement) {
  canvas.event(parent, "wheel", canvas.section.wheelScroll)

  dragWrapper(canvas, canvas.slider.columnOffset, {
    cursor: "grabbing",
    project: canvas.getInteractionXY,
    onStart: (startX) => {
      canvas.context.viewport.state.isUpdating.next(true)
      canvas.slider.extendViewLeft.style.cursor = "grabbing"
      canvas.slider.extendViewRight.style.cursor = "grabbing"

      return { startX, startViewport: canvas.context.viewport.current }
    },
    onMove: (x, _, { startX, startViewport }) => {
      const delta = Math.round((x - startX) / canvas.section.columnWidth)
      canvas.context.viewport.pan(delta, startViewport)
    },
    onFirstMove: (_, y) => {
      canvas.section.highlight(-1, y)
    },
    onEnd: (x, y) => {
      canvas.context.viewport.state.isUpdating.next(false)
      canvas.section.highlight(x, y)
      canvas.slider.extendViewLeft.style.cursor = "ew-resize"
      canvas.slider.extendViewRight.style.cursor = "ew-resize"
    },
  })

  dragWrapper(canvas, canvas.root, {
    cursor: "grabbing",
    isEnabled: () => !canvas.isFull && canvas.context.state.interactionMode.value === "pan",
    project: canvas.getInteractionXY,
    onStart: (startX, startY) => {
      canvas.context.updateHighlight(undefined)
      canvas.context.viewport.state.isUpdating.next(true)
      const startViewport = canvas.context.viewport.current
      const currentWidth = startViewport.range.end - startViewport.range.start
      const fullWidth = canvas.context.dataView.current.view.width
      return {
        startX,
        startY,
        speedX: Math.max(Math.ceil(fullWidth / currentWidth) - 1, 1),
        startViewport,
        startOffset: canvas.section.state.value.trackOffset,
      }
    },
    onMove: (x, y, { startX, startY, speedX, startOffset, startViewport }) => {
      const colDelta = Math.round((speedX * (startX - x)) / canvas.section.columnWidth)
      canvas.context.viewport.pan(colDelta, startViewport)

      const { baseTrackHeight, info } = canvas.section
      const h = baseTrackHeight * info.averageRelativeTrackHeight
      const rowDelta = Math.round((4 * (startY - y)) / h)
      canvas.section.updateState({ trackOffset: startOffset + rowDelta })
    },
    onEnd: (x, y) => {
      canvas.context.viewport.state.isUpdating.next(false)
      canvas.section.highlight(x, y)
    },
  })

  let isMouseIn = false
  let prevInteractionMode: "default" | "pan" | undefined

  canvas.subscribe(canvas.context.state.interactionMode, (mode) => {
    if (canvas.isFull) return
    if (mode === "pan") {
      canvas.root.style.cursor = "grab"
    } else {
      canvas.root.style.cursor = "default"
    }
  })

  canvas.event(document, "keydown", (e) => {
    if (!isMouseIn || prevInteractionMode || e.key !== " ") return

    prevInteractionMode = canvas.context.state.interactionMode.value
    canvas.context.state.interactionMode.next("pan")
  })

  canvas.event(document, "keyup", () => {
    if (prevInteractionMode) {
      canvas.context.state.interactionMode.next(prevInteractionMode)
      prevInteractionMode = undefined
    }
  })

  canvas.event(canvas.root, "mouseenter", () => {
    isMouseIn = true
  })

  canvas.event(canvas.root, "mouseleave", () => {
    isMouseIn = false
  })

  canvas.event(canvas.root, "mousedown", (e) => {
    if (!canvas.isFull) return
    const column = Math.floor(canvas.getInteractionX(e.clientX) / canvas.section.columnWidth)
    canvas.context.viewport.focusAt(column, e.shiftKey ? 2 * MIN_VIEWPORT_COLUMNS : undefined)
  })

  canvas.event(canvas.slider.columnOffset, "dblclick", (e) => {
    e.preventDefault()
    const column = Math.floor(canvas.getInteractionX(e.clientX) / canvas.section.columnWidth)
    const max = canvas.context.dataView.current.view.width
    const current = canvas.context.viewport.current.range

    if (current.start === 0 && current.end === max) {
      canvas.context.viewport.focusAt(column, 2 * MIN_VIEWPORT_COLUMNS)
    } else {
      canvas.context.viewport.updateRange({ start: 0, end: max })
    }
  })
}
