import type {
  RendererPropertyGetter,
  RenderFeatureFn,
  RenderFeatureOptions,
} from "../data/specification"

type Params = {
  heightFactor: number
  backgroundColor: string | undefined
  borderColor: string | undefined
  label: string | undefined
  labelColor: string | undefined
}

export function renderBlock(options: RenderFeatureOptions, params: Params) {
  const {
    dpr,
    ctx2d,
    columnWidth,
    offsetX,
    offsetY,
    height,
    viewport,
    segment,
    section,
    stackDepth,
    maxStackDepth,
  } = options
  const { start, end } = segment

  const h = params.heightFactor * height
  const nGaps = maxStackDepth + 2
  const blockHeight = (maxStackDepth + 1) * h
  const gapSize = ((maxStackDepth + 1) * height - blockHeight) / nGaps
  const left =
    offsetX + (start - viewport.range.start + params.heightFactor / 2) * columnWidth + 0.5
  const width = (end - start - params.heightFactor) * columnWidth - 1

  let top: number
  if (stackDepth === 0) {
    top = gapSize
  } else {
    const localOffsetY = (stackDepth + 1) * gapSize + stackDepth * h
    top = localOffsetY - stackDepth * height
  }

  if (params.backgroundColor) {
    ctx2d.fillStyle = params.backgroundColor
    ctx2d.fillRect(dpr * left, dpr * (offsetY + top - 0.5), dpr * width, dpr * (h + 1))
  }

  if (params.borderColor) {
    ctx2d.lineWidth = 1 * dpr
    ctx2d.strokeStyle = params.borderColor
    ctx2d.strokeRect(dpr * left, dpr * (offsetY + top - 0.5), dpr * width, dpr * (h + 1))
  }

  if (!params.label || height < 7) return

  const { theme, spec } = section.context

  const baseFontSize = spec.theme.baseFontSizePx
  ctx2d.fillStyle = params.labelColor ?? "#000"

  let f = Math.min((0.9 * h) / baseFontSize, 1)
  theme.setFont(ctx2d, f, "ui")

  const measure = ctx2d.measureText(params.label)
  const availableWidth = dpr * ((end - start) * columnWidth - 4)

  if (measure.width > availableWidth) {
    f *= (0.9 * availableWidth) / measure.width
    if (f < 0.2) return
    theme.setFont(ctx2d, f, "ui")
  }

  ctx2d.textAlign = "center"
  ctx2d.textBaseline = "middle"
  ctx2d.fillText(
    params.label,
    dpr * (offsetX + (start + (end - start) / 2 - viewport.range.start) * columnWidth),
    dpr * (offsetY + top + h / 2 + 0.5),
  )
}

export function createBlockRenderer(getters: {
  heightFactor: RendererPropertyGetter<number>
  backgroundColor?: RendererPropertyGetter<string | undefined>
  borderColor?: RendererPropertyGetter<string | undefined>
  getLabel?: RendererPropertyGetter<string | undefined>
  getLabelColor?: RendererPropertyGetter<string | undefined>
}): RenderFeatureFn {
  const params: Params = {
    heightFactor: 0,
    backgroundColor: undefined,
    borderColor: undefined,
    label: undefined,
    labelColor: undefined,
  }
  return (options: RenderFeatureOptions) => {
    params.heightFactor = getters.heightFactor(options)
    params.backgroundColor = getters.backgroundColor?.(options)
    params.borderColor = getters.borderColor?.(options)
    params.label = getters.getLabel?.(options)
    params.labelColor = getters.getLabelColor?.(options)

    renderBlock(options, params)
  }
}
