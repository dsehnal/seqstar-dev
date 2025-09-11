import type {
  RendererPropertyGetter,
  RenderFeatureFn,
  RenderFeatureOptions,
} from "../data/specification"

type Params = {
  relativeFrequency: number
  textColor: string
  tickColor: string
}

export function renderNavigation(options: RenderFeatureOptions, params: Params) {
  const { section, dpr, ctx2d, columnWidth, offsetY, height, viewport, segment } = options
  if (!segment.polymerName) return

  const { start, end, rangeStart } = segment
  const { start: viewportStart, end: viewportEnd } = viewport.range

  const viewWidth = viewportEnd - viewportStart
  const frequency = 100 * params.relativeFrequency * Math.max(1, Math.round(viewWidth / 100))
  const halfFrequency = Math.floor(frequency / 2)

  ctx2d.textAlign = "left"
  ctx2d.textBaseline = "middle"
  ctx2d.fillStyle = params.textColor

  const { theme } = section.context

  const width = Math.min(end, viewportEnd) - Math.max(start, viewportStart)
  theme.setFont(ctx2d, 3 / 4, "ui")
  const nameMeasure = ctx2d.measureText(segment.polymerName)

  if (width * columnWidth > nameMeasure.width + 2) {
    ctx2d.fillText(
      segment.polymerName,
      dpr * ((Math.max(start, viewportStart) - viewportStart) * columnWidth + 1),
      dpr * (offsetY + height / 6 + 3),
    )
  }

  theme.setFont(ctx2d, 1, "ui")

  const rangeSize = end - start
  const isSmall = rangeSize < frequency

  ctx2d.textAlign = "center"
  ctx2d.strokeStyle = params.tickColor
  const startIndex = Math.max(start, viewportStart)
  const endIndex = Math.min(end, viewportEnd)
  for (let i = startIndex, _il = endIndex; i < _il; i++) {
    const offset = i - start
    const position = rangeStart + offset
    const isFirst = i === startIndex
    const isLast = i === endIndex - 1

    if (isFirst || isLast || position % frequency === 0 || position % halfFrequency === 0) {
      // Ticks
      ctx2d.beginPath()
      ctx2d.moveTo(dpr * ((i - viewportStart + 0.5) * columnWidth), dpr * (offsetY + height - 4))
      ctx2d.lineTo(dpr * ((i - viewportStart + 0.5) * columnWidth), dpr * (offsetY + height))
      ctx2d.stroke()
    }

    if (!isSmall && position % frequency !== 0) continue
    if (isSmall && !isLast && !isFirst) continue

    let labelOffset = 0.5
    if (isFirst) {
      const measure = ctx2d.measureText(`${position + 1}`)
      if (measure.width > columnWidth * dpr) {
        ctx2d.textAlign = "left"
        labelOffset = 0.1
      } else {
        ctx2d.textAlign = "center"
      }
    } else if (isLast) {
      const measure = ctx2d.measureText(`${position + 1}`)

      if (measure.width > columnWidth * dpr) {
        ctx2d.textAlign = "right"
        labelOffset = 0.9
      } else {
        ctx2d.textAlign = "center"
      }
    } else {
      ctx2d.textAlign = "center"
    }

    ctx2d.fillText(
      `${position + 1}`,
      dpr * ((i - viewportStart + labelOffset) * columnWidth),
      dpr * (offsetY + (2 * height) / 3),
    )
  }
}

export function createNavigationRenderer(getters?: {
  relativeFrequency?: RendererPropertyGetter<number>
  textColor?: RendererPropertyGetter<string>
  tickColor?: RendererPropertyGetter<string>
}): RenderFeatureFn {
  const params: Params = {
    relativeFrequency: 20,
    textColor: "#4B5563",
    tickColor: "rgb(229, 231, 235)",
  }

  return (options: RenderFeatureOptions) => {
    params.relativeFrequency = getters?.relativeFrequency?.(options) ?? 0.1
    params.textColor = getters?.textColor?.(options) ?? "#4B5563"
    params.tickColor = getters?.tickColor?.(options) ?? "rgb(229, 231, 235)"
    renderNavigation(options, params)
  }
}
