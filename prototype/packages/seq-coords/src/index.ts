import type { DeepReadonly, Diagnostic, JsonObject, Result } from "@seq-star/seq-core";
import {
  diagnostic,
  immutable,
  isJsonSafeValue,
  isStableId,
  resultError,
  resultOk,
} from "@seq-star/seq-core";
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
export const validateCoordinateSpace = (
  space: CoordinateSpace,
  path = "",
): Result<CoordinateSpace> => {
  const errors: Diagnostic[] = [];
  if (!isStableId(space.id))
    errors.push(
      diagnostic("seq.coords.space.id", "Coordinate-space ID must be a stable ID.", `${path}/id`),
    );
  if (!isStableId(space.kind))
    errors.push(
      diagnostic(
        "seq.coords.space.kind",
        "Coordinate-space kind must be a stable ID.",
        `${path}/kind`,
      ),
    );
  if (space.authority !== undefined && !isStableId(space.authority))
    errors.push(
      diagnostic(
        "seq.coords.space.authority",
        "Coordinate-space authority must be a stable ID.",
        `${path}/authority`,
      ),
    );
  if (space.length !== undefined && (!Number.isSafeInteger(space.length) || space.length < 0))
    errors.push(
      diagnostic(
        "seq.coords.space.length",
        "Coordinate-space length must be a non-negative safe integer.",
        `${path}/length`,
      ),
    );
  Object.entries(space.context ?? {}).forEach(([key, value]) => {
    if (!isStableId(key) || typeof value !== "string" || value.length === 0)
      errors.push(
        diagnostic(
          "seq.coords.space.context",
          "Coordinate-space context requires stable keys and non-empty strings.",
          `${path}/context/${key}`,
        ),
      );
  });
  return errors.length ? resultError(errors) : resultOk(immutable(space) as CoordinateSpace);
};
export const validateCoordinateLocus = (
  locus: CoordinateLocus,
  path = "",
): Result<CoordinateLocus> => {
  const space = validateCoordinateSpace(locus.space, `${path}/space`);
  const errors: Diagnostic[] = space.ok ? [] : [...space.diagnostics];
  if (locus.kind === "point") {
    if (
      locus.position.kind === "index" &&
      (!Number.isSafeInteger(locus.position.value) ||
        locus.position.value < 0 ||
        (locus.space.length !== undefined && locus.position.value >= locus.space.length))
    )
      errors.push(
        diagnostic(
          "seq.coords.locus.point",
          "Index points must be non-negative safe integers and in bounds when known.",
          `${path}/position/value`,
        ),
      );
    if (
      locus.position.kind === "label" &&
      ((typeof locus.position.value === "number" && !Number.isFinite(locus.position.value)) ||
        (typeof locus.position.value === "string" && locus.position.value.length === 0))
    )
      errors.push(
        diagnostic(
          "seq.coords.locus.label",
          "Label positions must be finite numbers or non-empty strings.",
          `${path}/position/value`,
        ),
      );
  } else if (
    locus.kind === "interval" &&
    (!Number.isSafeInteger(locus.start) ||
      !Number.isSafeInteger(locus.end) ||
      locus.start < 0 ||
      locus.start >= locus.end ||
      (locus.space.length !== undefined && locus.end > locus.space.length))
  )
    errors.push(
      diagnostic(
        "seq.coords.locus.interval",
        "Intervals must be zero-based, half-open, and in bounds when known.",
        path,
      ),
    );
  else if (
    locus.kind === "boundary" &&
    (!Number.isSafeInteger(locus.position) ||
      locus.position < 0 ||
      (locus.space.length !== undefined && locus.position > locus.space.length))
  )
    errors.push(
      diagnostic(
        "seq.coords.locus.boundary",
        "Boundaries must be non-negative safe integers and in bounds when known.",
        `${path}/position`,
      ),
    );
  return errors.length ? resultError(errors) : resultOk(immutable(locus) as CoordinateLocus);
};
export const coordinateSpaceKey = (space: CoordinateSpace): string =>
  JSON.stringify({
    id: space.id,
    kind: space.kind,
    authority: space.authority ?? null,
    context: Object.fromEntries(
      Object.entries(space.context ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    ),
  });
export const coordinateSpaceEquals = (left: CoordinateSpace, right: CoordinateSpace): boolean =>
  coordinateSpaceKey(left) === coordinateSpaceKey(right);
export const coordinateLocusKey = (locus: CoordinateLocus): string => {
  const valid = validateCoordinateLocus(locus);
  if (!valid.ok) return `invalid:${JSON.stringify(valid.diagnostics)}`;
  const common = { kind: locus.kind, space: coordinateSpaceKey(locus.space) };
  if (locus.kind === "interval")
    return JSON.stringify({ ...common, start: locus.start, end: locus.end });
  if (locus.kind === "boundary") return JSON.stringify({ ...common, position: locus.position });
  return JSON.stringify({
    ...common,
    position:
      locus.position.kind === "index"
        ? ["index", locus.position.value, null]
        : ["label", locus.position.value, locus.position.insertionCode ?? null],
  });
};
export const coordinateLocusEquals = (left: CoordinateLocus, right: CoordinateLocus): boolean =>
  coordinateLocusKey(left) === coordinateLocusKey(right);
export const coordinateSpaceMatches = (
  pattern: CoordinateSpacePattern,
  space: CoordinateSpace,
): boolean =>
  pattern.kind === space.kind &&
  (pattern.authority === undefined || pattern.authority === space.authority) &&
  Object.entries(pattern.context ?? {}).every(([key, expected]) => {
    const actual = space.context?.[key];
    return actual !== undefined && (expected === "*" || actual === expected);
  });
export const isLocusInBounds = (locus: CoordinateLocus): boolean => {
  if (!validateCoordinateLocus(locus).ok) return false;
  const length = locus.space.length;
  if (length === undefined) return locus.kind === "point" ? locus.position.kind === "label" : true;
  if (locus.kind === "point")
    return locus.position.kind === "label" || locus.position.value < length;
  if (locus.kind === "boundary") return locus.position <= length;
  return locus.start < locus.end && locus.end <= length;
};
export const pointLocus = (space: CoordinateSpace, value: number): CoordinateLocus | undefined =>
  validateCoordinateSpace(space).ok &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  (space.length === undefined || value < space.length)
    ? (immutable({ kind: "point", space, position: { kind: "index", value } }) as CoordinateLocus)
    : undefined;
export const intervalLocus = (
  space: CoordinateSpace,
  start: number,
  end: number,
): CoordinateLocus | undefined =>
  validateCoordinateSpace(space).ok &&
  Number.isSafeInteger(start) &&
  Number.isSafeInteger(end) &&
  start >= 0 &&
  start < end &&
  (space.length === undefined || end <= space.length)
    ? (immutable({ kind: "interval", space, start, end }) as CoordinateLocus)
    : undefined;
export const labelLocus = (
  space: CoordinateSpace,
  value: string | number,
  insertionCode?: string,
): CoordinateLocus | undefined =>
  validateCoordinateSpace(space).ok &&
  (typeof value !== "number" || Number.isFinite(value)) &&
  (typeof value !== "string" || value.length > 0)
    ? (immutable({
        kind: "point",
        space,
        position: {
          kind: "label",
          value,
          ...(insertionCode === undefined ? {} : { insertionCode }),
        },
      }) as CoordinateLocus)
    : undefined;
const abortedResult = (id: string, request: MappingRequest): MappingResult =>
  immutable({
    translatorIds: [id],
    associations: request.loci.map((source) => ({
      source,
      targets: [],
      status: "unmapped" as const,
    })),
    diagnostics: [
      { code: "seq.coords.aborted", severity: "warning" as const, message: "Mapping aborted." },
    ],
  }) as MappingResult;
const status = (targets: readonly CoordinateLocus[]): MappingStatus =>
  targets.length === 0 ? "unmapped" : targets.length === 1 ? "exact" : "ambiguous";
const pattern = (space: CoordinateSpace): CoordinateSpacePattern => ({
  kind: space.kind,
  ...(space.authority === undefined ? {} : { authority: space.authority }),
  ...(space.context === undefined ? {} : { context: space.context }),
});
export const createIdentityTranslator = (
  id: string,
  space: CoordinateSpace,
): CoordinateTranslator => ({
  id,
  source: pattern(space),
  target: pattern(space),
  async map(request, signal) {
    if (signal.aborted) return abortedResult(id, request);
    return immutable({
      translatorIds: [id],
      associations: request.loci.map((source) =>
        coordinateSpaceEquals(source.space, space) &&
        (request.target === undefined || coordinateSpaceEquals(request.target, space))
          ? { source, targets: [source], status: "exact" as const }
          : { source, targets: [], status: "unmapped" as const },
      ),
      diagnostics: [],
    }) as MappingResult;
  },
});
export interface AlignmentMemberMapping {
  readonly alignmentSpace: CoordinateSpace;
  readonly memberSpace: CoordinateSpace;
  readonly positions: readonly (number | null)[];
}
export const createAlignmentColumnToMemberTranslator = (
  id: string,
  mapping: AlignmentMemberMapping,
): CoordinateTranslator => ({
  id,
  source: pattern(mapping.alignmentSpace),
  target: pattern(mapping.memberSpace),
  async map(request, signal) {
    if (signal.aborted) return abortedResult(id, request);
    const associations = request.loci.map((source) => {
      if (
        !coordinateSpaceEquals(source.space, mapping.alignmentSpace) ||
        (request.target !== undefined &&
          !coordinateSpaceEquals(request.target, mapping.memberSpace)) ||
        source.kind !== "point" ||
        source.position.kind !== "index"
      )
        return { source, targets: [], status: "unmapped" as const };
      const position = mapping.positions[source.position.value];
      const target =
        position === null || position === undefined
          ? undefined
          : pointLocus(mapping.memberSpace, position);
      return {
        source,
        targets: target === undefined ? [] : [target],
        status: target === undefined ? ("unmapped" as const) : ("exact" as const),
      };
    });
    return immutable({ translatorIds: [id], associations, diagnostics: [] }) as MappingResult;
  },
});
export const createMemberToAlignmentColumnTranslator = (
  id: string,
  mapping: AlignmentMemberMapping,
): CoordinateTranslator => {
  const reverse = new Map<number, number[]>();
  mapping.positions.forEach((position, column) => {
    if (position !== null) reverse.set(position, [...(reverse.get(position) ?? []), column]);
  });
  return {
    id,
    source: pattern(mapping.memberSpace),
    target: pattern(mapping.alignmentSpace),
    async map(request, signal) {
      if (signal.aborted) return abortedResult(id, request);
      const associations = request.loci.map((source) => {
        if (
          !coordinateSpaceEquals(source.space, mapping.memberSpace) ||
          (request.target !== undefined &&
            !coordinateSpaceEquals(request.target, mapping.alignmentSpace)) ||
          source.kind !== "point" ||
          source.position.kind !== "index"
        )
          return { source, targets: [], status: "unmapped" as const };
        const targets = (reverse.get(source.position.value) ?? []).flatMap((column) => {
          const locus = pointLocus(mapping.alignmentSpace, column);
          return locus === undefined ? [] : [locus];
        });
        return { source, targets, status: status(targets) };
      });
      return immutable({ translatorIds: [id], associations, diagnostics: [] }) as MappingResult;
    },
  };
};
export interface MappingTableRow {
  readonly source: CoordinateLocus;
  readonly target: CoordinateLocus;
  readonly status?: "exact" | "partial";
  readonly confidence?: number;
  readonly details?: JsonObject;
}
export const createTableTranslator = (
  id: string,
  source: CoordinateSpacePattern,
  target: CoordinateSpacePattern,
  rows: readonly MappingTableRow[],
): CoordinateTranslator => {
  const validRows: MappingTableRow[] = [];
  const table = new Map<string, MappingTableRow[]>();
  const tableDiagnostics: Diagnostic[] = [];
  rows.forEach((row) => {
    const sourceValid = validateCoordinateLocus(row.source);
    const targetValid = validateCoordinateLocus(row.target);
    if (
      !sourceValid.ok ||
      !targetValid.ok ||
      !coordinateSpaceMatches(source, row.source.space) ||
      !coordinateSpaceMatches(target, row.target.space) ||
      (row.status !== undefined && row.status !== "exact" && row.status !== "partial") ||
      (row.confidence !== undefined && !Number.isFinite(row.confidence)) ||
      (row.details !== undefined && !isJsonSafeValue(row.details))
    ) {
      tableDiagnostics.push({
        code: "seq.coords.table.row.invalid",
        severity: "error",
        message: "Invalid table mapping row was excluded.",
      });
      return;
    }
    validRows.push(row);
  });
  const frozenRows = immutable(validRows) as readonly MappingTableRow[];
  frozenRows.forEach((row) => {
    table.set(coordinateLocusKey(row.source), [
      ...(table.get(coordinateLocusKey(row.source)) ?? []),
      row,
    ]);
  });
  return {
    id,
    source: immutable(source) as CoordinateSpacePattern,
    target: immutable(target) as CoordinateSpacePattern,
    async map(request, signal) {
      if (signal.aborted) return abortedResult(id, request);
      const associations = request.loci.map((item) => {
        const matches = (table.get(coordinateLocusKey(item)) ?? []).filter(
          (row) =>
            request.target === undefined || coordinateSpaceEquals(row.target.space, request.target),
        );
        const targets = matches.map((row) => row.target);
        const commonConfidence =
          matches.length > 0 &&
          matches.every((row) => row.confidence === matches[0]?.confidence) &&
          matches[0]?.confidence !== undefined
            ? matches[0].confidence
            : undefined;
        const details =
          matches.length > 1
            ? {
                branches: matches.map((row) => ({
                  target: row.target,
                  ...(row.confidence === undefined ? {} : { confidence: row.confidence }),
                  ...(row.details === undefined ? {} : { details: row.details }),
                })),
              }
            : matches[0]?.details;
        return {
          source: item,
          targets,
          status:
            matches.some((row) => row.status === "partial") && targets.length > 0
              ? ("partial" as const)
              : status(targets),
          ...(commonConfidence === undefined ? {} : { confidence: commonConfidence }),
          ...(details === undefined ? {} : { details }),
        };
      });
      return immutable({
        translatorIds: [id],
        associations,
        diagnostics: tableDiagnostics,
      }) as MappingResult;
    },
  };
};
export const createReverseTableTranslator = (
  id: string,
  source: CoordinateSpacePattern,
  target: CoordinateSpacePattern,
  rows: readonly MappingTableRow[],
): CoordinateTranslator =>
  createTableTranslator(
    id,
    source,
    target,
    rows.map((row) => ({
      source: row.target,
      target: row.source,
      ...(row.status === undefined ? {} : { status: row.status }),
      ...(row.confidence === undefined ? {} : { confidence: row.confidence }),
      ...(row.details === undefined ? {} : { details: row.details }),
    })),
  );
export interface MappingCompositionPolicy {
  readonly maxExpansion: number;
}
export const composeMappingResults = (
  first: MappingResult,
  continuation: ReadonlyMap<string, MappingResult>,
  policy: MappingCompositionPolicy,
): MappingResult => {
  const diagnostics: Diagnostic[] = [...first.diagnostics];
  const translatorIds = [...first.translatorIds];
  const associations = first.associations.map((association) => {
    const targets: CoordinateLocus[] = [];
    const states: MappingStatus[] = [];
    association.targets.forEach((target) => {
      const next = continuation.get(coordinateLocusKey(target));
      if (next === undefined) {
        states.push("unmapped");
        return;
      }
      next.translatorIds.forEach((value) => {
        if (!translatorIds.includes(value)) translatorIds.push(value);
      });
      diagnostics.push(...next.diagnostics);
      next.associations
        .filter((item) => coordinateLocusEquals(item.source, target))
        .forEach((item) => {
          states.push(item.status);
          targets.push(...item.targets);
        });
    });
    const kept = targets.slice(0, Math.max(0, policy.maxExpansion));
    const dropped = targets.length > kept.length;
    if (dropped)
      diagnostics.push({
        code: "seq.coords.composition.expansion-capped",
        severity: "warning",
        message: `Mapping expansion was capped at ${policy.maxExpansion} targets.`,
      });
    const finalStatus: MappingStatus =
      association.status === "unmapped" || kept.length === 0
        ? "unmapped"
        : association.status === "partial" ||
            states.includes("partial") ||
            states.includes("unmapped") ||
            dropped
          ? "partial"
          : association.status === "ambiguous" || states.includes("ambiguous")
            ? "ambiguous"
            : "exact";
    return { ...association, targets: kept, status: finalStatus };
  });
  return immutable({ translatorIds, associations, diagnostics }) as MappingResult;
};
export interface SeqCoordsPackageBoundary {
  readonly model: SeqModelPackageBoundary;
  readonly packageName: "@seq-star/seq-coords";
}
