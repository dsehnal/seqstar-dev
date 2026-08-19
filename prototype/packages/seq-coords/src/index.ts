import type { DeepReadonly, Diagnostic, JsonObject } from "@seq-star/seq-core";
import type { SeqModelPackageBoundary } from "@seq-star/seq-core/model";
import { type Static, Type } from "typebox";

export const CoordinateSpaceSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    kind: Type.String({ minLength: 1 }),
    length: Type.Optional(Type.Integer({ minimum: 0 })),
    authority: Type.Optional(Type.String({ minLength: 1 })),
    context: Type.Optional(Type.Record(Type.String(), Type.String())),
  },
  { additionalProperties: false },
);
export type CoordinateSpace = DeepReadonly<Static<typeof CoordinateSpaceSchema>>;
export const CoordinatePositionSchema = Type.Union([
  Type.Object(
    { kind: Type.Literal("index"), value: Type.Integer({ minimum: 0 }) },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: Type.Literal("label"),
      value: Type.Union([Type.String(), Type.Number()]),
      insertionCode: Type.Optional(Type.String()),
    },
    { additionalProperties: false },
  ),
]);
export type CoordinatePosition = DeepReadonly<Static<typeof CoordinatePositionSchema>>;
export const CoordinateLocusSchema = Type.Union([
  Type.Object(
    {
      kind: Type.Literal("point"),
      space: CoordinateSpaceSchema,
      position: CoordinatePositionSchema,
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: Type.Literal("interval"),
      space: CoordinateSpaceSchema,
      start: Type.Integer({ minimum: 0 }),
      end: Type.Integer({ minimum: 0 }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: Type.Literal("boundary"),
      space: CoordinateSpaceSchema,
      position: Type.Integer({ minimum: 0 }),
    },
    { additionalProperties: false },
  ),
]);
export type CoordinateLocus = DeepReadonly<Static<typeof CoordinateLocusSchema>>;
export interface LocusSet {
  readonly loci: readonly CoordinateLocus[];
}

export const CoordinateSpacePatternSchema = Type.Object(
  {
    kind: Type.String({ minLength: 1 }),
    authority: Type.Optional(Type.String({ minLength: 1 })),
    context: Type.Optional(Type.Record(Type.String(), Type.String())),
  },
  { additionalProperties: false },
);
export interface CoordinateSpacePattern {
  readonly kind: string;
  readonly authority?: string;
  readonly context?: Readonly<Record<string, string | "*">>;
}
export type MappingStatus = "exact" | "partial" | "ambiguous" | "unmapped";
export interface MappingRequest {
  readonly loci: readonly CoordinateLocus[];
  readonly target?: CoordinateSpace;
}
export interface MappingAssociation {
  readonly source: CoordinateLocus;
  readonly targets: readonly CoordinateLocus[];
  readonly status: MappingStatus;
  readonly confidence?: number;
  readonly details?: JsonObject;
}
export interface MappingResult {
  readonly translatorIds: readonly string[];
  readonly associations: readonly MappingAssociation[];
  readonly diagnostics: readonly Diagnostic[];
}
export interface CoordinateTranslator {
  readonly id: string;
  readonly source: CoordinateSpacePattern;
  readonly target: CoordinateSpacePattern;
  readonly cost?: number;
  map(request: MappingRequest, signal: AbortSignal): Promise<MappingResult>;
}

/** Canonical equality is id, kind, authority, and every context key/value; length is not identity. */
export const coordinateSpaceKey = (space: CoordinateSpace): string =>
  JSON.stringify({
    id: space.id,
    kind: space.kind,
    authority: space.authority ?? null,
    context: Object.fromEntries(
      Object.entries(space.context ?? {}).sort(([left], [right]) => left.localeCompare(right)),
    ),
  });
export const coordinateSpaceEquals = (left: CoordinateSpace, right: CoordinateSpace): boolean =>
  coordinateSpaceKey(left) === coordinateSpaceKey(right);
export const coordinateLocusKey = (locus: CoordinateLocus): string => {
  const shared = { kind: locus.kind, space: coordinateSpaceKey(locus.space) };
  switch (locus.kind) {
    case "point": {
      const position =
        locus.position.kind === "index"
          ? ["index", locus.position.value, null]
          : ["label", locus.position.value, locus.position.insertionCode ?? null];
      return JSON.stringify({ ...shared, position });
    }
    case "interval":
      return JSON.stringify({ ...shared, start: locus.start, end: locus.end });
    case "boundary":
      return JSON.stringify({ ...shared, position: locus.position });
  }
};
export const coordinateLocusEquals = (left: CoordinateLocus, right: CoordinateLocus): boolean =>
  coordinateLocusKey(left) === coordinateLocusKey(right);
/** Pattern keys are required; `*` matches any present string, never an omitted key. */
export const coordinateSpaceMatches = (
  pattern: CoordinateSpacePattern,
  space: CoordinateSpace,
): boolean => {
  if (
    pattern.kind !== space.kind ||
    (pattern.authority !== undefined && pattern.authority !== space.authority)
  )
    return false;
  return Object.entries(pattern.context ?? {}).every(([key, expected]) => {
    const actual = space.context?.[key];
    return actual !== undefined && (expected === "*" || actual === expected);
  });
};
export interface MappingCompositionPolicy {
  readonly maxExpansion: number;
}
/**
 * Contract helper: continuation is keyed by `coordinateLocusKey` of each intermediate target.
 * It preserves the original source and only follows associations that name that exact target.
 */
export const composeMappingResults = (
  first: MappingResult,
  continuation: ReadonlyMap<string, MappingResult>,
  policy: MappingCompositionPolicy,
): MappingResult => {
  const diagnostics: Diagnostic[] = [...first.diagnostics];
  const translatorIds = [...first.translatorIds];
  const associations = first.associations.map((association) => {
    const targets: CoordinateLocus[] = [];
    const statuses: MappingStatus[] = [];
    for (const target of association.targets) {
      const next = continuation.get(coordinateLocusKey(target));
      if (next === undefined) {
        statuses.push("unmapped");
        continue;
      }
      const matchingAssociations = next.associations.filter((nextAssociation) =>
        coordinateLocusEquals(nextAssociation.source, target),
      );
      if (matchingAssociations.length === 0) {
        statuses.push("unmapped");
        continue;
      }
      for (const translatorId of next.translatorIds) {
        if (!translatorIds.includes(translatorId)) translatorIds.push(translatorId);
      }
      diagnostics.push(...next.diagnostics);
      for (const nextAssociation of matchingAssociations) {
        statuses.push(nextAssociation.status);
        targets.push(...nextAssociation.targets);
        if (targets.length >= policy.maxExpansion) break;
      }
      if (targets.length >= policy.maxExpansion) break;
    }
    const status = composedStatus(association.status, statuses, targets.length);
    return { ...association, targets: targets.slice(0, policy.maxExpansion), status };
  });
  return { translatorIds, associations, diagnostics };
};

const composedStatus = (
  sourceStatus: MappingStatus,
  continuationStatuses: readonly MappingStatus[],
  targetCount: number,
): MappingStatus => {
  if (targetCount === 0 || sourceStatus === "unmapped") return "unmapped";
  if (sourceStatus === "partial" || continuationStatuses.includes("partial")) return "partial";
  if (continuationStatuses.includes("unmapped")) return "partial";
  if (sourceStatus === "ambiguous" || continuationStatuses.includes("ambiguous"))
    return "ambiguous";
  return "exact";
};

/** @deprecated P01 package-boundary marker retained while consumers move to named contracts. */
export interface SeqCoordsPackageBoundary {
  readonly model: SeqModelPackageBoundary;
  readonly packageName: "@seq-star/seq-coords";
}
