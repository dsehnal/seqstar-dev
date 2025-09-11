import type { RenderFeatureFn, RenderGapFn } from "../data/specification"
import { createBlockRenderer } from "./block"
import { createGapRenderer } from "./gap"

export const DefaultFeatureRenderer: RenderFeatureFn = createBlockRenderer({
  heightFactor: () => 0.6,
  backgroundColor: () => "white",
  borderColor: () => "red",
  getLabel: ({ feature, segment }) =>
    `${feature.kind}: [${segment.polymerName ?? "-"}:${segment.start + 1}-${segment.end}]`,
  getLabelColor: () => "black",
})

export const DefaultGapRenderer: RenderGapFn = createGapRenderer({
  color: () => "rgba(0, 0, 0, 0.15)",
})
