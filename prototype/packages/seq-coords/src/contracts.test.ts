import { describe, expect, it } from "vitest";
import {
  type CoordinateLocus,
  type CoordinateSpace,
  composeMappingResults,
  coordinateLocusKey,
  coordinateSpaceEquals,
  coordinateSpaceMatches,
  type MappingResult,
} from "./index.js";

const sequenceSpace: CoordinateSpace = {
  id: "P12345",
  kind: "sequence",
  authority: "uniprot",
  context: { accession: "P12345", chain: "A" },
  length: 10,
};
const point: CoordinateLocus = {
  kind: "point",
  space: sequenceSpace,
  position: { kind: "index", value: 4 },
};

describe("coordinate contract golden examples", () => {
  it("uses canonical identity but ignores length", () => {
    expect(
      coordinateSpaceEquals(sequenceSpace, {
        ...sequenceSpace,
        length: 999,
        context: { chain: "A", accession: "P12345" },
      }),
    ).toBe(true);
    expect(
      coordinateSpaceEquals(sequenceSpace, {
        ...sequenceSpace,
        context: { accession: "P12345", chain: "B" },
      }),
    ).toBe(false);
  });

  it("requires a present context key for wildcard matching", () => {
    expect(
      coordinateSpaceMatches(
        { kind: "sequence", authority: "uniprot", context: { accession: "*" } },
        sequenceSpace,
      ),
    ).toBe(true);
    expect(
      coordinateSpaceMatches({ kind: "sequence", context: { model: "*" } }, sequenceSpace),
    ).toBe(false);
    expect(
      coordinateSpaceMatches({ kind: "sequence", context: { chain: "B" } }, sequenceSpace),
    ).toBe(false);
  });

  it("supports an optional exact coordinate-space ID selector without changing equality", () => {
    expect(coordinateSpaceMatches({ id: "P12345", kind: "sequence" }, sequenceSpace)).toBe(true);
    expect(
      coordinateSpaceMatches({ id: "different-sequence", kind: "sequence" }, sequenceSpace),
    ).toBe(false);
    expect(
      coordinateSpaceEquals(sequenceSpace, { ...sequenceSpace, id: "different-sequence" }),
    ).toBe(false);
  });

  it("canonicalizes label-position fields independently of insertion order", () => {
    const label: CoordinateLocus = {
      kind: "point",
      space: sequenceSpace,
      position: { kind: "label", value: 42, insertionCode: "A" },
    };
    const reordered: CoordinateLocus = {
      kind: "point",
      space: sequenceSpace,
      position: { insertionCode: "A", value: 42, kind: "label" },
    };
    expect(coordinateLocusKey(label)).toBe(coordinateLocusKey(reordered));
    const result = composeMappingResults(
      {
        translatorIds: ["one"],
        diagnostics: [],
        associations: [{ source: point, targets: [label], status: "exact" }],
      },
      new Map([
        [
          coordinateLocusKey(reordered),
          {
            translatorIds: ["two"],
            diagnostics: [],
            associations: [{ source: reordered, targets: [point], status: "exact" }],
          },
        ],
      ]),
      { maxExpansion: 1 },
    );
    expect(result.associations[0]).toMatchObject({ status: "exact", targets: [point] });
  });

  it("retains source association and applies the explicit expansion cap", () => {
    const first: MappingResult = {
      translatorIds: ["source-to-mid"],
      diagnostics: [],
      associations: [{ source: point, targets: [point], status: "exact" }],
    };
    const continuation: ReadonlyMap<string, MappingResult> = new Map([
      [
        coordinateLocusKey(point),
        {
          translatorIds: ["mid-to-target"],
          diagnostics: [],
          associations: [{ source: point, targets: [point, point], status: "ambiguous" }],
        },
      ],
    ]);
    const result = composeMappingResults(first, continuation, { maxExpansion: 1 });
    expect(result.associations[0]).toMatchObject({ source: point, status: "partial" });
    expect(result.associations[0]?.targets).toHaveLength(1);
    expect(result.translatorIds).toEqual(["source-to-mid", "mid-to-target"]);
    expect(result.diagnostics[0]?.code).toBe("seq.coords.composition.expansion-capped");
  });

  it("continues only exact intermediate associations and never leaks a sibling target", () => {
    const intermediate = { ...point, position: { kind: "index" as const, value: 5 } };
    const sibling = { ...point, position: { kind: "index" as const, value: 6 } };
    const outputA = { ...point, position: { kind: "index" as const, value: 50 } };
    const outputB = { ...point, position: { kind: "index" as const, value: 51 } };
    const poison = { ...point, position: { kind: "index" as const, value: 999 } };
    const continuation: MappingResult = {
      translatorIds: ["mid-to-target"],
      diagnostics: [],
      associations: [
        { source: intermediate, targets: [outputA, outputB], status: "ambiguous" },
        { source: sibling, targets: [poison], status: "exact" },
      ],
    };
    const result = composeMappingResults(
      {
        translatorIds: ["source-to-mid"],
        diagnostics: [],
        associations: [{ source: point, targets: [intermediate], status: "exact" }],
      },
      new Map([[coordinateLocusKey(intermediate), continuation]]),
      { maxExpansion: 10 },
    );
    expect(result.associations[0]).toMatchObject({
      status: "ambiguous",
      targets: [outputA, outputB],
    });
    expect(result.associations[0]?.targets).not.toContainEqual(poison);
  });

  it("reports partial and unmapped continuations without inventing intermediate loci", () => {
    const mapped = { ...point, position: { kind: "index" as const, value: 7 } };
    const missing = { ...point, position: { kind: "index" as const, value: 8 } };
    const output = { ...point, position: { kind: "index" as const, value: 70 } };
    const first: MappingResult = {
      translatorIds: ["source-to-mid"],
      diagnostics: [],
      associations: [{ source: point, targets: [mapped, missing], status: "exact" }],
    };
    const result = composeMappingResults(
      first,
      new Map([
        [
          coordinateLocusKey(mapped),
          {
            translatorIds: ["mid-to-target"],
            diagnostics: [],
            associations: [{ source: mapped, targets: [output], status: "exact" }],
          },
        ],
      ]),
      { maxExpansion: 10 },
    );
    expect(result.associations[0]).toMatchObject({ status: "partial", targets: [output] });
    expect(
      composeMappingResults(
        {
          translatorIds: ["source-to-mid"],
          diagnostics: [],
          associations: [{ source: point, targets: [missing], status: "exact" }],
        },
        new Map(),
        { maxExpansion: 10 },
      ).associations[0],
    ).toMatchObject({ status: "unmapped", targets: [] });
  });
});
