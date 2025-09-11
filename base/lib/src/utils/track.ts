import type { Feature, Track } from "../data"
import type { CoordinateSystem } from "../data/coordinates"
import { uuid22 } from "./object"

export function navigationTrack(
  coordinates: CoordinateSystem,
  options?: { id?: string; heightFactor?: number },
) {
  const feature: Feature = {
    id: uuid22(),
    kind: "navigation",
    ranges: {
      light: [{ start: coordinates.polymers[0].start, end: coordinates.polymers[0].end }],
      heavy: [{ start: coordinates.polymers[1].start, end: coordinates.polymers[1].end }],
    },
  }

  const track: Track = {
    id: options?.id ?? "navigation",
    header: "",
    features: [feature.id],
    heightFactor: options?.heightFactor ?? 1,
  }

  return { feature, track }
}
