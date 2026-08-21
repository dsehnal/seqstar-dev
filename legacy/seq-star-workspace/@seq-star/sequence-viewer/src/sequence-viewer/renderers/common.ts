import type { RenderFeatureOptions } from "../data/specification"

export interface SequenceCellMetrics {
  width: number
  height: number
}

const _sequenceCellMetrics = {
  width: 0,
  height: 0,
}

export function calcSequenceCellMetrics(renderOptions: RenderFeatureOptions): SequenceCellMetrics {
  const { columnWidth, height, section } = renderOptions

  const factor = section.context.spec.theme.baseFontSizePx * 1.5
  let margin = (4 * (Math.sqrt(columnWidth * height) - factor)) / factor
  if (margin < 0.75) margin = 0
  else if (margin > 4) margin = 4

  if (height < 8) {
    _sequenceCellMetrics.height = height
  } else {
    _sequenceCellMetrics.height = Math.min(height - 2 * margin, columnWidth)
  }
  _sequenceCellMetrics.width = columnWidth - margin

  return _sequenceCellMetrics
}
