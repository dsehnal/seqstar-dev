import { Type } from "typebox";
import { Value } from "typebox/value";

export type JsonPrimitive = string | number | boolean | null;
export type DeepReadonly<Value> = Value extends (...args: never[]) => unknown
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
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
const JsonSchema = Type.Cyclic(
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
export const DiagnosticSchema = Type.Object(
  {
    code: Type.String({ minLength: 1 }),
    severity: Type.Union([Type.Literal("info"), Type.Literal("warning"), Type.Literal("error")]),
    message: Type.String(),
    path: Type.Optional(Type.String({ pattern: "^(?:$|/)" })),
    details: Type.Optional(Type.Record(Type.String(), JsonSchema)),
  },
  { additionalProperties: false },
);
export interface Diagnostic {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly path?: string;
  readonly details?: JsonObject;
}
export type Result<T> =
  | { readonly ok: true; readonly value: T; readonly diagnostics: readonly Diagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };
export const resultOk = <T>(value: T, diagnostics: readonly Diagnostic[] = []): Result<T> => ({
  ok: true,
  value,
  diagnostics: Object.freeze([...diagnostics]),
});
export const resultError = (diagnostics: readonly Diagnostic[]): Result<never> => ({
  ok: false,
  diagnostics: Object.freeze([...diagnostics]),
});
export const diagnostic = (
  code: string,
  message: string,
  path?: string,
  details?: JsonObject,
): Diagnostic => ({
  code,
  severity: "error",
  message,
  ...(path === undefined ? {} : { path }),
  ...(details === undefined ? {} : { details }),
});
export const isJsonSafeValue = (value: unknown): value is JsonValue => {
  const seen = new WeakSet<object>();
  const check = (candidate: unknown): boolean => {
    if (candidate === null || typeof candidate === "string" || typeof candidate === "boolean")
      return true;
    if (typeof candidate === "number") return Number.isFinite(candidate);
    if (typeof candidate !== "object" || seen.has(candidate)) return false;
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
export const StableIdPattern = /^[A-Za-z][A-Za-z0-9._:-]*$/;
export const isStableId = (value: unknown): value is string =>
  typeof value === "string" && StableIdPattern.test(value);
export const validateStableId = (value: unknown, path = ""): Result<string> =>
  isStableId(value)
    ? resultOk(value)
    : resultError([
        diagnostic(
          "seq.id.invalid",
          "ID must start with a letter and contain only letters, digits, '.', '_', ':', or '-'.",
          path,
        ),
      ]);
export const uniqueStableIds = (
  values: readonly string[],
  path = "",
): Result<readonly string[]> => {
  const errors: Diagnostic[] = [];
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (!isStableId(value))
      errors.push(diagnostic("seq.id.invalid", "Invalid stable ID.", `${path}/${index}`));
    else if (seen.has(value))
      errors.push(
        diagnostic("seq.id.duplicate", `Duplicate stable ID '${value}'.`, `${path}/${index}`),
      );
    else seen.add(value);
  });
  return errors.length ? resultError(errors) : resultOk(Object.freeze([...values]));
};
export const immutable = <T>(value: T): DeepReadonly<T> => {
  if (Array.isArray(value))
    return Object.freeze(value.map((item) => immutable(item))) as DeepReadonly<T>;
  if (value !== null && typeof value === "object") {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) copy[key] = immutable(item);
    return Object.freeze(copy) as DeepReadonly<T>;
  }
  return value as DeepReadonly<T>;
};
/** Biological positions count Unicode code points, never UTF-16 code units. */
export const codePointLength = (value: string): number => Array.from(value).length;
export const codePointAt = (value: string, position: number): string | undefined =>
  Array.from(value)[position];
export interface SeqDataPackageBoundary {
  readonly moduleName: "data";
}
