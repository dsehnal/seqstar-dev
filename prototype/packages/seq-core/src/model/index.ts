import {
  codePointLength,
  type Diagnostic,
  diagnostic,
  immutable,
  isJsonSafeValue,
  isStableId,
  type JsonObject,
  type Result,
  resultError,
  resultOk,
  uniqueStableIds,
  validateStableId,
} from "../data/index.js";
export type Alphabet = "protein" | "dna" | "rna" | "custom";
export interface StableIdentifier {
  readonly namespace: string;
  readonly value: string;
  readonly version?: string;
}
export interface Provenance {
  readonly label: string;
  readonly description?: string;
  readonly uri?: string;
  readonly citation?: string;
  readonly generatedBy?: string;
  readonly transformations?: readonly string[];
  readonly options?: JsonObject;
}
export interface SequenceModel {
  readonly id: string;
  readonly coordinateSpace: string;
  readonly alphabet: Alphabet;
  readonly residues: string;
  readonly identifiers?: readonly StableIdentifier[];
  readonly provenance?: Provenance;
  readonly extensions?: JsonObject;
}
export interface AssemblyMemberModel {
  readonly id: string;
  readonly sequence: string;
  readonly role?: string;
  readonly label?: string;
}
export interface AssemblyModel {
  readonly id: string;
  readonly members: readonly AssemblyMemberModel[];
  readonly provenance?: Provenance;
  readonly extensions?: JsonObject;
}
export interface AlignmentMemberModel {
  readonly id: string;
  readonly sequence: string;
  /** Runtime-only validated sequence content; this is not a SeqViewSpec serialized member field. */
  readonly residues: string;
  readonly positions: readonly (number | null)[];
  readonly metadata?: JsonObject;
}
export interface AlignmentModel {
  readonly id: string;
  readonly coordinateSpace: string;
  readonly length: number;
  readonly members: readonly AlignmentMemberModel[];
  readonly provenance?: Provenance;
  readonly extensions?: JsonObject;
}
export interface AlignmentMemberInput {
  readonly id: string;
  readonly sequence: string;
  readonly positions: readonly (number | null)[];
  readonly metadata?: JsonObject;
}
export interface AlignmentModelInput extends Omit<AlignmentModel, "members"> {
  readonly members: readonly AlignmentMemberInput[];
}
export interface NormalizedSeqModel {
  readonly sequences: readonly SequenceModel[];
  readonly assemblies?: readonly AssemblyModel[];
  readonly alignments?: readonly AlignmentModel[];
}
const syntax: Readonly<Record<Exclude<Alphabet, "custom">, RegExp>> = {
  protein: /^[ACDEFGHIKLMNPQRSTVWYBXZJUO*]+$/,
  dna: /^[ACGTNRYSWKMBDHV]+$/,
  rna: /^[ACGUNRYSWKMBDHV]+$/,
};
const extensions = (value: JsonObject | undefined, path: string, errors: Diagnostic[]): void => {
  if (value !== undefined && !isJsonSafeValue(value))
    errors.push(diagnostic("seq.extensions.invalid", "Extensions must be JSON-safe.", path));
};
export const createSequence = (input: SequenceModel): Result<SequenceModel> => {
  const errors: Diagnostic[] = [];
  for (const [value, path] of [
    [input.id, "/id"],
    [input.coordinateSpace, "/coordinateSpace"],
  ] as const) {
    const check = validateStableId(value, path);
    if (!check.ok) errors.push(...check.diagnostics);
  }
  if (
    input.residues.length === 0 ||
    (input.alphabet === "custom"
      ? !/^[^\s-]+$/u.test(input.residues)
      : !syntax[input.alphabet].test(input.residues))
  )
    errors.push(
      diagnostic(
        "seq.sequence.residues.invalid",
        `Residues are invalid for ${input.alphabet}; sequences must be ungapped uppercase syntax.`,
        "/residues",
      ),
    );
  if (input.identifiers?.some((id) => id.namespace.length === 0 || id.value.length === 0))
    errors.push(
      diagnostic(
        "seq.sequence.identifier.invalid",
        "Identifiers require non-empty namespace and value.",
        "/identifiers",
      ),
    );
  extensions(input.extensions, "/extensions", errors);
  return errors.length
    ? resultError(errors)
    : resultOk(
        immutable({
          ...input,
          ...(input.identifiers === undefined ? {} : { identifiers: [...input.identifiers] }),
        }) as SequenceModel,
      );
};
export const createAssembly = (
  input: AssemblyModel,
  knownSequenceIds: readonly string[],
): Result<AssemblyModel> => {
  const errors: Diagnostic[] = [];
  const id = validateStableId(input.id, "/id");
  if (!id.ok) errors.push(...id.diagnostics);
  const members = uniqueStableIds(
    input.members.map((member) => member.id),
    "/members",
  );
  if (!members.ok) errors.push(...members.diagnostics);
  const known = new Set(knownSequenceIds);
  input.members.forEach((member, index) => {
    if (!known.has(member.sequence))
      errors.push(
        diagnostic(
          "seq.assembly.sequence.missing",
          `Assembly member references unknown sequence '${member.sequence}'.`,
          `/members/${index}/sequence`,
        ),
      );
  });
  extensions(input.extensions, "/extensions", errors);
  return errors.length
    ? resultError(errors)
    : resultOk(
        immutable({
          ...input,
          members: input.members.map((member) => ({ ...member })),
        }) as AssemblyModel,
      );
};
export const createAlignment = (
  input: AlignmentModelInput,
  sequences: readonly SequenceModel[],
): Result<AlignmentModel> => {
  const errors: Diagnostic[] = [];
  for (const [value, path] of [
    [input.id, "/id"],
    [input.coordinateSpace, "/coordinateSpace"],
  ] as const) {
    const check = validateStableId(value, path);
    if (!check.ok) errors.push(...check.diagnostics);
  }
  if (!Number.isSafeInteger(input.length) || input.length < 0)
    errors.push(
      diagnostic(
        "seq.alignment.length.invalid",
        "Alignment length must be a non-negative integer.",
        "/length",
      ),
    );
  const memberIds = uniqueStableIds(
    input.members.map((member) => member.id),
    "/members",
  );
  if (!memberIds.ok) errors.push(...memberIds.diagnostics);
  const sequenceById = new Map(sequences.map((sequence) => [sequence.id, sequence]));
  input.members.forEach((member, memberIndex) => {
    const sequence = sequenceById.get(member.sequence);
    if (sequence === undefined) {
      errors.push(
        diagnostic(
          "seq.alignment.sequence.missing",
          `Alignment member references unknown sequence '${member.sequence}'.`,
          `/members/${memberIndex}/sequence`,
        ),
      );
      return;
    }
    if (member.positions.length !== input.length)
      errors.push(
        diagnostic(
          "seq.alignment.positions.length",
          "Member positions length must equal alignment length.",
          `/members/${memberIndex}/positions`,
        ),
      );
    let previous = -1;
    const seen = new Set<number>();
    member.positions.forEach((position, index) => {
      if (position === null) return;
      if (
        !Number.isSafeInteger(position) ||
        position < 0 ||
        position >= codePointLength(sequence.residues)
      )
        errors.push(
          diagnostic(
            "seq.alignment.position.bounds",
            "Alignment position is outside its sequence.",
            `/members/${memberIndex}/positions/${index}`,
          ),
        );
      else if (seen.has(position) || position <= previous)
        errors.push(
          diagnostic(
            "seq.alignment.position.order",
            "Non-gap positions must be unique and strictly increasing.",
            `/members/${memberIndex}/positions/${index}`,
          ),
        );
      else {
        seen.add(position);
        previous = position;
      }
    });
  });
  extensions(input.extensions, "/extensions", errors);
  return errors.length
    ? resultError(errors)
    : resultOk(
        immutable({
          ...input,
          members: input.members.map((member) => {
            const sequence = sequenceById.get(member.sequence);
            if (sequence === undefined) throw new Error("validated above");
            return { ...member, residues: sequence.residues, positions: [...member.positions] };
          }),
        }) as AlignmentModel,
      );
};
export interface LocusModel {
  readonly kind: "point" | "interval" | "boundary";
  readonly space: string;
  readonly position?: number;
  readonly start?: number;
  readonly end?: number;
}
export type AnnotationScalar = string | number | boolean;
export interface LociAnnotationModel {
  readonly id: string;
  readonly kind: "loci";
  readonly semanticType: string;
  readonly items: readonly {
    readonly id: string;
    readonly loci: readonly LocusModel[];
    readonly value?: AnnotationScalar;
  }[];
  readonly provenance?: Provenance;
}
export interface ValuesAnnotationModel {
  readonly id: string;
  readonly kind: "values";
  readonly semanticType: string;
  readonly space: string;
  readonly valueType: "number" | "category" | "boolean";
  readonly values: readonly (AnnotationScalar | null)[];
  readonly provenance?: Provenance;
}
const validAnnotationScalar = (value: unknown): value is AnnotationScalar =>
  typeof value === "string" ||
  typeof value === "boolean" ||
  (typeof value === "number" && Number.isFinite(value));
const annotationBaseErrors = (
  input: { readonly id: string; readonly semanticType: string; readonly space?: string },
  lengths: ReadonlyMap<string, number>,
): Diagnostic[] => {
  const errors: Diagnostic[] = [];
  const id = validateStableId(input.id, "/id");
  if (!id.ok) errors.push(...id.diagnostics);
  if (input.semanticType.length === 0)
    errors.push(
      diagnostic(
        "seq.annotation.semantic-type.invalid",
        "Annotation semanticType must be non-empty.",
        "/semanticType",
      ),
    );
  if (
    input.space !== undefined &&
    (lengths.get(input.space) === undefined || !isStableId(input.space))
  )
    errors.push(
      diagnostic(
        "seq.annotation.space.invalid",
        "Annotation space must be a known stable coordinate-space ID.",
        "/space",
      ),
    );
  return errors;
};
export const createValuesAnnotation = (
  input: ValuesAnnotationModel,
  lengths: ReadonlyMap<string, number>,
): Result<ValuesAnnotationModel> => {
  const errors: Diagnostic[] = annotationBaseErrors(input, lengths);
  const length = lengths.get(input.space);
  if (length === undefined || input.values.length !== length)
    errors.push(
      diagnostic(
        "seq.annotation.values.length",
        "Value annotation length must equal its coordinate-space length.",
        "/values",
      ),
    );
  input.values.forEach((value, index) => {
    if (value !== null && (!validAnnotationScalar(value) || typeof value !== input.valueType))
      errors.push(
        diagnostic(
          "seq.annotation.value.type",
          `Expected ${input.valueType} value.`,
          `/values/${index}`,
        ),
      );
  });
  return errors.length
    ? resultError(errors)
    : resultOk(immutable({ ...input, values: [...input.values] }) as ValuesAnnotationModel);
};
const locusValid = (locus: LocusModel, lengths: ReadonlyMap<string, number>): boolean => {
  const length = lengths.get(locus.space);
  if (length === undefined) return false;
  if (locus.kind === "point") {
    const position = locus.position;
    return (
      typeof position === "number" &&
      Number.isSafeInteger(position) &&
      position >= 0 &&
      position < length
    );
  }
  if (locus.kind === "boundary") {
    const position = locus.position;
    return (
      typeof position === "number" &&
      Number.isSafeInteger(position) &&
      position >= 0 &&
      position <= length
    );
  }
  const { start, end } = locus;
  return (
    typeof start === "number" &&
    typeof end === "number" &&
    Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start >= 0 &&
    start < end &&
    end <= length
  );
};
export const createLociAnnotation = (
  input: LociAnnotationModel,
  lengths: ReadonlyMap<string, number>,
): Result<LociAnnotationModel> => {
  const errors: Diagnostic[] = annotationBaseErrors(input, lengths);
  const itemIds = uniqueStableIds(
    input.items.map((item) => item.id),
    "/items",
  );
  if (!itemIds.ok) errors.push(...itemIds.diagnostics);
  input.items.forEach((item, itemIndex) => {
    if (item.loci.length === 0)
      errors.push(
        diagnostic(
          "seq.annotation.loci.empty",
          "Annotation item requires at least one locus.",
          `/items/${itemIndex}/loci`,
        ),
      );
    item.loci.forEach((locus, locusIndex) => {
      if (!locusValid(locus, lengths))
        errors.push(
          diagnostic(
            "seq.annotation.locus.invalid",
            "Locus must reference a known space and be in bounds.",
            `/items/${itemIndex}/loci/${locusIndex}`,
          ),
        );
    });
    if (item.value !== undefined && !validAnnotationScalar(item.value))
      errors.push(
        diagnostic(
          "seq.annotation.value.type",
          "Annotation number values must be finite.",
          `/items/${itemIndex}/value`,
        ),
      );
  });
  return errors.length
    ? resultError(errors)
    : resultOk(
        immutable({
          ...input,
          items: input.items.map((item) => ({ ...item, loci: [...item.loci] })),
        }) as LociAnnotationModel,
      );
};
export interface SparseValuesAnnotationModel extends Omit<ValuesAnnotationModel, "values"> {
  readonly values: readonly {
    readonly position: number;
    readonly value: AnnotationScalar | null;
  }[];
}
export const createSparseValuesAnnotation = (
  input: SparseValuesAnnotationModel,
  lengths: ReadonlyMap<string, number>,
): Result<SparseValuesAnnotationModel> => {
  const errors: Diagnostic[] = annotationBaseErrors(input, lengths);
  const length = lengths.get(input.space);
  const seen = new Set<number>();
  input.values.forEach((entry, index) => {
    if (
      length === undefined ||
      !Number.isSafeInteger(entry.position) ||
      entry.position < 0 ||
      entry.position >= length ||
      seen.has(entry.position)
    )
      errors.push(
        diagnostic(
          "seq.annotation.sparse.position",
          "Sparse positions must be unique and in bounds.",
          `/values/${index}/position`,
        ),
      );
    seen.add(entry.position);
    if (
      entry.value !== null &&
      (!validAnnotationScalar(entry.value) || typeof entry.value !== input.valueType)
    )
      errors.push(
        diagnostic(
          "seq.annotation.value.type",
          `Expected finite ${input.valueType} value.`,
          `/values/${index}/value`,
        ),
      );
  });
  return errors.length
    ? resultError(errors)
    : resultOk(
        immutable({
          ...input,
          values: input.values.map((entry) => ({ ...entry })),
        }) as SparseValuesAnnotationModel,
      );
};
export interface SeqModelPackageBoundary {
  readonly data: import("../data/index.js").SeqDataPackageBoundary;
  readonly moduleName: "model";
}
