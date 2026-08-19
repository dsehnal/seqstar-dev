import type { SeqCoordsPackageBoundary } from "@seq-star/seq-coords";
import type { DeepReadonly, JsonObject, Result } from "@seq-star/seq-core";
import { isJsonSafeValue } from "@seq-star/seq-core";
import type { SeqModelPackageBoundary } from "@seq-star/seq-core/model";
import { type Static, Type } from "typebox";
import { Value } from "typebox/value";

const SerializedValueShapeSchema = Type.Cyclic(
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
const SerializedObjectShapeSchema = Type.Record(Type.String(), SerializedValueShapeSchema);

/** Shape-only TypeBox artifact; use validateSeqViewSpecShape for JS runtime validation. */
export const SeqViewSpecSchema = Type.Object(
  {
    kind: Type.Literal("seq-view-spec"),
    version: Type.Literal("0.1.0"),
    id: Type.String({ pattern: "^[A-Za-z][A-Za-z0-9._:-]*$" }),
    sequences: Type.Array(SerializedObjectShapeSchema, { minItems: 1 }),
    views: Type.Array(SerializedObjectShapeSchema, { minItems: 1 }),
    assemblies: Type.Optional(Type.Array(SerializedObjectShapeSchema)),
    alignments: Type.Optional(Type.Array(SerializedObjectShapeSchema)),
    annotations: Type.Optional(Type.Array(SerializedObjectShapeSchema)),
    metadata: Type.Optional(SerializedObjectShapeSchema),
    provenance: Type.Optional(SerializedObjectShapeSchema),
    requires: Type.Optional(Type.Array(Type.String())),
    extensions: Type.Optional(SerializedObjectShapeSchema),
  },
  { additionalProperties: false },
);

/** P02 owns the portable document identity surface; P11 fills every nested schema. */
export interface SeqViewSpec extends JsonObject {
  readonly kind: "seq-view-spec";
  readonly version: "0.1.0";
  readonly id: string;
  readonly sequences: readonly JsonObject[];
  readonly views: readonly JsonObject[];
  readonly assemblies?: readonly JsonObject[];
  readonly alignments?: readonly JsonObject[];
  readonly annotations?: readonly JsonObject[];
  readonly metadata?: JsonObject;
  readonly provenance?: JsonObject;
  readonly requires?: readonly string[];
  readonly extensions?: JsonObject;
}
export type SeqViewSpecInput = SeqViewSpec;

export const validateSeqViewSpecShape = (input: unknown): Result<SeqViewSpec> => {
  try {
    if (isJsonSafeValue(input) && Value.Check(SeqViewSpecSchema, input)) {
      return { ok: true, value: input as SeqViewSpec, diagnostics: [] };
    }
  } catch {
    // A hostile accessor may change between the JSON guard and schema check.
  }
  return {
    ok: false,
    diagnostics: [
      {
        code: "seqviewspec.shape.invalid",
        severity: "error",
        message: "Input does not match the SeqViewSpec 0.1 envelope.",
      },
    ],
  };
};

export const Sha256DigestPattern = "^sha256-[0-9a-f]{64}$";
export const SeqViewSpecDigestSchema = Type.Object(
  {
    algorithm: Type.Literal("sha256"),
    value: Type.String({ pattern: Sha256DigestPattern }),
    canonicalization: Type.Literal("RFC8785"),
  },
  { additionalProperties: false },
);
export type SeqViewSpecDigest = DeepReadonly<Static<typeof SeqViewSpecDigestSchema>>;
export type Sha256Digest = SeqViewSpecDigest["value"];
export const isSha256Digest = (value: unknown): value is Sha256Digest =>
  typeof value === "string" && new RegExp(Sha256DigestPattern).test(value);
export const isSeqViewSpecDigest = (value: unknown): value is SeqViewSpecDigest => {
  try {
    return isJsonSafeValue(value) && Value.Check(SeqViewSpecDigestSchema, value);
  } catch {
    return false;
  }
};

/** P11 implements RFC 8785 + SHA-256; this declaration prevents alternate digest formats. */
export type SeqViewSpecDigestFunction = (
  document: SeqViewSpec,
) => Promise<SeqViewSpecDigest["value"]>;

export interface ActiveSeqViewSpecProjection {
  readonly componentId: string;
  readonly requestId: string;
  readonly generation: number;
  readonly documentId: string;
  readonly viewId?: string;
  readonly digest?: SeqViewSpecDigest["value"];
  readonly status: "accepted" | "rendered" | "degraded";
}

/** @deprecated P01 package-boundary marker retained while consumers move to named contracts. */
export interface SeqViewSpecPackageBoundary {
  readonly coordinates: SeqCoordsPackageBoundary;
  readonly model: SeqModelPackageBoundary;
  readonly packageName: "@seq-star/seq-view-spec";
}
