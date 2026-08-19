import { Type } from "typebox";
import { Value } from "typebox/value";

export type JsonPrimitive = string | number | boolean | null;
export type DeepReadonly<Value> = Value extends (...arguments_: never[]) => unknown
  ? never
  : Value extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
      : Value;
export type JsonArray = readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}
/** Canonical serialized-value type; class instances and functions are not structurally assignable. */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/** TypeBox shape artifact only. Runtime boundaries must call isJsonSafeValue before Value.Check. */
const JsonValueShapeSchema = Type.Cyclic(
  {
    JsonValue: Type.Union([
      Type.String(),
      Type.Number(),
      Type.Boolean(),
      Type.Null(),
      Type.Array(Type.Ref("JsonValue")),
      Type.Record(Type.String(), Type.Ref("JsonValue")),
    ]),
  },
  "JsonValue",
);
const JsonObjectShapeSchema = Type.Record(Type.String(), JsonValueShapeSchema);

/** Shape-only TypeBox artifact; use isDiagnostic for JS runtime validation. */
export const DiagnosticSchema = Type.Object(
  {
    code: Type.String({ minLength: 1 }),
    severity: Type.Union([Type.Literal("info"), Type.Literal("warning"), Type.Literal("error")]),
    message: Type.String(),
    path: Type.Optional(Type.String({ pattern: "^(?:$|/)" })),
    details: Type.Optional(JsonObjectShapeSchema),
  },
  { additionalProperties: false },
);

/** Stable, serializable diagnostic shared by all Seq* packages. */
export interface Diagnostic {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly path?: string;
  readonly details?: JsonObject;
}

export type Result<Value> =
  | { readonly ok: true; readonly value: Value; readonly diagnostics: readonly Diagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

export const resultOk = <Value>(
  value: Value,
  diagnostics: readonly Diagnostic[] = [],
): Result<Value> => ({
  ok: true,
  value,
  diagnostics,
});
export const resultError = (diagnostics: readonly Diagnostic[]): Result<never> => ({
  ok: false,
  diagnostics,
});

/** Checks the JSON-only rule used by documents, message envelopes, and diagnostics. */
export const isJsonSafeValue = (value: unknown): value is JsonValue => {
  const seen = new WeakSet<object>();
  const check = (candidate: unknown): boolean => {
    if (candidate === null || typeof candidate === "string" || typeof candidate === "boolean")
      return true;
    if (typeof candidate === "number") return Number.isFinite(candidate);
    if (typeof candidate !== "object") return false;
    if (seen.has(candidate)) return false;
    seen.add(candidate);
    if (Array.isArray(candidate)) return candidate.every(check);
    if (Object.getPrototypeOf(candidate) !== Object.prototype) return false;
    return Object.values(candidate).every(check);
  };
  try {
    return check(value);
  } catch {
    return false;
  }
};

export const isDiagnostic = (value: unknown): value is Diagnostic => {
  try {
    return isJsonSafeValue(value) && Value.Check(DiagnosticSchema, value);
  } catch {
    return false;
  }
};

/** Runtime-model primitives deliberately exclude renderer and harness state. */
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
}
export interface SequenceModel {
  readonly id: string;
  readonly coordinateSpace: string;
  readonly alphabet: "protein" | "dna" | "rna" | "custom";
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
  readonly positions: readonly (number | null)[];
}
export interface AlignmentModel {
  readonly id: string;
  readonly coordinateSpace: string;
  readonly length: number;
  readonly members: readonly AlignmentMemberModel[];
  readonly provenance?: Provenance;
  readonly extensions?: JsonObject;
}
export interface NormalizedSeqModel {
  readonly sequences: readonly SequenceModel[];
  readonly assemblies?: readonly AssemblyModel[];
  readonly alignments?: readonly AlignmentModel[];
}

/** @deprecated P01 package-boundary marker retained while consumers move to named contracts. */
export interface SeqCorePackageBoundary {
  readonly packageName: "@seq-star/seq-core";
}
