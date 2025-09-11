import type {
  PolymerPropertyGetter,
  RendererPropertyGetter,
  RenderFeatureFn,
  RenderFeatureOptions,
} from "../data/specification"
import { calcSequenceCellMetrics } from "./common"

type Params = {
  getColor: PolymerPropertyGetter<string | undefined>
}

export function renderSwatch(options: RenderFeatureOptions, params: Params) {
  const { dpr, ctx2d, columnWidth, offsetY, height, viewport, segment } = options
  if (!segment.polymerName) return

  const { start, end, rangeStart } = segment
  const { start: viewportStart, end: viewportEnd } = viewport.range
  const { width: cellWidth, height: cellHeight } = calcSequenceCellMetrics(options)

  for (let i = Math.max(start, viewportStart), _il = Math.min(end, viewportEnd); i < _il; i++) {
    const offset = i - start
    const position = rangeStart + offset
    const color = params.getColor(segment.polymerName, position, options)
    if (!color) continue
    ctx2d.fillStyle = color

    ctx2d.fillRect(
      dpr * ((i - viewportStart + 0.5) * columnWidth - cellWidth / 2),
      dpr * (offsetY + height / 2 - cellHeight / 2),
      dpr * cellWidth,
      dpr * cellHeight,
    )
  }
}

export function createSwatchRenderer(getters: {
  color: RendererPropertyGetter<PolymerPropertyGetter<string | undefined>>
}): RenderFeatureFn {
  const params: Params = {
    getColor: () => undefined,
  }
  const getColorKey = `sequence-color-${Math.random()}`

  return (options: RenderFeatureOptions) => {
    const getColor = options.section.featureCache.tryGet(
      options.track,
      options.feature,
      getColorKey,
    )
    if (getColor) {
      params.getColor = getColor as any
    } else {
      params.getColor = getters.color?.(options)
      options.section.featureCache.set(options.track, options.feature, getColorKey, params.getColor)
    }

    renderSwatch(options, params)
  }
}
