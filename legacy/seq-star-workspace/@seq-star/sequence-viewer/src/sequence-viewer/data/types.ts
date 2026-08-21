export type SoA<T> = {
  [K in keyof T]: T[K][]
}

export type TrackId = string
export type FeatureId = string
export type FeatureKind = string
export type SectionName = string
export type PolymerName = string

export type Range<Extra = object> = { start: number; end: number } & Extra
export type Ranges<Extra = object> = Record<PolymerName, Range<Extra>[]>
