import type { CanvasModel } from "../model/canvas"
import { setupCanvasNavigation } from "./navigation"
import { setupCanvasSelection } from "./selection"
import { setupCanvasZooming } from "./zooming"

export function setupCanvasInteractions(canvas: CanvasModel, parent: HTMLElement) {
  setupCanvasNavigation(canvas, parent)
  setupCanvasZooming(canvas)
  setupCanvasSelection(canvas, parent)
}
