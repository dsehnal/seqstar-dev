import type { SeqCoordsPackageBoundary } from "@seq-star/seq-coords";
import {
  codePointLength,
  type DeepReadonly,
  type Diagnostic,
  diagnostic,
  type JsonArray,
  type JsonObject,
  type JsonValue,
  type Result,
  resultError,
  resultOk,
} from "@seq-star/seq-core";
import type { SeqModelPackageBoundary } from "@seq-star/seq-core/model";
import { type Static, type TProperties, Type } from "typebox";
import { Value } from "typebox/value";

const ID = "^[A-Za-z][A-Za-z0-9._:-]*$",
  HEX = "^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$",
  NS = "^[A-Za-z][A-Za-z0-9-]*(?:\\.[A-Za-z][A-Za-z0-9-]*)+(?:[.-][A-Za-z0-9-]+)*$";
const I = Type.String({ pattern: ID }),
  N = Type.Number(),
  Z = Type.Integer({ minimum: 0 }),
  H = Type.String({ pattern: HEX }),
  S = Type.Union([Type.String(), N, Type.Boolean()]);
const J = Type.Cyclic(
  {
    value: Type.Union([
      Type.String(),
      N,
      Type.Boolean(),
      Type.Null(),
      Type.Array(Type.Ref("value")),
      Type.Record(Type.String(), Type.Ref("value")),
    ]),
  },
  "value",
);
const O = <P extends TProperties>(properties: P, options: Record<string, unknown> = {}) =>
  Type.Object(properties, { additionalProperties: false, ...options });
const X = Type.Record(Type.String({ pattern: NS }), J),
  Link = O({ label: Type.String(), href: Type.String() });
const Meta = O({
  label: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  tags: Type.Optional(Type.Array(Type.String())),
  links: Type.Optional(Type.Array(Link)),
});
const Prov = O({
  label: Type.String(),
  description: Type.Optional(Type.String()),
  uri: Type.Optional(Type.String()),
  citation: Type.Optional(Type.String()),
  generatedBy: Type.Optional(Type.String()),
});
const Ident = O({
  namespace: Type.String({ minLength: 1 }),
  value: Type.String({ minLength: 1 }),
  version: Type.Optional(Type.String()),
});
const Seq = O({
  id: I,
  coordinateSpace: I,
  alphabet: Type.Union([
    Type.Literal("protein"),
    Type.Literal("dna"),
    Type.Literal("rna"),
    Type.Literal("custom"),
  ]),
  residues: Type.String({ minLength: 1 }),
  metadata: Type.Optional(Meta),
  identifiers: Type.Optional(Type.Array(Ident)),
  provenance: Type.Optional(Prov),
  extensions: Type.Optional(X),
});
const AM = O({
  id: I,
  sequence: I,
  role: Type.Optional(Type.String()),
  label: Type.Optional(Type.String()),
});
const Asm = O({
  id: I,
  members: Type.Array(AM, { minItems: 1 }),
  metadata: Type.Optional(Meta),
  identifiers: Type.Optional(Type.Array(Ident)),
  provenance: Type.Optional(Prov),
  extensions: Type.Optional(X),
});
const AlM = O({
  id: I,
  sequence: I,
  positions: Type.Array(Type.Union([Z, Type.Null()])),
  metadata: Type.Optional(Meta),
});
const Al = O({
  id: I,
  coordinateSpace: I,
  length: Z,
  members: Type.Array(AlM, { minItems: 1 }),
  metadata: Type.Optional(Meta),
  provenance: Type.Optional(Prov),
  extensions: Type.Optional(X),
});
const Point = O({ kind: Type.Literal("point"), space: I, position: Z }),
  Interval = O({ kind: Type.Literal("interval"), space: I, start: Z, end: Z }),
  Boundary = O({ kind: Type.Literal("boundary"), space: I, position: Z }),
  L = Type.Union([Point, Interval, Boundary]);
const Item = O({
  id: I,
  loci: Type.Array(L, { minItems: 1 }),
  label: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  value: Type.Optional(S),
  properties: Type.Optional(Type.Record(Type.String(), Type.Union([S, Type.Null()]))),
  links: Type.Optional(Type.Array(Link)),
});
const AB = {
  id: I,
  semanticType: Type.String({ minLength: 1 }),
  metadata: Type.Optional(Meta),
  provenance: Type.Optional(Prov),
  extensions: Type.Optional(X),
};
const LA = O({ ...AB, kind: Type.Literal("loci"), items: Type.Array(Item, { minItems: 1 }) });
const VD = Type.Union([
  O({ encoding: Type.Literal("dense"), data: Type.Array(Type.Union([S, Type.Null()])) }),
  O({
    encoding: Type.Literal("sparse"),
    data: Type.Array(O({ position: Z, value: Type.Union([S, Type.Null()]) })),
  }),
]);
const VA = O({
  ...AB,
  kind: Type.Literal("values"),
  space: I,
  valueType: Type.Union([
    Type.Literal("number"),
    Type.Literal("category"),
    Type.Literal("boolean"),
  ]),
  values: VD,
});
const Endpoint = O({ role: Type.String({ minLength: 1 }), loci: Type.Array(L, { minItems: 1 }) });
const RI = O({
  id: I,
  endpoints: Type.Array(Endpoint, { minItems: 2 }),
  label: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  value: Type.Optional(S),
  properties: Type.Optional(Type.Record(Type.String(), Type.Union([S, Type.Null()]))),
});
const RA = O({
    ...AB,
    kind: Type.Literal("relationships"),
    directed: Type.Optional(Type.Boolean()),
    items: Type.Array(RI, { minItems: 1 }),
  }),
  A = Type.Union([LA, VA, RA]);
const C = Type.Union([
  O({ kind: Type.Literal("fixed"), color: H }),
  O({
    kind: Type.Literal("categorical"),
    field: Type.String({ pattern: "^(?:id|value|properties\\.[^.]+)$" }),
    colors: Type.Record(Type.String(), H),
    fallback: H,
  }),
  O({
    kind: Type.Literal("continuous"),
    field: Type.Literal("value"),
    domain: Type.Tuple([N, N]),
    range: Type.Tuple([H, H]),
    clamp: Type.Optional(Type.Boolean()),
    missing: H,
  }),
]);
const LB = {
    id: I,
    opacity: Type.Optional(N),
    tooltip: Type.Optional(O({ fields: Type.Array(Type.String(), { minItems: 1 }) })),
    extensions: Type.Optional(X),
  },
  Fallback = O({
    representation: Type.Union([
      Type.Literal("blocks"),
      Type.Literal("markers"),
      Type.Literal("bars"),
      Type.Literal("heatmap"),
      Type.Literal("swatch"),
    ]),
    color: Type.Optional(C),
  }),
  ALB = { ...LB, annotation: I, fallback: Type.Optional(Fallback) },
  Fixed = O({ kind: Type.Literal("fixed"), color: H });
const SL = O({
    ...LB,
    representation: Type.Literal("sequence"),
    sequence: I,
    showLetters: Type.Optional(Type.Boolean()),
    color: Type.Optional(Fixed),
  }),
  XL = O({
    ...LB,
    representation: Type.Literal("alignment"),
    alignment: I,
    members: Type.Optional(Type.Array(I)),
    showLetters: Type.Optional(Type.Boolean()),
    color: Type.Optional(Fixed),
  });
const BL = O({
    ...ALB,
    representation: Type.Literal("blocks"),
    laneMode: Type.Optional(Type.Union([Type.Literal("overlay"), Type.Literal("stack")])),
    color: Type.Optional(C),
  }),
  ML = O({
    ...ALB,
    representation: Type.Literal("markers"),
    shape: Type.Optional(
      Type.Union([Type.Literal("circle"), Type.Literal("diamond"), Type.Literal("line")]),
    ),
    color: Type.Optional(C),
  }),
  BR = O({
    ...ALB,
    representation: Type.Literal("bars"),
    scale: Type.Optional(
      O({
        domain: Type.Optional(Type.Tuple([N, N])),
        baseline: Type.Optional(N),
        clamp: Type.Optional(Type.Boolean()),
      }),
    ),
    color: Type.Optional(C),
  }),
  HL = O({ ...ALB, representation: Type.Literal("heatmap"), color: C }),
  SW = O({ ...ALB, representation: Type.Literal("swatch"), color: C }),
  LK = O({ ...ALB, representation: Type.Literal("links"), color: Type.Optional(C) });
const Layer = Type.Union([SL, XL, BL, ML, BR, HL, SW, LK]);
const Axis = O({
  segments: Type.Array(
    O({ id: I, space: I, start: Z, end: Z, label: Type.Optional(Type.String()) }),
    { minItems: 1 },
  ),
  gap: Type.Optional(N),
  ruler: Type.Optional(
    O({
      visible: Type.Optional(Type.Boolean()),
      numbering: Type.Optional(Type.Union([Type.Literal("zero-based"), Type.Literal("one-based")])),
    }),
  ),
});
const Track = O({
  id: I,
  layers: Type.Array(Layer, { minItems: 1 }),
  label: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  height: Type.Optional(N),
  extensions: Type.Optional(X),
});
const Sect = O({
  id: I,
  tracks: Type.Array(Track, { minItems: 1 }),
  label: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  initiallyCollapsed: Type.Optional(Type.Boolean()),
  extensions: Type.Optional(X),
});
const View = O({
  id: I,
  context: Type.Optional(O({ assembly: Type.Optional(I), alignment: Type.Optional(I) })),
  axis: Axis,
  sections: Type.Array(Sect, { minItems: 1 }),
  initialViewport: Type.Optional(
    Type.Union([
      O({ kind: Type.Literal("fit") }),
      O({ kind: Type.Literal("locus"), locus: Type.Union([Point, Interval]) }),
    ]),
  ),
  metadata: Type.Optional(Meta),
  extensions: Type.Optional(X),
});
export const SeqViewSpecSchema = O(
  {
    kind: Type.Literal("seq-view-spec"),
    version: Type.String({
      pattern: "^(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)$",
    }),
    id: I,
    metadata: Type.Optional(Meta),
    requires: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    sequences: Type.Array(Seq, { minItems: 1 }),
    assemblies: Type.Optional(Type.Array(Asm)),
    alignments: Type.Optional(Type.Array(Al)),
    annotations: Type.Optional(Type.Array(A)),
    views: Type.Array(View, { minItems: 1 }),
    provenance: Type.Optional(Prov),
    extensions: Type.Optional(X),
  },
  { $id: "https://seq-star.org/schema/seq-view-spec-0.1.schema.json" },
);
export type SeqViewSpec = DeepReadonly<Static<typeof SeqViewSpecSchema>>;
export type SeqViewSpecInput = SeqViewSpec;
export type Locus = DeepReadonly<Static<typeof L>>;
export type ColorEncoding = DeepReadonly<Static<typeof C>>;
type Sequence = SeqViewSpec["sequences"][number];
type Alignment = NonNullable<SeqViewSpec["alignments"]>[number];
type Annotation = NonNullable<SeqViewSpec["annotations"]>[number];
type LayerValue =
  SeqViewSpec["views"][number]["sections"][number]["tracks"][number]["layers"][number];
type ScalarValue = string | number | boolean | null;
const pp = (...parts: readonly (string | number)[]) =>
  `/${parts
    .map(String)
    .map((part) => part.replaceAll("~", "~0").replaceAll("/", "~1"))
    .join("/")}`;
const num = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const error = (errors: Diagnostic[], code: string, message: string, path: string) =>
  errors.push(diagnostic(code, message, path));
const loneSurrogate = (value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return true;
  }
  return false;
};
const snapshotJson = (value: unknown): JsonValue | undefined => {
  const seen = new WeakSet<object>();
  const visit = (candidate: unknown, depth = 0): JsonValue | undefined => {
    if (depth > 200) return undefined;
    if (candidate === null || typeof candidate === "boolean") return candidate;
    if (typeof candidate === "string") return loneSurrogate(candidate) ? undefined : candidate;
    if (typeof candidate === "number") return num(candidate) ? candidate : undefined;
    if (typeof candidate !== "object" || seen.has(candidate)) return undefined;
    seen.add(candidate);
    if (Array.isArray(candidate)) {
      const keys = Reflect.ownKeys(candidate);
      if (
        keys.some(
          (key) =>
            key !== "length" && (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(key)),
        )
      )
        return undefined;
      const copy: JsonValue[] = [];
      for (let index = 0; index < candidate.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(candidate, String(index));
        if (!descriptor?.enumerable) return undefined;
        if (!("value" in descriptor)) return undefined;
        const child = visit(descriptor.value, depth + 1);
        if (child === undefined) return undefined;
        copy.push(child);
      }
      return copy as JsonArray;
    }
    if (Object.getPrototypeOf(candidate) !== Object.prototype) return undefined;
    const copy: Record<string, JsonValue> = {};
    for (const key of Reflect.ownKeys(candidate)) {
      if (typeof key !== "string") return undefined;
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      if (!descriptor?.enumerable) return undefined;
      if (!("value" in descriptor)) return undefined;
      const child = visit(descriptor.value, depth + 1);
      if (child === undefined) return undefined;
      copy[key] = child;
    }
    return copy as JsonObject;
  };
  try {
    return visit(value);
  } catch {
    return undefined;
  }
};
export const isSeqViewSpec = (value: unknown): value is SeqViewSpec => {
  try {
    const snapshot = snapshotJson(value);
    return (
      snapshot !== undefined &&
      snapshot !== null &&
      !Array.isArray(snapshot) &&
      Value.Check(SeqViewSpecSchema, snapshot)
    );
  } catch {
    return false;
  }
};
const http = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};
const links = (
  value: readonly { readonly href: string }[] | undefined,
  path: string,
  errors: Diagnostic[],
) => {
  value?.forEach((link, index) => {
    if (!http(link.href))
      error(
        errors,
        "seqviewspec.url.scheme",
        "URL must use HTTP or HTTPS.",
        `${path}/links/${index}/href`,
      );
  });
};
const metadataUrls = (
  value: { readonly metadata?: { readonly links?: readonly { readonly href: string }[] } },
  path: string,
  errors: Diagnostic[],
) => links(value.metadata?.links, `${path}/metadata`, errors);
const provenanceUrl = (
  value: { readonly provenance?: { readonly uri?: string } },
  path: string,
  errors: Diagnostic[],
) => {
  if (value.provenance?.uri && !http(value.provenance.uri))
    error(
      errors,
      "seqviewspec.url.scheme",
      "URL must use HTTP or HTTPS.",
      `${path}/provenance/uri`,
    );
};
const resourceUrls = (
  value: {
    readonly metadata?: { readonly links?: readonly { readonly href: string }[] };
    readonly provenance?: { readonly uri?: string };
  },
  path: string,
  errors: Diagnostic[],
) => {
  metadataUrls(value, path, errors);
  provenanceUrl(value, path, errors);
};
const extensions = (
  value: Readonly<Record<string, unknown>> | undefined,
  requires: ReadonlySet<string>,
  path: string,
  errors: Diagnostic[],
) => {
  for (const key of Object.keys(value ?? {}))
    if (!requires.has(key))
      error(
        errors,
        "seqviewspec.extension.requires",
        `Extension '${key}' must be named in requires.`,
        `${path}/extensions/${key}`,
      );
};
const locus = (
  value: Locus,
  path: string,
  spaces: ReadonlyMap<string, number>,
  errors: Diagnostic[],
) => {
  const length = spaces.get(value.space);
  if (length === undefined)
    return error(
      errors,
      "seqviewspec.reference.space.missing",
      `Unknown coordinate space '${value.space}'.`,
      `${path}/space`,
    );
  if (
    (value.kind === "point" && value.position >= length) ||
    (value.kind === "boundary" && value.position > length) ||
    (value.kind === "interval" && (value.start >= value.end || value.end > length))
  )
    error(errors, "seqviewspec.locus.bounds", "Locus is outside its coordinate space.", path);
};
const annotationSpaces = (annotation: Annotation): ReadonlySet<string> => {
  const result = new Set<string>();
  if (annotation.kind === "values") result.add(annotation.space);
  else if (annotation.kind === "loci")
    for (const item of annotation.items)
      for (const itemLocus of item.loci) result.add(itemLocus.space);
  else
    for (const item of annotation.items)
      for (const endpoint of item.endpoints)
        for (const itemLocus of endpoint.loci) result.add(itemLocus.space);
  return result;
};
const compatible = (representation: string, annotation: Annotation, fallback = false): boolean =>
  representation === "bars"
    ? annotation.kind === "values" && annotation.valueType === "number"
    : representation === "heatmap"
      ? annotation.kind === "values"
      : representation === "swatch"
        ? annotation.kind === "values" &&
          (annotation.valueType === "category" || annotation.valueType === "boolean")
        : representation === "links"
          ? annotation.kind === "relationships"
          : (representation === "blocks" || representation === "markers") &&
            (annotation.kind === "loci" || (fallback && annotation.kind === "relationships"));
const annotationLoci = (annotation: Annotation): readonly Locus[] => {
  if (annotation.kind === "values") return [];
  if (annotation.kind === "loci") return annotation.items.flatMap((item) => item.loci);
  return annotation.items.flatMap((item) => item.endpoints.flatMap((endpoint) => endpoint.loci));
};
const representationAcceptsLoci = (representation: string, annotation: Annotation): boolean => {
  if (representation !== "blocks" && representation !== "markers") return true;
  return annotationLoci(annotation).every((itemLocus) =>
    representation === "blocks"
      ? itemLocus.kind === "point" || itemLocus.kind === "interval"
      : itemLocus.kind === "point" || itemLocus.kind === "boundary",
  );
};
const checkColor = (color: ColorEncoding | undefined, path: string, errors: Diagnostic[]) => {
  if (!color) return;
  if (color.kind === "continuous") {
    const [start = Number.NaN, end = Number.NaN] = color.domain;
    if (start >= end)
      error(
        errors,
        "seqviewspec.color.domain.invalid",
        "Continuous color domains must increase.",
        `${path}/domain`,
      );
  }
  if (color.kind === "categorical")
    for (const key of Object.keys(color.colors))
      try {
        const value: unknown = JSON.parse(key);
        if (
          value === null ||
          (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") ||
          (typeof value === "number" && !num(value)) ||
          JSON.stringify(value) !== key
        )
          error(
            errors,
            "seqviewspec.color.categorical-key.invalid",
            "Categorical color keys must be canonical JSON scalar values.",
            `${path}/colors/${key}`,
          );
      } catch {
        error(
          errors,
          "seqviewspec.color.categorical-key.invalid",
          "Categorical color keys must be canonical JSON scalar values.",
          `${path}/colors/${key}`,
        );
      }
};
const layer = (
  value: LayerValue,
  path: string,
  annotations: ReadonlyMap<string, Annotation>,
  sequences: ReadonlyMap<string, Sequence>,
  alignments: ReadonlyMap<string, Alignment>,
  axis: ReadonlySet<string>,
  requires: ReadonlySet<string>,
  errors: Diagnostic[],
) => {
  if (value.opacity !== undefined && (value.opacity < 0 || value.opacity > 1))
    error(
      errors,
      "seqviewspec.layer.opacity.invalid",
      "Opacity must be between 0 and 1.",
      `${path}/opacity`,
    );
  value.tooltip?.fields.forEach((field, index) => {
    if (!/^(?:id|label|description|value|properties\.[^.]+)$/.test(field))
      error(
        errors,
        "seqviewspec.tooltip.field.invalid",
        "Invalid tooltip field.",
        `${path}/tooltip/fields/${index}`,
      );
  });
  extensions(value.extensions, requires, path, errors);
  if (value.representation === "sequence") {
    const sequence = sequences.get(value.sequence);
    if (!sequence)
      error(errors, "seqviewspec.layer.sequence.missing", "Unknown sequence.", `${path}/sequence`);
    else if (!axis.has(sequence.coordinateSpace))
      error(
        errors,
        "seqviewspec.layer.axis.coverage",
        "Layer space is absent from the view axis.",
        `${path}/sequence`,
      );
    return;
  }
  if (value.representation === "alignment") {
    const alignment = alignments.get(value.alignment);
    if (!alignment)
      error(
        errors,
        "seqviewspec.layer.alignment.missing",
        "Unknown alignment.",
        `${path}/alignment`,
      );
    else {
      if (!axis.has(alignment.coordinateSpace))
        error(
          errors,
          "seqviewspec.layer.axis.coverage",
          "Layer space is absent from the view axis.",
          `${path}/alignment`,
        );
      const members = new Set<string>();
      value.members?.forEach((member, index) => {
        if (members.has(member))
          error(
            errors,
            "seqviewspec.alignment.layer-members.duplicate",
            "Alignment member IDs must be unique.",
            `${path}/members/${index}`,
          );
        members.add(member);
        if (!alignment.members.some((candidate) => candidate.id === member))
          error(
            errors,
            "seqviewspec.alignment.layer-member.missing",
            "Unknown alignment member.",
            `${path}/members/${index}`,
          );
      });
    }
    return;
  }
  const annotation = annotations.get(value.annotation);
  if (!annotation)
    error(
      errors,
      "seqviewspec.layer.annotation.missing",
      "Unknown annotation.",
      `${path}/annotation`,
    );
  else {
    if (!compatible(value.representation, annotation))
      error(
        errors,
        "seqviewspec.layer.annotation.incompatible",
        "Layer representation is incompatible with its annotation.",
        `${path}/annotation`,
      );
    else if (!representationAcceptsLoci(value.representation, annotation))
      error(
        errors,
        "seqviewspec.layer.locus.incompatible",
        "Layer representation is incompatible with annotation locus kinds.",
        `${path}/annotation`,
      );
    for (const space of annotationSpaces(annotation))
      if (!axis.has(space))
        error(
          errors,
          "seqviewspec.layer.axis.coverage",
          "Annotation space is absent from the view axis.",
          `${path}/annotation`,
        );
    if (value.fallback && !compatible(value.fallback.representation, annotation, true))
      error(
        errors,
        "seqviewspec.layer.fallback.incompatible",
        "Fallback representation is incompatible with its annotation.",
        `${path}/fallback/representation`,
      );
    else if (
      value.fallback &&
      !representationAcceptsLoci(value.fallback.representation, annotation)
    )
      error(
        errors,
        "seqviewspec.layer.locus.incompatible",
        "Fallback representation is incompatible with annotation locus kinds.",
        `${path}/fallback/representation`,
      );
  }
  checkColor(value.color, `${path}/color`, errors);
  if (value.fallback) checkColor(value.fallback.color, `${path}/fallback/color`, errors);
  if (
    value.representation === "bars" &&
    value.scale?.domain &&
    (value.scale.domain[0] ?? Number.NaN) >= (value.scale.domain[1] ?? Number.NaN)
  )
    error(
      errors,
      "seqviewspec.scale.domain.invalid",
      "Bar scale domains must increase.",
      `${path}/scale/domain`,
    );
};
export const validateSeqViewSpec = (input: unknown): Result<SeqViewSpec> => {
  const snapshot = snapshotJson(input);
  if (
    snapshot === undefined ||
    snapshot === null ||
    Array.isArray(snapshot) ||
    !Value.Check(SeqViewSpecSchema, snapshot)
  )
    return resultError([
      diagnostic(
        "seqviewspec.shape.invalid",
        "Input does not match strict SeqViewSpec 0.1 JSON shape.",
        "",
      ),
    ]);
  const d = snapshot as SeqViewSpec,
    errors: Diagnostic[] = [],
    ids = new Map<string, string>(),
    spaces = new Map<string, number>(),
    sequences = new Map<string, Sequence>(),
    assemblies = new Set<string>(),
    alignments = new Map<string, Alignment>(),
    annotations = new Map<string, Annotation>(),
    requires = new Set<string>();
  const add = (id: string, path: string) => {
    const prior = ids.get(id);
    if (prior)
      error(errors, "seqviewspec.id.duplicate", `ID '${id}' already exists at ${prior}.`, path);
    else ids.set(id, path);
  };
  const [major] = d.version.split(".");
  if (major !== "0")
    error(
      errors,
      "seqviewspec.version.unsupported",
      "Only compatible SeqViewSpec 0.x versions are supported.",
      "/version",
    );
  add(d.id, "/id");
  d.requires?.forEach((requirement, index) => {
    if (requires.has(requirement))
      error(
        errors,
        "seqviewspec.requires.duplicate",
        "Required capabilities must be unique.",
        pp("requires", index),
      );
    requires.add(requirement);
  });
  const coreCapabilities = new Set([
    "seqviewspec:representation/sequence",
    "seqviewspec:representation/alignment",
    "seqviewspec:representation/blocks",
    "seqviewspec:representation/markers",
    "seqviewspec:representation/bars",
    "seqviewspec:representation/heatmap",
    "seqviewspec:representation/swatch",
    "seqviewspec:representation/links",
  ]);
  const declaredExtensions = new Set<string>();
  const collectExtensions = (value: {
    readonly extensions?: Readonly<Record<string, unknown>>;
  }) => {
    for (const key of Object.keys(value.extensions ?? {})) declaredExtensions.add(key);
  };
  collectExtensions(d);
  d.sequences.forEach(collectExtensions);
  d.assemblies?.forEach(collectExtensions);
  d.alignments?.forEach(collectExtensions);
  d.annotations?.forEach(collectExtensions);
  d.views.forEach((view) => {
    collectExtensions(view);
    view.sections.forEach((section) => {
      collectExtensions(section);
      section.tracks.forEach((track) => {
        collectExtensions(track);
        track.layers.forEach(collectExtensions);
      });
    });
  });
  d.requires?.forEach((requirement, index) => {
    if (!coreCapabilities.has(requirement) && !declaredExtensions.has(requirement))
      error(
        errors,
        "seqviewspec.requires.unknown",
        "Unknown required capability.",
        pp("requires", index),
      );
  });
  extensions(d.extensions, requires, "", errors);
  resourceUrls(d, "", errors);
  d.sequences.forEach((sequence, index) => {
    const path = pp("sequences", index);
    add(sequence.id, `${path}/id`);
    add(sequence.coordinateSpace, `${path}/coordinateSpace`);
    sequences.set(sequence.id, sequence);
    if (spaces.has(sequence.coordinateSpace))
      error(
        errors,
        "seqviewspec.coordinate-space.duplicate",
        "Coordinate spaces must be unique.",
        `${path}/coordinateSpace`,
      );
    else spaces.set(sequence.coordinateSpace, codePointLength(sequence.residues));
    if (/\s|-/u.test(sequence.residues))
      error(
        errors,
        "seqviewspec.sequence.residues.invalid",
        "Residues must be ungapped and whitespace-free.",
        `${path}/residues`,
      );
    const pattern =
      sequence.alphabet === "protein"
        ? /^[ACDEFGHIKLMNPQRSTVWYBXZJUO]+$/u
        : sequence.alphabet === "dna"
          ? /^[ACGTN]+$/u
          : sequence.alphabet === "rna"
            ? /^[ACGUN]+$/u
            : undefined;
    if (pattern && !pattern.test(sequence.residues))
      error(
        errors,
        "seqviewspec.sequence.alphabet.invalid",
        "Residues do not match the declared alphabet.",
        `${path}/residues`,
      );
    extensions(sequence.extensions, requires, path, errors);
    resourceUrls(sequence, path, errors);
  });
  d.assemblies?.forEach((assembly, index) => {
    const path = pp("assemblies", index);
    add(assembly.id, `${path}/id`);
    assemblies.add(assembly.id);
    const members = new Set<string>();
    assembly.members.forEach((member, memberIndex) => {
      const memberPath = pp("assemblies", index, "members", memberIndex);
      add(member.id, `${memberPath}/id`);
      if (members.has(member.id))
        error(
          errors,
          "seqviewspec.assembly.member.duplicate",
          "Assembly member IDs must be unique.",
          `${memberPath}/id`,
        );
      members.add(member.id);
      if (!sequences.has(member.sequence))
        error(
          errors,
          "seqviewspec.assembly.sequence.missing",
          `Unknown sequence '${member.sequence}'.`,
          `${memberPath}/sequence`,
        );
    });
    extensions(assembly.extensions, requires, path, errors);
    resourceUrls(assembly, path, errors);
  });
  d.alignments?.forEach((alignment, index) => {
    const path = pp("alignments", index);
    add(alignment.id, `${path}/id`);
    add(alignment.coordinateSpace, `${path}/coordinateSpace`);
    alignments.set(alignment.id, alignment);
    if (spaces.has(alignment.coordinateSpace))
      error(
        errors,
        "seqviewspec.coordinate-space.duplicate",
        "Coordinate spaces must be unique.",
        `${path}/coordinateSpace`,
      );
    else spaces.set(alignment.coordinateSpace, alignment.length);
    const members = new Set<string>();
    alignment.members.forEach((member, memberIndex) => {
      const memberPath = pp("alignments", index, "members", memberIndex);
      add(member.id, `${memberPath}/id`);
      if (members.has(member.id))
        error(
          errors,
          "seqviewspec.alignment.member.duplicate",
          "Alignment member IDs must be unique.",
          `${memberPath}/id`,
        );
      members.add(member.id);
      const sequence = sequences.get(member.sequence);
      metadataUrls(member, memberPath, errors);
      if (!sequence)
        error(
          errors,
          "seqviewspec.alignment.sequence.missing",
          `Unknown sequence '${member.sequence}'.`,
          `${memberPath}/sequence`,
        );
      if (member.positions.length !== alignment.length)
        error(
          errors,
          "seqviewspec.alignment.positions.length",
          "Positions length must equal alignment length.",
          `${memberPath}/positions`,
        );
      const positions = new Set<number>();
      let previous = -1;
      member.positions.forEach((position, positionIndex) => {
        if (position === null) return;
        const positionPath = pp(
          "alignments",
          index,
          "members",
          memberIndex,
          "positions",
          positionIndex,
        );
        if (sequence && position >= codePointLength(sequence.residues))
          error(
            errors,
            "seqviewspec.alignment.position.bounds",
            "Position is out of sequence bounds.",
            positionPath,
          );
        if (positions.has(position))
          error(
            errors,
            "seqviewspec.alignment.position.duplicate",
            "Positions must be unique.",
            positionPath,
          );
        positions.add(position);
        if (position <= previous)
          error(
            errors,
            "seqviewspec.alignment.position.order",
            "Positions must increase.",
            positionPath,
          );
        previous = position;
      });
    });
    extensions(alignment.extensions, requires, path, errors);
    resourceUrls(alignment, path, errors);
  });
  d.annotations?.forEach((annotation, index) => {
    const path = pp("annotations", index);
    add(annotation.id, `${path}/id`);
    annotations.set(annotation.id, annotation);
    extensions(annotation.extensions, requires, path, errors);
    resourceUrls(annotation, path, errors);
    if (annotation.kind === "loci")
      annotation.items.forEach((item, itemIndex) => {
        const itemPath = pp("annotations", index, "items", itemIndex);
        add(item.id, `${itemPath}/id`);
        item.loci.forEach((itemLocus, locusIndex) => {
          locus(
            itemLocus,
            pp("annotations", index, "items", itemIndex, "loci", locusIndex),
            spaces,
            errors,
          );
        });
        links(item.links, itemPath, errors);
      });
    else if (annotation.kind === "values") {
      const length = spaces.get(annotation.space);
      if (length === undefined)
        error(
          errors,
          "seqviewspec.reference.space.missing",
          `Unknown coordinate space '${annotation.space}'.`,
          `${path}/space`,
        );
      const matches = (value: ScalarValue) =>
        value === null ||
        (annotation.valueType === "number"
          ? num(value)
          : annotation.valueType === "category"
            ? typeof value === "string"
            : typeof value === "boolean");
      if (annotation.values.encoding === "dense") {
        if (length !== undefined && annotation.values.data.length !== length)
          error(
            errors,
            "seqviewspec.values.dense.length",
            "Dense values length must equal coordinate-space length.",
            `${path}/values/data`,
          );
        annotation.values.data.forEach((value, valueIndex) => {
          if (!matches(value))
            error(
              errors,
              "seqviewspec.values.type",
              "Value type does not match valueType.",
              pp("annotations", index, "values", "data", valueIndex),
            );
        });
      } else {
        const positions = new Set<number>();
        annotation.values.data.forEach((entry, entryIndex) => {
          const entryPath = pp("annotations", index, "values", "data", entryIndex);
          if (length !== undefined && entry.position >= length)
            error(
              errors,
              "seqviewspec.values.sparse.bounds",
              "Sparse position is out of bounds.",
              `${entryPath}/position`,
            );
          if (positions.has(entry.position))
            error(
              errors,
              "seqviewspec.values.sparse.duplicate",
              "Sparse positions must be unique.",
              `${entryPath}/position`,
            );
          positions.add(entry.position);
          if (!matches(entry.value))
            error(
              errors,
              "seqviewspec.values.type",
              "Value type does not match valueType.",
              `${entryPath}/value`,
            );
        });
      }
    } else
      annotation.items.forEach((item, itemIndex) => {
        const itemPath = pp("annotations", index, "items", itemIndex);
        add(item.id, `${itemPath}/id`);
        const roles = new Set<string>();
        item.endpoints.forEach((endpoint, endpointIndex) => {
          if (roles.has(endpoint.role))
            error(
              errors,
              "seqviewspec.relationship.endpoint-role.duplicate",
              "Endpoint roles must be unique.",
              pp("annotations", index, "items", itemIndex, "endpoints", endpointIndex, "role"),
            );
          roles.add(endpoint.role);
          endpoint.loci.forEach((itemLocus, locusIndex) => {
            locus(
              itemLocus,
              pp(
                "annotations",
                index,
                "items",
                itemIndex,
                "endpoints",
                endpointIndex,
                "loci",
                locusIndex,
              ),
              spaces,
              errors,
            );
          });
        });
      });
  });
  d.views.forEach((view, viewIndex) => {
    const path = pp("views", viewIndex);
    add(view.id, `${path}/id`);
    if (view.context?.assembly && !assemblies.has(view.context.assembly))
      error(
        errors,
        "seqviewspec.view.context.assembly.missing",
        "Unknown assembly context.",
        `${path}/context/assembly`,
      );
    if (view.context?.alignment && !alignments.has(view.context.alignment))
      error(
        errors,
        "seqviewspec.view.context.alignment.missing",
        "Unknown alignment context.",
        `${path}/context/alignment`,
      );
    extensions(view.extensions, requires, path, errors);
    resourceUrls(view, path, errors);
    const axis = new Set<string>();
    view.axis.segments.forEach((segment, segmentIndex) => {
      const segmentPath = pp("views", viewIndex, "axis", "segments", segmentIndex);
      add(segment.id, `${segmentPath}/id`);
      axis.add(segment.space);
      const length = spaces.get(segment.space);
      if (length === undefined)
        error(
          errors,
          "seqviewspec.axis.space.missing",
          "Unknown axis coordinate space.",
          `${segmentPath}/space`,
        );
      else if (segment.start >= segment.end || segment.end > length)
        error(
          errors,
          "seqviewspec.axis.bounds",
          "Axis segments must be non-empty and in bounds.",
          segmentPath,
        );
    });
    if (view.axis.gap !== undefined && view.axis.gap < 0)
      error(
        errors,
        "seqviewspec.axis.gap.invalid",
        "Axis gap must be non-negative.",
        `${path}/axis/gap`,
      );
    if (view.initialViewport?.kind === "locus") {
      locus(view.initialViewport.locus, `${path}/initialViewport/locus`, spaces, errors);
      if (!axis.has(view.initialViewport.locus.space))
        error(
          errors,
          "seqviewspec.viewport.axis.coverage",
          "Viewport locus space is absent from the view axis.",
          `${path}/initialViewport/locus/space`,
        );
    }
    view.sections.forEach((section, sectionIndex) => {
      const sectionPath = pp("views", viewIndex, "sections", sectionIndex);
      add(section.id, `${sectionPath}/id`);
      extensions(section.extensions, requires, sectionPath, errors);
      section.tracks.forEach((track, trackIndex) => {
        const trackPath = pp("views", viewIndex, "sections", sectionIndex, "tracks", trackIndex);
        add(track.id, `${trackPath}/id`);
        if (track.height !== undefined && track.height <= 0)
          error(
            errors,
            "seqviewspec.track.height.invalid",
            "Track height must be positive.",
            `${trackPath}/height`,
          );
        extensions(track.extensions, requires, trackPath, errors);
        track.layers.forEach((item, layerIndex) => {
          const layerPath = pp(
            "views",
            viewIndex,
            "sections",
            sectionIndex,
            "tracks",
            trackIndex,
            "layers",
            layerIndex,
          );
          add(item.id, `${layerPath}/id`);
          layer(item, layerPath, annotations, sequences, alignments, axis, requires, errors);
        });
      });
    });
  });
  return errors.length ? resultError(errors) : resultOk(deepFreeze(d));
};
export const createSeqViewSpec = (input: SeqViewSpecInput): Result<SeqViewSpec> =>
  validateSeqViewSpec(input);
export const validateSeqViewSpecShape = validateSeqViewSpec;
type SchemaValue = boolean | null | number | string | SchemaValue[] | SchemaRecord;
type SchemaRecord = { [key: string]: SchemaValue };
const schemaRecord = (value: SchemaValue): SchemaRecord | undefined =>
  value !== null && !Array.isArray(value) && typeof value === "object" ? value : undefined;
const rewriteJsonValueReferences = (value: SchemaValue): SchemaValue => {
  if (Array.isArray(value)) return value.map(rewriteJsonValueReferences);
  const record = schemaRecord(value);
  if (!record) return value;
  if (record.$id === "value") return { $ref: "#/$defs/JsonValue" };
  const result: SchemaRecord = {};
  for (const [key, child] of Object.entries(record))
    result[key] =
      key === "$ref" && child === "value" ? "#/$defs/JsonValue" : rewriteJsonValueReferences(child);
  return result;
};
const findJsonValueDefinition = (value: SchemaValue): SchemaRecord | undefined => {
  if (Array.isArray(value)) {
    for (const child of value) {
      const definition = findJsonValueDefinition(child);
      if (definition) return definition;
    }
    return undefined;
  }
  const record = schemaRecord(value);
  if (!record) return undefined;
  if (record.$id === "value") return record;
  for (const child of Object.values(record)) {
    const definition = findJsonValueDefinition(child);
    if (definition) return definition;
  }
  return undefined;
};
export const exportSeqViewSpecJsonSchema = (): object => {
  const raw = JSON.parse(
    JSON.stringify({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      ...SeqViewSpecSchema,
    }),
  ) as SchemaValue;
  const definition = findJsonValueDefinition(raw);
  const schema = schemaRecord(rewriteJsonValueReferences(raw));
  if (!definition || !schema) throw new Error("TypeBox JSON value definition was not emitted.");
  const jsonValue: SchemaRecord = { ...definition };
  delete jsonValue.$id;
  schema.$defs = { JsonValue: rewriteJsonValueReferences(jsonValue) };
  return schema;
};
const canonical = (value: unknown): string => {
  if (value === null) return "null";
  if (typeof value === "string") {
    if (loneSurrogate(value)) throw new TypeError("JCS strings cannot contain lone surrogates.");
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!num(value)) throw new TypeError("JCS only accepts finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype)
    throw new TypeError("JCS only accepts plain JSON objects.");
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${canonical(key)}:${canonical(object[key])}`)
    .join(",")}}`;
};
const deepFreeze = <T>(value: T): DeepReadonly<T> => {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
};
export const canonicalizeSeqViewSpecJson = (value: unknown): string => {
  const snapshot = snapshotJson(value);
  if (snapshot === undefined)
    throw new TypeError("JCS only accepts finite, acyclic I-JSON values.");
  return canonical(snapshot);
};
export const digestSeqViewSpec = async (document: SeqViewSpec): Promise<string> => {
  const bytes = new TextEncoder().encode(canonicalizeSeqViewSpecJson(document));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
};
export const evaluateColorEncoding = (
  color: ColorEncoding,
  value: ScalarValue,
  id?: string,
  properties?: Readonly<Record<string, ScalarValue>>,
): string => {
  if (color.kind === "fixed") return color.color;
  if (color.kind === "categorical") {
    const selected =
      color.field === "id"
        ? id
        : color.field === "value"
          ? value
          : properties?.[color.field.slice(11)];
    return selected === undefined || selected === null
      ? color.fallback
      : (color.colors[JSON.stringify(selected)] ?? color.fallback);
  }
  if (!num(value)) return color.missing;
  const [domainStart = Number.NaN, domainEnd = Number.NaN] = color.domain;
  const raw = (value - domainStart) / (domainEnd - domainStart);
  if ((raw < 0 || raw > 1) && color.clamp === false)
    throw new RangeError("Continuous color value is outside its unclamped domain.");
  const t = Math.max(0, Math.min(1, raw));
  const rgba = (hex: string): readonly [number, number, number, number] => [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
    hex.length === 9 ? Number.parseInt(hex.slice(7, 9), 16) : 255,
  ];
  const [rangeStart = "#000000", rangeEnd = "#000000"] = color.range;
  const first = rgba(rangeStart),
    second = rgba(rangeEnd),
    hasAlpha = rangeStart.length === 9 || rangeEnd.length === 9;
  const result = first
    .map((channel, index) =>
      Math.round(channel + ((second[index] ?? channel) - channel) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase();
  return `#${hasAlpha ? result : result.slice(0, 6)}`;
};
export const Sha256DigestPattern = "^sha256-[0-9a-f]{64}$";
export const SeqViewSpecDigestSchema = O({
  algorithm: Type.Literal("sha256"),
  value: Type.String({ pattern: Sha256DigestPattern }),
  canonicalization: Type.Literal("RFC8785"),
});
export type SeqViewSpecDigest = DeepReadonly<Static<typeof SeqViewSpecDigestSchema>>;
export type Sha256Digest = SeqViewSpecDigest["value"];
export const isSha256Digest = (value: unknown): value is Sha256Digest =>
  typeof value === "string" && new RegExp(Sha256DigestPattern).test(value);
export const isSeqViewSpecDigest = (value: unknown): value is SeqViewSpecDigest => {
  try {
    const snapshot = snapshotJson(value);
    return (
      snapshot !== undefined &&
      snapshot !== null &&
      !Array.isArray(snapshot) &&
      Value.Check(SeqViewSpecDigestSchema, snapshot)
    );
  } catch {
    return false;
  }
};
export interface ActiveSeqViewSpecProjection {
  readonly componentId: string;
  readonly requestId: string;
  readonly generation: number;
  readonly documentId: string;
  readonly viewId?: string;
  readonly digest?: Sha256Digest;
  readonly status: "accepted" | "rendered" | "degraded";
}
export interface SeqViewSpecPackageBoundary {
  readonly coordinates: SeqCoordsPackageBoundary;
  readonly model: SeqModelPackageBoundary;
  readonly packageName: "@seq-star/seq-view-spec";
}
