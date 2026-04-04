import { MIN_VIEWPORT_COLUMNS } from "../data/specification"
import type { CanvasModel } from "../model/canvas"
import type { SectionModel } from "../model/section"
import { dragWrapper, normalizeWheel } from "../utils/interactions"

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
      let delta = (x - startX) / canvas.section.columnWidth
      if (!canvas.context.spec.smoothScroll?.x) {
        delta = Math.round(delta)
      }
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
      // TODO: Progressive X speed depending on distance from start?
      let colDelta = (speedX * (startX - x)) / canvas.section.columnWidth
      if (!canvas.context.spec.smoothScroll?.x) {
        colDelta = Math.round(colDelta)
      }
      canvas.context.viewport.pan(colDelta, startViewport)

      const { baseTrackHeight, info } = canvas.section
      const h = baseTrackHeight * info.averageRelativeTrackHeight
      let rowDelta = (4 * (startY - y)) / h
      if (!canvas.context.spec.smoothScroll?.y) {
        rowDelta = Math.round(rowDelta)
      }
      canvas.section.updateState({ trackOffset: startOffset + rowDelta })
    },
    onEnd: (x, y) => {
      canvas.context.viewport.state.isUpdating.next(false)
      canvas.section.highlight(x, y)
    },
  })

  dragWrapper(canvas, canvas.slider.rowOffset, {
    cursor: "grabbing",
    project: canvas.getInteractionXY,
    onStart: (_, startY) => {
      canvas.context.updateHighlight(undefined)
      canvas.context.viewport.state.isUpdating.next(true)
      return {
        startY,
        startOffset: canvas.section.state.value.trackOffset,
        info: canvas.getVerticalScrollControlInfo(),
      }
    },
    onMove: (_, y, { startY, startOffset, info }) => {
      const f = info.maxTrackOffset / (info.height - info.ctrlHeight)
      let delta = (y - startY) * f
      if (!canvas.context.spec.smoothScroll?.y) {
        delta = Math.round(delta)
      }
      canvas.section.updateState({ trackOffset: startOffset + delta })
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

export function createSectionWheelEventHandler(section: SectionModel) {
  return (e: {
    shiftKey: boolean
    preventDefault: () => void
    clientX: number
    clientY: number
  }) => {
    if (e.shiftKey) {
      return
    }

    e.preventDefault()

    const { baseTrackHeight } = section

    const baseHeight = section.info.averageRelativeTrackHeight * baseTrackHeight
    const { dy } = normalizeWheel(e, {
      lineHeight: baseHeight,
      pageHeight: section.info.averageRelativeTrackHeight * section.info.tracks.length,
    })

    const { dx } = normalizeWheel(e, {
      lineHeight: section.columnWidth,
      pageHeight: section.canvas.width,
    })

    if (dy && Math.abs(dy) > 2 * Math.abs(dx)) {
      if (section.getMaxTrackOffset() === 0) return

      let deltaY: number
      if (!section.context.spec.smoothScroll?.y) {
        deltaY = Math.ceil(Math.abs(dy)) * Math.sign(dy)
      } else {
        deltaY = ((Math.abs(dy) || baseHeight) / baseHeight) * Math.sign(dy)
      }
      section.updateState({
        trackOffset: Math.min(
          section.getMaxTrackOffset(),
          Math.max(0, section.state.value.trackOffset + deltaY),
        ),
      })
    } else if (dx && Math.abs(dx) > 2 * Math.abs(dy)) {
      let deltaX: number
      if (!section.context.spec.smoothScroll?.x) {
        deltaX = Math.ceil(Math.abs(dx)) * Math.sign(dx)
      } else {
        deltaX = ((Math.abs(dx) || section.columnWidth) / section.columnWidth) * Math.sign(dx)
      }
      section.context.viewport.pan(deltaX)
    } else {
      return
    }

    section.highlight(
      section.canvas.getInteractionX(e.clientX),
      section.canvas.getInteractionY(e.clientY),
    )
  }
}
