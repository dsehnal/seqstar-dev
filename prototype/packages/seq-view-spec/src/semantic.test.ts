import { describe, expect, it } from "vitest";
import {
  canonicalizeSeqViewSpecJson,
  digestSeqViewSpec,
  evaluateColorEncoding,
  validateSeqViewSpec,
} from "./index.js";

type Json = boolean | null | number | string | Json[] | JsonRecord;
type JsonRecord = { [key: string]: Json };
type Mutation = {
  readonly name: string;
  readonly code: string;
  readonly path: string;
  readonly apply: (document: JsonRecord) => void;
};

const valid = (): JsonRecord => ({
  kind: "seq-view-spec",
  version: "0.1.0",
  id: "document",
  metadata: { links: [{ label: "document", href: "https://example.test/document" }] },
  requires: ["org.example.feature", "seqviewspec:representation/links"],
  extensions: { "org.example.feature": { enabled: true } },
  sequences: [
    {
      id: "protein",
      coordinateSpace: "protein-space",
      alphabet: "protein",
      residues: "ACDE",
      metadata: { links: [{ label: "sequence", href: "https://example.test/sequence" }] },
    },
  ],
  assemblies: [
    {
      id: "assembly",
      metadata: { links: [{ label: "assembly", href: "https://example.test/assembly" }] },
      members: [
        {
          id: "assembly-member",
          sequence: "protein",
        },
      ],
    },
  ],
  alignments: [
    {
      id: "alignment",
      coordinateSpace: "alignment-space",
      length: 4,
      metadata: { links: [{ label: "alignment", href: "https://example.test/alignment" }] },
      members: [
        {
          id: "alignment-member",
          sequence: "protein",
          positions: [0, 1, 2, 3],
          metadata: {
            links: [{ label: "alignment member", href: "https://example.test/alignment-member" }],
          },
        },
      ],
    },
  ],
  annotations: [
    {
      id: "loci",
      kind: "loci",
      semanticType: "example:locus",
      metadata: { links: [{ label: "annotation", href: "https://example.test/annotation" }] },
      items: [
        {
          id: "locus-item",
          loci: [{ kind: "interval", space: "protein-space", start: 0, end: 2 }],
          links: [{ label: "item", href: "https://example.test/item" }],
          value: "domain",
        },
      ],
    },
    {
      id: "numeric",
      kind: "values",
      semanticType: "example:score",
      space: "protein-space",
      valueType: "number",
      values: { encoding: "dense", data: [0, 0.5, null, 1] },
    },
    {
      id: "category",
      kind: "values",
      semanticType: "example:category",
      space: "protein-space",
      valueType: "category",
      values: { encoding: "sparse", data: [{ position: 0, value: "helix" }] },
    },
    {
      id: "flag",
      kind: "values",
      semanticType: "example:flag",
      space: "protein-space",
      valueType: "boolean",
      values: { encoding: "sparse", data: [{ position: 1, value: true }] },
    },
    {
      id: "relationships",
      kind: "relationships",
      semanticType: "example:relationship",
      items: [
        {
          id: "relationship-item",
          endpoints: [
            { role: "left", loci: [{ kind: "point", space: "protein-space", position: 0 }] },
            { role: "right", loci: [{ kind: "point", space: "protein-space", position: 2 }] },
          ],
        },
      ],
    },
    {
      id: "markers",
      kind: "loci",
      semanticType: "example:marker",
      items: [
        {
          id: "point-item",
          loci: [{ kind: "point", space: "protein-space", position: 3 }],
        },
        {
          id: "boundary-item",
          loci: [{ kind: "boundary", space: "protein-space", position: 4 }],
        },
      ],
    },
  ],
  views: [
    {
      id: "view",
      context: { assembly: "assembly", alignment: "alignment" },
      metadata: { links: [{ label: "view", href: "https://example.test/view" }] },
      axis: {
        segments: [
          { id: "protein-axis", space: "protein-space", start: 0, end: 4 },
          { id: "alignment-axis", space: "alignment-space", start: 0, end: 4 },
        ],
      },
      initialViewport: {
        kind: "locus",
        locus: { kind: "point", space: "protein-space", position: 0 },
      },
      sections: [
        {
          id: "section",
          tracks: [
            {
              id: "track",
              layers: [
                {
                  id: "sequence-layer",
                  representation: "sequence",
                  sequence: "protein",
                  color: { kind: "fixed", color: "#12345678" },
                },
                {
                  id: "alignment-layer",
                  representation: "alignment",
                  alignment: "alignment",
                  members: ["alignment-member"],
                },
                {
                  id: "blocks-layer",
                  representation: "blocks",
                  annotation: "loci",
                  color: {
                    kind: "categorical",
                    field: "value",
                    colors: { '"domain"': "#123456" },
                    fallback: "#654321",
                  },
                },
                { id: "markers-layer", representation: "markers", annotation: "markers" },
                {
                  id: "bars-layer",
                  representation: "bars",
                  annotation: "numeric",
                  scale: { domain: [0, 1] },
                },
                {
                  id: "heatmap-layer",
                  representation: "heatmap",
                  annotation: "numeric",
                  color: {
                    kind: "continuous",
                    field: "value",
                    domain: [0, 1],
                    range: ["#000000", "#FFFFFF"],
                    missing: "#101010",
                  },
                },
                {
                  id: "swatch-layer",
                  representation: "swatch",
                  annotation: "category",
                  color: {
                    kind: "categorical",
                    field: "value",
                    colors: { '"helix"': "#111111" },
                    fallback: "#222222",
                  },
                },
                {
                  id: "links-layer",
                  representation: "links",
                  annotation: "relationships",
                  fallback: { representation: "markers" },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});

const record = (value: Json): JsonRecord => {
  if (!value || Array.isArray(value) || typeof value !== "object")
    throw new Error("Expected object.");
  return value;
};
const array = (value: Json): Json[] => {
  if (!Array.isArray(value)) throw new Error("Expected array.");
  return value;
};
const at = (document: JsonRecord, path: readonly (string | number)[]): Json =>
  path.reduce<Json>((value, key) => {
    const child = typeof key === "number" ? array(value)[key] : record(value)[key];
    if (child === undefined) throw new Error("Expected path value.");
    return child;
  }, document);
const set = (document: JsonRecord, path: readonly (string | number)[], value: Json) => {
  const key = path[path.length - 1];
  if (key === undefined) throw new Error("Expected a path key.");
  const parent = at(document, path.slice(0, -1));
  if (typeof key === "number") array(parent)[key] = value;
  else record(parent)[key] = value;
};
const clone = (): JsonRecord => structuredClone(valid());
const layer = (index: number, tail: readonly (string | number)[] = []) => [
  "views",
  0,
  "sections",
  0,
  "tracks",
  0,
  "layers",
  index,
  ...tail,
];

const mutations: readonly Mutation[] = [
  {
    name: "duplicate ID",
    code: "seqviewspec.id.duplicate",
    path: "/sequences/0/id",
    apply: (d) => set(d, ["sequences", 0, "id"], "document"),
  },
  {
    name: "duplicate coordinate space",
    code: "seqviewspec.coordinate-space.duplicate",
    path: "/alignments/0/coordinateSpace",
    apply: (d) => set(d, ["alignments", 0, "coordinateSpace"], "protein-space"),
  },
  {
    name: "gapped residues",
    code: "seqviewspec.sequence.residues.invalid",
    path: "/sequences/0/residues",
    apply: (d) => set(d, ["sequences", 0, "residues"], "AC-D"),
  },
  {
    name: "alphabet mismatch",
    code: "seqviewspec.sequence.alphabet.invalid",
    path: "/sequences/0/residues",
    apply: (d) => set(d, ["sequences", 0, "residues"], "AC*T"),
  },
  {
    name: "undeclared extension",
    code: "seqviewspec.extension.requires",
    path: "/sequences/0/extensions/org.example.extra",
    apply: (d) => set(d, ["sequences", 0, "extensions"], { "org.example.extra": true }),
  },
  {
    name: "duplicate requirement",
    code: "seqviewspec.requires.duplicate",
    path: "/requires/2",
    apply: (d) => array(at(d, ["requires"])).push("org.example.feature"),
  },
  {
    name: "unknown requirement",
    code: "seqviewspec.requires.unknown",
    path: "/requires/0",
    apply: (d) => set(d, ["requires", 0], "org.example.unknown"),
  },
  {
    name: "missing assembly sequence",
    code: "seqviewspec.assembly.sequence.missing",
    path: "/assemblies/0/members/0/sequence",
    apply: (d) => set(d, ["assemblies", 0, "members", 0, "sequence"], "missing"),
  },
  {
    name: "duplicate assembly member",
    code: "seqviewspec.assembly.member.duplicate",
    path: "/assemblies/0/members/1/id",
    apply: (d) =>
      array(at(d, ["assemblies", 0, "members"])).push(
        structuredClone(at(d, ["assemblies", 0, "members", 0])),
      ),
  },
  {
    name: "missing alignment sequence",
    code: "seqviewspec.alignment.sequence.missing",
    path: "/alignments/0/members/0/sequence",
    apply: (d) => set(d, ["alignments", 0, "members", 0, "sequence"], "missing"),
  },
  {
    name: "duplicate alignment member",
    code: "seqviewspec.alignment.member.duplicate",
    path: "/alignments/0/members/1/id",
    apply: (d) =>
      array(at(d, ["alignments", 0, "members"])).push(
        structuredClone(at(d, ["alignments", 0, "members", 0])),
      ),
  },
  {
    name: "alignment mapping length",
    code: "seqviewspec.alignment.positions.length",
    path: "/alignments/0/members/0/positions",
    apply: (d) => set(d, ["alignments", 0, "members", 0, "positions"], [0]),
  },
  {
    name: "alignment mapping bounds",
    code: "seqviewspec.alignment.position.bounds",
    path: "/alignments/0/members/0/positions/3",
    apply: (d) => set(d, ["alignments", 0, "members", 0, "positions", 3], 4),
  },
  {
    name: "alignment mapping duplicate",
    code: "seqviewspec.alignment.position.duplicate",
    path: "/alignments/0/members/0/positions/1",
    apply: (d) => set(d, ["alignments", 0, "members", 0, "positions", 1], 0),
  },
  {
    name: "alignment mapping order",
    code: "seqviewspec.alignment.position.order",
    path: "/alignments/0/members/0/positions/2",
    apply: (d) => set(d, ["alignments", 0, "members", 0, "positions", 2], 0),
  },
  {
    name: "missing locus space",
    code: "seqviewspec.reference.space.missing",
    path: "/annotations/0/items/0/loci/0/space",
    apply: (d) => set(d, ["annotations", 0, "items", 0, "loci", 0, "space"], "missing"),
  },
  {
    name: "locus bounds",
    code: "seqviewspec.locus.bounds",
    path: "/annotations/0/items/0/loci/0",
    apply: (d) => set(d, ["annotations", 0, "items", 0, "loci", 0, "end"], 5),
  },
  {
    name: "dense value length",
    code: "seqviewspec.values.dense.length",
    path: "/annotations/1/values/data",
    apply: (d) => set(d, ["annotations", 1, "values", "data"], [1]),
  },
  {
    name: "sparse value bounds",
    code: "seqviewspec.values.sparse.bounds",
    path: "/annotations/2/values/data/0/position",
    apply: (d) => set(d, ["annotations", 2, "values", "data", 0, "position"], 4),
  },
  {
    name: "sparse value duplicate",
    code: "seqviewspec.values.sparse.duplicate",
    path: "/annotations/2/values/data/1/position",
    apply: (d) =>
      array(at(d, ["annotations", 2, "values", "data"])).push({ position: 0, value: "strand" }),
  },
  {
    name: "value type",
    code: "seqviewspec.values.type",
    path: "/annotations/1/values/data/0",
    apply: (d) => set(d, ["annotations", 1, "values", "data", 0], "wrong"),
  },
  {
    name: "duplicate relationship role",
    code: "seqviewspec.relationship.endpoint-role.duplicate",
    path: "/annotations/4/items/0/endpoints/1/role",
    apply: (d) => set(d, ["annotations", 4, "items", 0, "endpoints", 1, "role"], "left"),
  },
  {
    name: "missing assembly context",
    code: "seqviewspec.view.context.assembly.missing",
    path: "/views/0/context/assembly",
    apply: (d) => set(d, ["views", 0, "context", "assembly"], "missing"),
  },
  {
    name: "missing alignment context",
    code: "seqviewspec.view.context.alignment.missing",
    path: "/views/0/context/alignment",
    apply: (d) => set(d, ["views", 0, "context", "alignment"], "missing"),
  },
  {
    name: "missing axis space",
    code: "seqviewspec.axis.space.missing",
    path: "/views/0/axis/segments/0/space",
    apply: (d) => set(d, ["views", 0, "axis", "segments", 0, "space"], "missing"),
  },
  {
    name: "axis bounds",
    code: "seqviewspec.axis.bounds",
    path: "/views/0/axis/segments/0",
    apply: (d) => set(d, ["views", 0, "axis", "segments", 0, "end"], 5),
  },
  {
    name: "axis gap",
    code: "seqviewspec.axis.gap.invalid",
    path: "/views/0/axis/gap",
    apply: (d) => set(d, ["views", 0, "axis", "gap"], -1),
  },
  {
    name: "viewport coverage",
    code: "seqviewspec.viewport.axis.coverage",
    path: "/views/0/initialViewport/locus/space",
    apply: (d) => {
      array(at(d, ["views", 0, "axis", "segments"])).splice(1, 1);
      set(d, ["views", 0, "initialViewport", "locus", "space"], "alignment-space");
    },
  },
  {
    name: "viewport bounds",
    code: "seqviewspec.locus.bounds",
    path: "/views/0/initialViewport/locus",
    apply: (d) => set(d, ["views", 0, "initialViewport", "locus", "position"], 4),
  },
  {
    name: "track height",
    code: "seqviewspec.track.height.invalid",
    path: "/views/0/sections/0/tracks/0/height",
    apply: (d) => set(d, ["views", 0, "sections", 0, "tracks", 0, "height"], 0),
  },
  {
    name: "layer opacity",
    code: "seqviewspec.layer.opacity.invalid",
    path: "/views/0/sections/0/tracks/0/layers/0/opacity",
    apply: (d) => set(d, layer(0, ["opacity"]), 2),
  },
  {
    name: "tooltip expression",
    code: "seqviewspec.tooltip.field.invalid",
    path: "/views/0/sections/0/tracks/0/layers/0/tooltip/fields/0",
    apply: (d) => set(d, layer(0, ["tooltip"]), { fields: ["constructor"] }),
  },
  {
    name: "missing sequence layer target",
    code: "seqviewspec.layer.sequence.missing",
    path: "/views/0/sections/0/tracks/0/layers/0/sequence",
    apply: (d) => set(d, layer(0, ["sequence"]), "missing"),
  },
  {
    name: "missing alignment layer target",
    code: "seqviewspec.layer.alignment.missing",
    path: "/views/0/sections/0/tracks/0/layers/1/alignment",
    apply: (d) => set(d, layer(1, ["alignment"]), "missing"),
  },
  {
    name: "duplicate layer member",
    code: "seqviewspec.alignment.layer-members.duplicate",
    path: "/views/0/sections/0/tracks/0/layers/1/members/1",
    apply: (d) => array(at(d, layer(1, ["members"]))).push("alignment-member"),
  },
  {
    name: "missing layer member",
    code: "seqviewspec.alignment.layer-member.missing",
    path: "/views/0/sections/0/tracks/0/layers/1/members/0",
    apply: (d) => set(d, layer(1, ["members", 0]), "missing"),
  },
  {
    name: "missing annotation",
    code: "seqviewspec.layer.annotation.missing",
    path: "/views/0/sections/0/tracks/0/layers/2/annotation",
    apply: (d) => set(d, layer(2, ["annotation"]), "missing"),
  },
  {
    name: "incompatible annotation",
    code: "seqviewspec.layer.annotation.incompatible",
    path: "/views/0/sections/0/tracks/0/layers/4/annotation",
    apply: (d) => set(d, layer(4, ["annotation"]), "loci"),
  },
  {
    name: "incompatible locus representation",
    code: "seqviewspec.layer.locus.incompatible",
    path: "/views/0/sections/0/tracks/0/layers/3/annotation",
    apply: (d) => set(d, layer(3, ["annotation"]), "loci"),
  },
  {
    name: "annotation layer axis coverage",
    code: "seqviewspec.layer.axis.coverage",
    path: "/views/0/sections/0/tracks/0/layers/3/annotation",
    apply: (d) => {
      array(at(d, ["sequences"])).push({
        id: "other",
        coordinateSpace: "other-space",
        alphabet: "protein",
        residues: "A",
      });
      set(d, ["annotations", 5, "items", 0, "loci", 0, "space"], "other-space");
      set(d, ["annotations", 5, "items", 1, "loci", 0, "space"], "other-space");
    },
  },
  {
    name: "incompatible fallback",
    code: "seqviewspec.layer.fallback.incompatible",
    path: "/views/0/sections/0/tracks/0/layers/7/fallback/representation",
    apply: (d) => set(d, layer(7, ["fallback", "representation"]), "bars"),
  },
  {
    name: "bar scale domain",
    code: "seqviewspec.scale.domain.invalid",
    path: "/views/0/sections/0/tracks/0/layers/4/scale/domain",
    apply: (d) => set(d, layer(4, ["scale", "domain"]), [1, 0]),
  },
  {
    name: "continuous color domain",
    code: "seqviewspec.color.domain.invalid",
    path: "/views/0/sections/0/tracks/0/layers/5/color/domain",
    apply: (d) => set(d, layer(5, ["color", "domain"]), [1, 0]),
  },
  {
    name: "categorical key",
    code: "seqviewspec.color.categorical-key.invalid",
    path: "/views/0/sections/0/tracks/0/layers/2/color/colors/not-json",
    apply: (d) => set(d, layer(2, ["color", "colors"]), { "not-json": "#123456" }),
  },
  {
    name: "unsupported major",
    code: "seqviewspec.version.unsupported",
    path: "/version",
    apply: (d) => set(d, ["version"], "1.0.0"),
  },
];

const urlTargets: readonly (readonly [string, readonly (string | number)[]])[] = [
  ["document metadata", ["metadata", "links", 0, "href"]],
  ["sequence metadata", ["sequences", 0, "metadata", "links", 0, "href"]],
  ["assembly metadata", ["assemblies", 0, "metadata", "links", 0, "href"]],
  ["alignment metadata", ["alignments", 0, "metadata", "links", 0, "href"]],
  ["alignment member metadata", ["alignments", 0, "members", 0, "metadata", "links", 0, "href"]],
  ["annotation metadata", ["annotations", 0, "metadata", "links", 0, "href"]],
  ["view metadata", ["views", 0, "metadata", "links", 0, "href"]],
  ["item link", ["annotations", 0, "items", 0, "links", 0, "href"]],
];
const urlMutations: readonly Mutation[] = urlTargets.map(
  ([name, path]): Mutation => ({
    name: `rejects non-HTTP ${name}`,
    code: "seqviewspec.url.scheme",
    path: `/${path.join("/")}`,
    apply: (document) => set(document, path, "javascript:alert(1)"),
  }),
);
const allMutations: readonly Mutation[] = [...mutations, ...urlMutations];

describe("SeqViewSpec semantic rules", () => {
  it("accepts every union, representation, fallback, color, extension, and compatible 0.x version path", () => {
    for (const version of ["0.1.0", "0.1.9", "0.2.0"]) {
      const document = clone();
      set(document, ["version"], version);
      expect(validateSeqViewSpec(document).ok, version).toBe(true);
    }
  });
  it(`reports ${allMutations.length} independently targeted negative mutations with stable pointers`, () => {
    expect(allMutations.length).toBeGreaterThanOrEqual(53);
    for (const mutation of allMutations) {
      const document = clone();
      mutation.apply(document);
      const result = validateSeqViewSpec(document);
      expect(result.ok, mutation.name).toBe(false);
      if (!result.ok)
        expect(
          result.diagnostics.some(
            (diagnostic) => diagnostic.code === mutation.code && diagnostic.path === mutation.path,
          ),
          mutation.name,
        ).toBe(true);
    }
  });
  it("deep-clones and freezes validated documents", () => {
    const document = clone();
    const result = validateSeqViewSpec(document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    set(document, ["id"], "changed");
    expect(result.value.id).toBe("document");
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.views)).toBe(true);
  });
  it("matches RFC 8785 hostile and official-style number vectors", async () => {
    expect(canonicalizeSeqViewSpecJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalizeSeqViewSpecJson({ "\u{1f600}": 1, "\ufffd": 2 })).toBe('{"😀":1,"�":2}');
    const validPair = "\ud83d\ude00";
    expect(canonicalizeSeqViewSpecJson({ validPair })).toBe('{"validPair":"😀"}');
    for (const invalid of ["\ud800", "\udc00"]) {
      expect(() => canonicalizeSeqViewSpecJson({ invalid })).toThrow(TypeError);
      const document = clone();
      set(document, ["id"], invalid);
      expect(validateSeqViewSpec(document).ok).toBe(false);
    }
    expect(canonicalizeSeqViewSpecJson({ n: -0, large: 1e30, small: 1e-7 })).toBe(
      '{"large":1e+30,"n":0,"small":1e-7}',
    );
    expect(
      canonicalizeSeqViewSpecJson({
        n: 0.000001,
        integer: Number.parseFloat("333333333.33333329"),
      }),
    ).toBe('{"integer":333333333.3333333,"n":0.000001}');
    const cycle: JsonRecord = {};
    cycle.self = cycle;
    expect(() => canonicalizeSeqViewSpecJson(cycle)).toThrow(TypeError);
    const sparse = Array<Json>(2);
    sparse[1] = 1;
    expect(() => canonicalizeSeqViewSpecJson(sparse)).toThrow(TypeError);
    const first = validateSeqViewSpec(clone());
    const second = validateSeqViewSpec(JSON.parse(canonicalizeSeqViewSpecJson(clone())));
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok)
      expect(await digestSeqViewSpec(first.value)).toBe(await digestSeqViewSpec(second.value));
  });
  it("evaluates categorical, sRGB continuous, and RGBA colors deterministically", () => {
    expect(
      evaluateColorEncoding(
        { kind: "categorical", field: "value", colors: { '"a"': "#123456" }, fallback: "#000000" },
        "a",
      ),
    ).toBe("#123456");
    expect(
      evaluateColorEncoding(
        {
          kind: "continuous",
          field: "value",
          domain: [0, 1],
          range: ["#000000", "#FFFFFF"],
          missing: "#112233",
        },
        0.5,
      ),
    ).toBe("#808080");
    expect(
      evaluateColorEncoding(
        {
          kind: "continuous",
          field: "value",
          domain: [0, 1],
          range: ["#00000000", "#FFFFFF"],
          missing: "#112233",
        },
        0.5,
      ),
    ).toBe("#80808080");
    expect(() =>
      evaluateColorEncoding(
        {
          kind: "continuous",
          field: "value",
          domain: [0, 1],
          range: ["#000000", "#FFFFFF"],
          missing: "#112233",
          clamp: false,
        },
        9,
      ),
    ).toThrow(RangeError);
  });
});
