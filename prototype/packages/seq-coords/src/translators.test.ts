import { describe, expect, it } from "vitest";
import {
  type CoordinateSpace,
  createAlignmentColumnToMemberTranslator,
  createIdentityTranslator,
  createMemberToAlignmentColumnTranslator,
  createReverseTableTranslator,
  createTableTranslator,
  pointLocus,
  validateCoordinateLocus,
  validateCoordinateSpace,
} from "./index.js";

const alignment: CoordinateSpace = {
  id: "aln",
  kind: "alignment",
  length: 4,
  context: { alignment: "x" },
};
const sequence: CoordinateSpace = {
  id: "seq",
  kind: "sequence",
  length: 3,
  context: { accession: "p" },
};
const structure: CoordinateSpace = { id: "str", kind: "structure", context: { chain: "A" } };
const locus = (space: CoordinateSpace, position: number) =>
  pointLocus(space, position) ??
  (() => {
    throw new Error("bad test locus");
  })();
describe("pure translators", () => {
  it("maps explicit alignment gaps in both directions without equal-length guessing", async () => {
    const mapping = {
      alignmentSpace: alignment,
      memberSpace: sequence,
      positions: [0, null, 1, 2],
    };
    const forward = await createAlignmentColumnToMemberTranslator("forward", mapping).map(
      { loci: [locus(alignment, 0), locus(alignment, 1)] },
      new AbortController().signal,
    );
    expect(forward.associations.map((item) => item.status)).toEqual(["exact", "unmapped"]);
    const reverse = await createMemberToAlignmentColumnTranslator("reverse", mapping).map(
      { loci: [locus(sequence, 2)] },
      new AbortController().signal,
    );
    expect(reverse.associations[0]?.targets).toEqual([locus(alignment, 3)]);
  });
  it("supports named identity, table ambiguity/reverse rows, and abort", async () => {
    expect(
      (
        await createIdentityTranslator("same", sequence).map(
          { loci: [locus(alignment, 0)] },
          new AbortController().signal,
        )
      ).associations[0]?.status,
    ).toBe("unmapped");
    const rows = [
      { source: locus(sequence, 0), target: locus(structure, 10) },
      { source: locus(sequence, 0), target: locus(structure, 11) },
    ];
    const table = createTableTranslator("table", { kind: "sequence" }, { kind: "structure" }, rows);
    expect(
      (await table.map({ loci: [locus(sequence, 0)] }, new AbortController().signal))
        .associations[0]?.status,
    ).toBe("ambiguous");
    const reverse = createReverseTableTranslator(
      "reverse-table",
      { kind: "structure" },
      { kind: "sequence" },
      rows,
    );
    expect(
      (await reverse.map({ loci: [locus(structure, 10)] }, new AbortController().signal))
        .associations[0]?.status,
    ).toBe("exact");
    const controller = new AbortController();
    controller.abort();
    expect(
      (await table.map({ loci: [locus(sequence, 0)] }, controller.signal)).diagnostics[0]?.code,
    ).toBe("seq.coords.aborted");
  });
  it("rejects malformed spaces/loci and preserves deterministic branch evidence", async () => {
    expect(validateCoordinateSpace({ id: "bad id", kind: "sequence", length: Number.NaN }).ok).toBe(
      false,
    );
    expect(
      validateCoordinateLocus({
        kind: "interval",
        space: { id: "s", kind: "sequence" },
        start: 4,
        end: 2,
      }).ok,
    ).toBe(false);
    expect(pointLocus({ id: "s", kind: "sequence" }, Number.NaN)).toBeUndefined();
    const table = createTableTranslator("evidence", { kind: "sequence" }, { kind: "structure" }, [
      { source: locus(sequence, 0), target: locus(structure, 1), confidence: 0.2 },
      { source: locus(sequence, 0), target: locus(structure, 2), confidence: 0.9 },
    ]);
    const result = await table.map({ loci: [locus(sequence, 0)] }, new AbortController().signal);
    expect(result.associations[0]).not.toHaveProperty("confidence");
    expect(result.associations[0]?.details).toMatchObject({
      branches: [
        { target: locus(structure, 1), confidence: 0.2 },
        { target: locus(structure, 2), confidence: 0.9 },
      ],
    });
  });
  it("excludes unsafe and wrong-space table rows with stable diagnostics", async () => {
    class Detail {}
    const unsafe = [
      { source: locus(sequence, 0), target: locus(structure, 1), confidence: Number.NaN },
      { source: locus(sequence, 0), target: locus(structure, 2), details: { fn: () => undefined } },
      {
        source: locus(structure, 1),
        target: locus(structure, 3),
        details: { instance: new Detail() },
      },
    ];
    const table = createTableTranslator(
      "invalid-rows",
      { kind: "sequence" },
      { kind: "structure" },
      unsafe as never,
    );
    const result = await table.map({ loci: [locus(sequence, 0)] }, new AbortController().signal);
    expect(result.associations[0]).toMatchObject({ status: "unmapped", targets: [] });
    expect(result.diagnostics).toHaveLength(3);
    expect(result.diagnostics.every((entry) => entry.code === "seq.coords.table.row.invalid")).toBe(
      true,
    );
  });
});
