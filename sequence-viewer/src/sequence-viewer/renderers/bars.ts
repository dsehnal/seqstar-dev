import type {
  PolymerPropertyGetter,
  RendererPropertyGetter,
  RenderFeatureFn,
  RenderFeatureOptions,
} from "../data/specification"

type Params = {
  widthFactor: number
  heightFactor: number
  defaultColor: string
  range: [number, number]
  getValue: PolymerPropertyGetter<number>
  getColor?: PolymerPropertyGetter<string | undefined>
}

export function renderBars(options: RenderFeatureOptions, params: Params) {
  const { dpr, ctx2d, columnWidth, offsetX, offsetY, height, viewport, segment } = options
  if (!segment.polymerName) return

  const w = params.widthFactor * columnWidth

  const { start, end, rangeStart } = segment
  const [min, max] = params.range

  const baseHeight = params.heightFactor * height
  const heightOffset = (height - baseHeight) / 2

  for (let i = start; i < end; i++) {
    if (i < viewport.range.start) continue
    if (i >= viewport.range.end) break

    const position = i - start + rangeStart

    let value = params.getValue(segment.polymerName, position, options)
    ctx2d.fillStyle =
      params.getColor?.(segment.polymerName, position, options) || params.defaultColor

    if (typeof value !== "number") continue
    if (value < min) value = min
    if (value > max) value = max

    const h = (baseHeight * (value - min)) / (max - min)

    ctx2d.fillRect(
      dpr * (offsetX + (i - viewport.range.start + 0.5) * columnWidth - w / 2),
      dpr * (offsetY + height - h - heightOffset),
      dpr * (w + 1),
      dpr * h,
    )
  }
}

export function createBarsRenderer(getters: {
  widthFactor: RendererPropertyGetter<number>
  heightFactor?: RendererPropertyGetter<number>
  defaultColor: RendererPropertyGetter<string>
  range: RendererPropertyGetter<[number, number]>
  value: RendererPropertyGetter<PolymerPropertyGetter<number>>
  color?: RendererPropertyGetter<PolymerPropertyGetter<string | undefined>>
}): RenderFeatureFn {
  const params: Params = {
    widthFactor: 0,
    heightFactor: 1,
    defaultColor: "",
    getValue: () => 0,
    getColor: () => undefined,
    range: [0.1, 0.1] as [number, number],
  }
  const getValueKey = `bars-value-${Math.random()}`
  const getColorKey = `bars-color-${Math.random()}`

  return (options: RenderFeatureOptions) => {
    params.widthFactor = getters.widthFactor(options)
    params.heightFactor = getters.heightFactor?.(options) || 1
    params.defaultColor = getters.defaultColor(options)

    const getValue = options.section.featureCache.tryGet(
      options.track,
      options.feature,
      getValueKey,
    )
    if (getValue) {
      params.getValue = getValue
    } else {
      params.getValue = getters.value(options)
      options.section.featureCache.set(options.track, options.feature, getValueKey, params.getValue)
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

    params.range = getters.range(options)
    renderBars(options, params)
  }
}
