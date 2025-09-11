import type { RenderFeatureOptions, RenderGapFn } from "../data/specification"

type Params = {
  color: string
}

export function drawGap(
  {
    ctx2d,
    dpr,
    columnWidth,
    height,
    offsetY,
    segment,
    viewport,
  }: Omit<RenderFeatureOptions, "feature">,
  { color }: Params,
) {
  const gapHeight = height < 2 ? 0.33 * height : columnWidth > 4 ? 2 : 1
  const { start, end } = segment
  ctx2d.fillStyle = color
  ctx2d.fillRect(
    dpr * ((start - viewport.range.start + 1 / 3) * columnWidth + 0.5),
    dpr * (offsetY + height / 2 - gapHeight / 2),
    dpr * ((end - start - 2 / 3) * columnWidth - 1),
    dpr * gapHeight,
  )
}

export function createGapRenderer(getters?: {
  color?: (options: Omit<RenderFeatureOptions, "feature">) => string
}): RenderGapFn {
  const params: Params = {
    color: "rgba(0, 0, 0, 0.25)",
  }
  return (options) => {
    params.color = getters?.color?.(options) ?? "rgba(0, 0, 0, 0.25)"
    drawGap(options, params)
  }
}
