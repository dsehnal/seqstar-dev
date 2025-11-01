import type {
  PolymerPropertyGetter,
  RendererPropertyGetter,
  RenderFeatureFn,
  RenderFeatureOptions,
} from "../data/specification"
import { calcSequenceCellMetrics } from "./common"

type Params = {
  widthFactor: number
  color: string
  gapColor?: string
  glyphColor?: string
  getSequence: PolymerPropertyGetter<string | undefined>
  getColor?: PolymerPropertyGetter<string | undefined>
}

export function renderSequence(options: RenderFeatureOptions, params: Params) {
  const {
    section,
    monospaceTextMetrics,
    dpr,
    ctx2d,
    columnWidth,
    offsetX,
    offsetY,
    height,
    viewport,
    segment,
  } = options
  if (!segment.polymerName) return

  const { start, end, rangeStart } = segment
  const { start: viewportStart, end: viewportEnd } = viewport.range

  if (columnWidth < 10 || height < 8) {
    // for small cells, draw only dots

    const glyphSize = Math.min(2, columnWidth / 4, height / 4)

    for (let i = Math.max(start, viewportStart), _il = Math.min(end, viewportEnd); i < _il; i++) {
      const offset = i - start
      const position = rangeStart + offset
      const char = params.getSequence(segment.polymerName, position, options)
      if (!char || char === "-") continue
      ctx2d.fillStyle =
        params.getColor?.(segment.polymerName, position, options) ||
        params.glyphColor ||
        params.color

      ctx2d.fillRect(
        dpr * (offsetX + (i - viewportStart + 0.5) * columnWidth - glyphSize / 2),
        dpr * (offsetY + height / 2 - glyphSize / 2),
        dpr * glyphSize,
        dpr * glyphSize,
      )
    }

    return
  }

  ctx2d.textAlign = "center"
  ctx2d.textBaseline = "middle"

  const { theme } = section.context

  const { width: cellWidth, height: cellHeight } = calcSequenceCellMetrics(options)

  const baseTextHeight =
    (monospaceTextMetrics.hangingBaseline - monospaceTextMetrics.alphabeticBaseline) / dpr
  const baseTextWidth = monospaceTextMetrics.width / dpr

  const f = Math.min((0.5 * cellHeight) / baseTextHeight, (0.5 * cellWidth) / baseTextWidth, 1)
  theme.setFont(ctx2d, f, "monospace")

  for (let i = Math.max(start, viewportStart), _il = Math.min(end, viewportEnd); i < _il; i++) {
    const offset = i - start
    const position = rangeStart + offset
    const char = params.getSequence(segment.polymerName, position, options)
    if (!char) continue

    if (char === "-") {
      ctx2d.fillStyle = params.gapColor || params.color
    } else {
      ctx2d.fillStyle = params.getColor?.(segment.polymerName, position, options) || params.color
    }

    ctx2d.fillText(
      char,
      dpr * (offsetX + (i - viewportStart + 0.5) * columnWidth),
      dpr * (offsetY + height / 2 + 0.5),
    )
  }
}

export function createSequenceRenderer(getters: {
  widthFactor?: RendererPropertyGetter<number>
  defaultColor: RendererPropertyGetter<string>
  gapColor?: RendererPropertyGetter<string>
  glyphColor?: RendererPropertyGetter<string>
  sequence: RendererPropertyGetter<PolymerPropertyGetter<string | undefined>>
  color?: RendererPropertyGetter<PolymerPropertyGetter<string | undefined>>
}): RenderFeatureFn {
  const params: Params = {
    widthFactor: 0,
    color: "",
    gapColor: "",
    glyphColor: "",
    getSequence: () => "",
    getColor: () => undefined,
  }
  const getColorKey = `sequence-color-${Math.random()}`
  const getSequenceKey = `sequence-sequence-${Math.random()}`

  return (options: RenderFeatureOptions) => {
    params.widthFactor = getters.widthFactor?.(options) || 1
    params.color = getters.defaultColor(options)
    params.gapColor = getters.gapColor?.(options)
    params.glyphColor = getters.glyphColor?.(options)

    const getSequence = options.section.featureCache.tryGet(
      options.track,
      options.feature,
      getSequenceKey,
    )

    if (getSequence) {
      params.getSequence = getSequence
    } else {
      params.getSequence = getters.sequence?.(options)
      options.section.featureCache.set(
        options.track,
        options.feature,
        getSequenceKey,
        params.getSequence,
      )
    }
    const getColor = options.section.featureCache.tryGet(
      options.track,
      options.feature,
      getColorKey,
    )
    if (getColor) {
      params.getColor = getColor
    } else {
      params.getColor = getters.color?.(options)
      options.section.featureCache.set(options.track, options.feature, getColorKey, params.getColor)
    }

    renderSequence(options, params)
  }
}
