import type { ReactiveModel } from "./reactive-model"

export function dragWrapper<State>(
  model: ReactiveModel,
  element: HTMLElement,
  options: {
    cursor: string
    isEnabled?: () => boolean
    project?: (out: [x: number, y: number], clientX: number, clientY: number) => void
    onStart: (x: number, y: number, e: MouseEvent) => State
    onFirstMove?: (x: number, y: number, state: State, e: MouseEvent) => void
    onMove: (x: number, y: number, state: State, e: MouseEvent) => void
    onEnd?: (x: number, y: number, state: State, e: MouseEvent) => void
  },
) {
  const pos: [number, number] = [0, 0]

  const setPosition = (e: MouseEvent) => {
    if (options.project) {
      options.project(pos, e.clientX, e.clientY)
    } else {
      pos[0] = e.clientX
      pos[1] = e.clientY
    }
  }

  model.event(element, "mousedown", (e) => {
    if (options.isEnabled && !options.isEnabled()) return

    if (!e.shiftKey) e.stopPropagation()

    const prevUserSelect = document.body.style.userSelect
    const prevCursor = element.style.cursor
    let firstMove = false

    document.body.style.userSelect = "none"
    document.body.style.setProperty("cursor", options.cursor, "important")
    element.style.cursor = options.cursor

    setPosition(e)
    const state = options.onStart(pos[0], pos[1], e)

    const windowMove = model.event(window, "mousemove", (e) => {
      setPosition(e)
      options.onMove(pos[0], pos[1], state, e)

      if (!firstMove) {
        firstMove = true
        options.onFirstMove?.(pos[0], pos[1], state, e)
      }
    })

    const windowUp = model.event(window, "mouseup", (e) => {
      document.body.style.userSelect = prevUserSelect
      document.body.style.setProperty("cursor", null)
      element.style.cursor = prevCursor
      setPosition(e)
      options.onEnd?.(pos[0], pos[1], state, e)
      windowMove()
      windowUp()
    })
  })
}

// Adapted from https://stackoverflow.com/a/30134826
// License: https://creativecommons.org/licenses/by-sa/3.0/
// biome-ignore lint/suspicious/noExplicitAny: ...
export function normalizeWheel(event: any, options?: { lineHeight: number; pageHeight: number }) {
  // Reasonable defaults
  const PIXEL_STEP = 10
  const LINE_HEIGHT = options?.lineHeight ?? 40
  const PAGE_HEIGHT = options?.pageHeight ?? 800
  let spinX = 0
  let spinY = 0
  let dx = 0
  let dy = 0
  let dz = 0

  // Legacy
  if ("detail" in event) {
    spinY = event.detail
  }
  if ("wheelDelta" in event) {
    spinY = -event.wheelDelta / 120
  }
  if ("wheelDeltaY" in event) {
    spinY = -event.wheelDeltaY / 120
  }
  if ("wheelDeltaX" in event) {
    spinX = -event.wheelDeltaX / 120
  }

  // side scrolling on FF with DOMMouseScroll
  if ("axis" in event && event.axis === event.HORIZONTAL_AXIS) {
    spinX = spinY
    spinY = 0
  }

  dx = spinX * PIXEL_STEP
  dy = spinY * PIXEL_STEP

  if ("deltaY" in event) {
    dy = event.deltaY
  }
  if ("deltaX" in event) {
    dx = event.deltaX
  }
  if ("deltaZ" in event) {
    dz = event.deltaZ
  }

  if ((dx || dy || dz) && event.deltaMode) {
    if (event.deltaMode === 1) {
      // delta in LINE units
      dx *= LINE_HEIGHT
      dy *= LINE_HEIGHT
      dz *= LINE_HEIGHT
    } else {
      // delta in PAGE units
      dx *= PAGE_HEIGHT
      dy *= PAGE_HEIGHT
      dz *= PAGE_HEIGHT
    }
  }

  // Fall-back if spin cannot be determined
  if (dx && !spinX) {
    spinX = dx < 1 ? -1 : 1
  }
  if (dy && !spinY) {
    spinY = dy < 1 ? -1 : 1
  }

  return { spinX, spinY, dx, dy, dz }
}
