import { codePointAt, immutable, type JsonObject } from "../data/index.js";
import type { AlignmentModel, LocusModel } from "../model/index.js";
export interface ValuesAnnotation {
  readonly id: string;
  readonly kind: "values";
  readonly semanticType: string;
  readonly space: string;
  readonly valueType: "number" | "category";
  readonly values: readonly (string | number | null)[];
  readonly provenance: { readonly label: string; readonly options: JsonObject };
}
export interface ConsensusOptions {
  readonly gapPolicy?: "ignore" | "include" | "missing";
  readonly ambiguityPolicy?: "include" | "exclude";
  readonly missingPolicy?: "null" | "gap";
}
export interface ConservationOptions extends ConsensusOptions {
  readonly metric?: "fraction";
}
const policy = (options: ConsensusOptions): JsonObject => ({
  gapPolicy: options.gapPolicy ?? "ignore",
  ambiguityPolicy: options.ambiguityPolicy ?? "include",
  missingPolicy: options.missingPolicy ?? "null",
});
const column = (
  alignment: AlignmentModel,
  index: number,
  options: ConsensusOptions,
): readonly string[] => {
  const source = alignment.members.map((member) => {
    const position = member.positions[index];
    return position === null || position === undefined
      ? "-"
      : (codePointAt(member.residues, position) ?? "");
  });
  if ((options.gapPolicy ?? "ignore") === "missing" && source.includes("-")) return [];
  return source
    .filter((residue) => (options.gapPolicy ?? "ignore") === "include" || residue !== "-")
    .filter(
      (residue) =>
        (options.ambiguityPolicy ?? "include") === "include" || !"BXZJUO?".includes(residue),
    );
};
export const consensus = (
  alignment: AlignmentModel,
  options: ConsensusOptions = {},
): ValuesAnnotation => {
  const optionsUsed = policy(options);
  const values = Array.from({ length: alignment.length }, (_, index) => {
    const observed = column(alignment, index, options);
    if (observed.length === 0) return (options.missingPolicy ?? "null") === "gap" ? "-" : null;
    const counts = new Map<string, number>();
    observed.forEach((residue) => {
      counts.set(residue, (counts.get(residue) ?? 0) + 1);
    });
    return (
      [...counts.entries()].sort(
        ([a, countA], [b, countB]) => countB - countA || a.localeCompare(b),
      )[0]?.[0] ?? null
    );
  });
  return immutable({
    id: `${alignment.id}:consensus`,
    kind: "values",
    semanticType: "seq:consensus",
    space: alignment.coordinateSpace,
    valueType: "category",
    values,
    provenance: { label: "consensus", options: optionsUsed },
  }) as ValuesAnnotation;
};
export const conservation = (
  alignment: AlignmentModel,
  options: ConservationOptions = {},
): ValuesAnnotation => {
  const winners = consensus(alignment, options).values;
  const values = winners.map((winner, index) => {
    const observed = column(alignment, index, options);
    return winner === null || observed.length === 0
      ? null
      : observed.filter((residue) => residue === winner).length / observed.length;
  });
  return immutable({
    id: `${alignment.id}:conservation`,
    kind: "values",
    semanticType: "seq:conservation",
    space: alignment.coordinateSpace,
    valueType: "number",
    values,
    provenance: {
      label: "conservation",
      options: { ...policy(options), metric: options.metric ?? "fraction" },
    },
  }) as ValuesAnnotation;
};
export interface NumericLocus {
  readonly start: number;
  readonly end: number;
  readonly id?: string;
}
export interface Overlap {
  readonly left: number;
  readonly right: number;
  readonly start: number;
  readonly end: number;
}
export const findOverlaps = (loci: readonly NumericLocus[]): readonly Overlap[] =>
  Object.freeze(
    loci.flatMap((left, leftIndex) =>
      loci.slice(leftIndex + 1).flatMap((right, offset) => {
        const start = Math.max(left.start, right.start);
        const end = Math.min(left.end, right.end);
        return start < end ? [{ left: leftIndex, right: leftIndex + offset + 1, start, end }] : [];
      }),
    ),
  );
export interface LocusOverlap {
  readonly left: number;
  readonly right: number;
  readonly space: string;
}
const locusIntersects = (left: LocusModel, right: LocusModel): boolean => {
  if (left.space !== right.space) return false;
  if (left.kind === "interval" && right.kind === "interval")
    return (
      left.start !== undefined &&
      left.end !== undefined &&
      right.start !== undefined &&
      right.end !== undefined &&
      Math.max(left.start, right.start) < Math.min(left.end, right.end)
    );
  const point = (locus: LocusModel): number | undefined =>
    locus.kind === "interval" ? undefined : locus.position;
  if (left.kind === "interval") {
    const position = point(right);
    return (
      position !== undefined &&
      left.start !== undefined &&
      left.end !== undefined &&
      (right.kind === "boundary"
        ? position >= left.start && position <= left.end
        : position >= left.start && position < left.end)
    );
  }
  if (right.kind === "interval") return locusIntersects(right, left);
  return point(left) !== undefined && point(left) === point(right);
};
/** Same-space normalized loci only. Multiple loci from a discontinuous item are passed independently. */
export const findLocusOverlaps = (loci: readonly LocusModel[]): readonly LocusOverlap[] =>
  Object.freeze(
    loci.flatMap((left, leftIndex) =>
      loci
        .slice(leftIndex + 1)
        .flatMap((right, offset) =>
          locusIntersects(left, right)
            ? [{ left: leftIndex, right: leftIndex + offset + 1, space: left.space }]
            : [],
        ),
    ),
  );
export interface SeqAlgorithmPackageBoundary {
  readonly model: import("../model/index.js").SeqModelPackageBoundary;
  readonly moduleName: "algorithm";
}
