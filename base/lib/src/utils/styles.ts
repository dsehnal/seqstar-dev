export const Styles = {
  absolute: {
    position: "absolute",
    top: "0",
    left: "0",
    right: "0",
    bottom: "0",
  } satisfies Partial<CSSStyleDeclaration>,
  pointerEventsNone: {
    pointerEvents: "none",
  } satisfies Partial<CSSStyleDeclaration>,
}

export function assignStyles(
  els: HTMLElement | HTMLElement[],
  styles:
    | keyof typeof Styles
    | Partial<CSSStyleDeclaration>
    | (keyof typeof Styles | Partial<CSSStyleDeclaration>)[],
) {
  for (const element of Array.isArray(els) ? els : [els]) {
    if (Array.isArray(styles)) {
      for (const style of styles) {
        if (typeof style === "string") {
          Object.assign(element.style, Styles[style])
        } else {
          Object.assign(element.style, style)
        }
      }
    } else {
      if (typeof styles === "string") {
        Object.assign(element.style, Styles[styles])
      } else {
        Object.assign(element.style, styles)
      }
    }
  }
}

export function createCanvas(parent?: HTMLDivElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  assignStyles(canvas, [Styles.absolute, { pointerEvents: "none" }])
  parent?.appendChild(canvas)
  return canvas
}

export function invalidateCanvasSize(canvas: HTMLCanvasElement, extraWidth: number): boolean {
  const parent = canvas.parentElement
  if (!parent) return false
  const dpr = window.devicePixelRatio || 1

  const { clientWidth, clientHeight } = parent
  const nextWidth = Math.round((clientWidth + extraWidth) * dpr)
  const nextHeight = Math.round(clientHeight * dpr)

  if (canvas.width === nextWidth && canvas.height === nextHeight) {
    return false
  }

  canvas.style.width = `${clientWidth + extraWidth}px`
  canvas.style.height = `${clientHeight}px`
  canvas.width = nextWidth
  canvas.height = nextHeight
  return true
}

export function formatStyleValue(value: string | number, unit: string) {
  return typeof value === "number" ? `${value}${unit}` : value
}
