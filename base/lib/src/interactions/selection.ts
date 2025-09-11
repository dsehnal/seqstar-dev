import type { Range } from "../data/types"
import type { CanvasModel } from "../model/canvas"
import { dragWrapper } from "../utils/interactions"
import { deepEqual } from "../utils/object"
import { rangesInclude, subtract, union } from "../utils/range"

export function setupCanvasSelection(canvas: CanvasModel, parent: HTMLElement) {
  canvas.event(parent, "mouseleave", () => {
    if (canvas.context.viewport.isUpdating) return
    canvas.context.updateHighlight(undefined)
  })

  const interactionXY: [number, number] = [0, 0]
  canvas.event(parent, "mousemove", (e) => {
    if (canvas.context.viewport.isUpdating) return

    canvas.getInteractionXY(interactionXY, e.clientX, e.clientY)
    const localX = interactionXY[0]
    const localY = interactionXY[1]
    canvas.section.highlight(localX, localY)
  })

  dragWrapper(canvas, canvas.root, {
    cursor: "default",
    isEnabled: () => !canvas.isFull && canvas.context.interactionMode === "default",
    project: canvas.getInteractionXY,
    onStart: (startX, _, e) => {
      const startColumn =
        canvas.context.viewport.current.range.start +
        Math.floor(startX / canvas.section.columnWidth)
      const baseSelection = canvas.context.state.selection.value
      const action = !e.shiftKey
        ? ("set" as const)
        : rangesInclude(baseSelection, startColumn)
          ? ("subtract" as const)
          : ("union" as const)
      applySelectionAction(canvas, action, baseSelection, startColumn, startColumn)
      return { startColumn, action, baseSelection }
    },
    onMove: (x, _, { startColumn, action, baseSelection }) => {
      const endColumn =
        canvas.context.viewport.current.range.start + Math.floor(x / canvas.section.columnWidth)
      applySelectionAction(canvas, action, baseSelection, startColumn, endColumn)
    },
    onEnd: (x, _, { startColumn, action, baseSelection }) => {
      if (action !== "set") return

      const endColumn =
        canvas.context.viewport.current.range.start + Math.floor(x / canvas.section.columnWidth)
      applySelectionAction(
        canvas,
        endColumn - startColumn ? "set" : "toggle",
        baseSelection,
        startColumn,
        endColumn,
      )
    },
  })

  canvas.event(canvas.root, "dblclick", () => {
    if (canvas.isFull) return
    canvas.context.state.selection.next([])
  })
}

function applySelectionAction(
  canvas: CanvasModel,
  action: "union" | "subtract" | "set" | "toggle",
  base: Range[],
  start: number,
  end: number,
) {
  const range: Range[] = [
    {
      start: Math.min(start, end),
      end: Math.max(start, end) + 1,
    },
  ]

  if (action === "toggle" && deepEqual(base, range)) {
    canvas.context.state.selection.next([])
    return
  }

  if (action === "set" || action === "toggle") {
    canvas.context.state.selection.next(range)
    return
  }

  const next = action === "union" ? union(base, range) : subtract(base, range)
  canvas.context.state.selection.next(next)
}
