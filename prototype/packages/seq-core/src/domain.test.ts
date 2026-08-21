// @ts-expect-error The workspace deliberately does not include Node typings; Vitest runs this fixture probe in Node.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  consensus,
  conservation,
  createAlignment,
  createAssembly,
  createLociAnnotation,
  createSequence,
  createSparseValuesAnnotation,
  findLocusOverlaps,
  findOverlaps,
  normalizeAlignment,
  parseA3m,
  parseAlignedFasta,
  parseFasta,
} from "./index.js";

describe("Seq* domain normalization", () => {
  it("validates biological syntax, references, alignment order, and freezes returned models", () => {
    const sequence = createSequence({
      id: "a",
      coordinateSpace: "a:sequence",
      alphabet: "protein",
      residues: "ACD",
    });
    expect(sequence.ok).toBe(true);
    expect(
      createSequence({
        id: "bad id",
        coordinateSpace: "space",
        alphabet: "protein",
        residues: "A-C",
      }).ok,
    ).toBe(false);
    expect(createAssembly({ id: "asm", members: [{ id: "m", sequence: "none" }] }, ["a"]).ok).toBe(
      false,
    );
    if (!sequence.ok) return;
    const alignment = createAlignment(
      {
        id: "aln",
        coordinateSpace: "aln:columns",
        length: 3,
        members: [{ id: "member", sequence: "a", positions: [0, 2, 1] }],
      },
      [sequence.value],
    );
    expect(alignment.ok).toBe(false);
    expect(Object.isFrozen(sequence.value)).toBe(true);
  });

  it("uses Unicode code points for custom sequence and alignment bounds", () => {
    const sequence = createSequence({
      id: "unicode",
      coordinateSpace: "unicode:sequence",
      alphabet: "custom",
      residues: "😀A",
    });
    expect(sequence.ok).toBe(true);
    if (!sequence.ok) return;
    const alignment = createAlignment(
      {
        id: "unicode-alignment",
        coordinateSpace: "unicode:alignment",
        length: 2,
        members: [{ id: "unicode-member", sequence: "unicode", positions: [0, 1] }],
      },
      [sequence.value],
    );
    expect(alignment.ok).toBe(true);
    if (alignment.ok) expect(consensus(alignment.value).values).toEqual(["😀", "A"]);
  });

  it("parses FASTA/aligned FASTA/A3M only under explicit normalization policies", () => {
    expect(parseFasta(">a\nACD\n>b\nEFG\n").ok).toBe(true);
    expect(parseFasta("ACD").ok).toBe(false);
    expect(parseAlignedFasta(">a\nA-C\n>b\nATC\n").ok).toBe(true);
    expect(parseAlignedFasta(">a\nAC\n>b\nA-C\n").ok).toBe(false);
    expect(parseA3m(">q\nACD\n>x\nAcCD\n").ok).toBe(false);
    const parsed = parseA3m(">q\nACD\n>x\nAcCD\n", { a3mInsertions: "drop" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const normalized = normalizeAlignment(parsed.value);
    expect(normalized.ok).toBe(true);
    if (normalized.ok) expect(normalized.value.alignment.members[1]?.positions).toEqual([0, 1, 2]);
  });

  it("normalizes custom astral residues by code-point alignment columns", () => {
    const input = {
      format: "aligned-fasta" as const,
      records: [{ id: "unicode", rawHeader: "unicode", residues: "😀A" }],
    };
    const normalized = normalizeAlignment(input, { alphabet: "custom" });
    expect(normalized.ok).toBe(true);
    if (normalized.ok) {
      expect(normalized.value.alignment.length).toBe(2);
      expect(normalized.value.alignment.members[0]?.positions).toEqual([0, 1]);
    }
  });

  it("canonicalizes approved fixture headers before construction and retains their source identity", () => {
    const fixture = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");
    const p53 = parseFasta(fixture("../../../fixtures/uniprot-structure/input/P04637.fasta"));
    expect(p53.ok).toBe(true);
    if (p53.ok) {
      expect(p53.value[0]).toMatchObject({
        id: "P04637",
        identifiers: [{ namespace: "uniprot", value: "P04637" }],
      });
      expect(p53.value[0]?.extensions).toMatchObject({
        "seq:rawHeader": expect.stringContaining("sp|P04637|"),
      });
    }
    const hba = parseFasta(fixture("../../../fixtures/alignment-structure/input/P69905.fasta"));
    expect(hba.ok).toBe(true);
    if (hba.ok) expect(hba.value[0]?.id).toBe("P69905");
    const aligned = parseAlignedFasta(
      fixture("../../../fixtures/alignment-structure/expected/PF00042.29-32rows.query-centric.afa"),
    );
    expect(aligned.ok).toBe(true);
    if (!aligned.ok) return;
    expect(aligned.value.records[0]).toMatchObject({
      id: "HBA_HUMAN-27-137",
      rawHeader: expect.stringContaining("HBA_HUMAN/27-137"),
    });
    const normalized = normalizeAlignment(aligned.value, { alignmentId: "pf00042" });
    expect(normalized.ok).toBe(true);
    if (normalized.ok)
      expect(normalized.value.alignment.members[0]?.sequence).toBe("HBA_HUMAN-27-137");
  });

  it("rejects duplicate canonical alignment IDs immediately", () => {
    expect(parseAlignedFasta(">sp|P69905|HBA\nAC\n>tr|P69905|OTHER\nAC\n").ok).toBe(false);
    expect(parseA3m(">sp|P69905|HBA\nAC\n>tr|P69905|OTHER\nAC\n").ok).toBe(false);
  });

  it("computes deterministic consensus, conservation, and half-open overlaps with policy provenance", () => {
    const parsed = parseAlignedFasta(">a\nA-C\n>b\nATC\n");
    if (!parsed.ok) throw new Error("fixture parse");
    const normalized = normalizeAlignment(parsed.value);
    if (!normalized.ok) throw new Error("fixture normalize");
    const result = consensus(normalized.value.alignment);
    expect(result.values).toEqual(["A", "T", "C"]);
    expect(conservation(normalized.value.alignment).values).toEqual([1, 1, 1]);
    expect(result.provenance.options).toMatchObject({ gapPolicy: "ignore" });
    expect(
      findOverlaps([
        { start: 0, end: 2 },
        { start: 2, end: 4 },
        { start: 1, end: 3 },
      ]),
    ).toEqual([
      { left: 0, right: 2, start: 1, end: 2 },
      { left: 1, right: 2, start: 2, end: 3 },
    ]);
    expect(
      findLocusOverlaps([
        { kind: "interval", space: "a", start: 0, end: 2 },
        { kind: "boundary", space: "a", position: 2 },
        { kind: "point", space: "b", position: 1 },
      ]),
    ).toEqual([{ left: 0, right: 1, space: "a" }]);
  });

  it("validates discontinuous loci and dense/sparse annotation values", () => {
    const lengths = new Map([["s", 3]]);
    expect(
      createLociAnnotation(
        {
          id: "ann",
          kind: "loci",
          semanticType: "x",
          items: [
            {
              id: "item",
              loci: [
                { kind: "interval", space: "s", start: 0, end: 1 },
                { kind: "point", space: "s", position: 2 },
              ],
            },
          ],
        },
        lengths,
      ).ok,
    ).toBe(true);
    expect(
      createLociAnnotation(
        { id: "ann", kind: "loci", semanticType: "x", items: [{ id: "item", loci: [] }] },
        lengths,
      ).ok,
    ).toBe(false);
    expect(
      createSparseValuesAnnotation(
        {
          id: "sparse",
          kind: "values",
          semanticType: "x",
          space: "s",
          valueType: "number",
          values: [
            { position: 0, value: 1 },
            { position: 0, value: Number.NaN },
          ],
        },
        lengths,
      ).ok,
    ).toBe(false);
    expect(
      createLociAnnotation(
        {
          id: "ann",
          kind: "loci",
          semanticType: "x",
          items: [
            { id: "item", loci: [{ kind: "point", space: "s", position: 0 }], value: {} as never },
          ],
        },
        lengths,
      ).ok,
    ).toBe(false);
    expect(
      createSparseValuesAnnotation(
        {
          id: "bad id",
          kind: "values",
          semanticType: "",
          space: "missing",
          valueType: "number",
          values: [],
        },
        lengths,
      ).ok,
    ).toBe(false);
  });
});
