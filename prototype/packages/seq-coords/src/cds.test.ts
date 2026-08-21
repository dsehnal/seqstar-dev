import { describe, expect, it } from "vitest";
import {
  type CdsTranslatorConfig,
  createCdsTranslators,
  validateCdsTranslatorConfig,
} from "./index.js";

const plus: CdsTranslatorConfig = {
  id: "synthetic-plus",
  nucleotideSpace: {
    id: "synthetic-nucleotide",
    kind: "sequence",
    length: 20,
    context: { molecule: "dna" },
  },
  proteinSpace: {
    id: "synthetic-protein",
    kind: "sequence",
    length: 8,
    context: { molecule: "protein" },
  },
  cds: { start: 2, end: 17, strand: "+", phase: 1, proteinOffset: 2 },
};
const point = (
  space: CdsTranslatorConfig["nucleotideSpace"] | CdsTranslatorConfig["proteinSpace"],
  value: number,
) => ({ kind: "point" as const, space, position: { kind: "index" as const, value } });

describe("CDS coordinate translators", () => {
  it("maps plus strand points, codon intervals, and partial nucleotide interval edges", async () => {
    const [forward, reverse] = createCdsTranslators(plus);
    const one = await forward.map(
      { loci: [point(plus.nucleotideSpace, 3)], target: plus.proteinSpace },
      new AbortController().signal,
    );
    expect(one.associations[0]).toMatchObject({
      status: "exact",
      targets: [{ position: { value: 2 } }],
    });
    const interval = await forward.map(
      { loci: [{ kind: "interval", space: plus.nucleotideSpace, start: 3, end: 7 }] },
      new AbortController().signal,
    );
    expect(
      interval.associations[0]?.targets.map((target) =>
        target.kind === "point" ? target.position.value : -1,
      ),
    ).toEqual([2, 3]);
    expect(interval.associations[0]?.status).toBe("partial");
    expect(interval.diagnostics.map((item) => item.code)).toContain(
      "seq.coords.cds.partial-codon-edge",
    );
    const codon = await reverse.map(
      { loci: [point(plus.proteinSpace, 3)] },
      new AbortController().signal,
    );
    expect(codon.associations[0]).toMatchObject({
      targets: [{ kind: "interval", start: 6, end: 9 }],
      status: "exact",
    });
  });

  it("orders reverse strand codons in protein direction while retaining normal half-open genomic intervals", async () => {
    const reverseConfig: CdsTranslatorConfig = {
      ...plus,
      id: "synthetic-minus",
      cds: { start: 2, end: 17, strand: "-", phase: 1, proteinOffset: 1 },
    };
    const [forward, reverse] = createCdsTranslators(reverseConfig);
    const first = await forward.map(
      { loci: [point(reverseConfig.nucleotideSpace, 15)] },
      new AbortController().signal,
    );
    expect(first.associations[0]).toMatchObject({ targets: [{ position: { value: 1 } }] });
    const codon = await reverse.map(
      { loci: [point(reverseConfig.proteinSpace, 1)] },
      new AbortController().signal,
    );
    expect(codon.associations[0]).toMatchObject({
      targets: [{ kind: "interval", start: 13, end: 16 }],
    });
  });

  it("preserves outside-CDS sources as explicit unmapped associations and validates geometry", async () => {
    const [forward] = createCdsTranslators(plus);
    const output = await forward.map(
      { loci: [point(plus.nucleotideSpace, 1)] },
      new AbortController().signal,
    );
    expect(output.associations[0]).toMatchObject({ status: "unmapped", targets: [] });
    expect(
      validateCdsTranslatorConfig({ ...plus, cds: { ...plus.cds, end: 3 } }).map(
        (item) => item.code,
      ),
    ).toContain("seq.coords.cds.geometry");
  });

  it("requires bounded named spaces and rejects malformed capacity, range, phase, and offset", () => {
    const codes = (config: CdsTranslatorConfig) =>
      validateCdsTranslatorConfig(config).map((item) => item.code);
    const { length: omittedNucleotideLength, ...unboundedNucleotide } = plus.nucleotideSpace;
    const { length: omittedProteinLength, ...unboundedProtein } = plus.proteinSpace;
    void omittedNucleotideLength;
    void omittedProteinLength;
    expect(codes({ ...plus, nucleotideSpace: unboundedNucleotide })).toContain(
      "seq.coords.cds.nucleotide-length",
    );
    expect(codes({ ...plus, proteinSpace: unboundedProtein })).toContain(
      "seq.coords.cds.protein-length",
    );
    expect(codes({ ...plus, cds: { ...plus.cds, end: 21 } })).toContain("seq.coords.cds.bounds");
    expect(codes({ ...plus, cds: { ...plus.cds, phase: 2, end: 4 } })).toContain(
      "seq.coords.cds.geometry",
    );
    expect(codes({ ...plus, cds: { ...plus.cds, proteinOffset: 7 } })).toContain(
      "seq.coords.cds.protein-bounds",
    );
    expect(
      codes({ ...plus, proteinSpace: { ...plus.proteinSpace, id: plus.nucleotideSpace.id } }),
    ).toContain("seq.coords.cds.named-spaces");
  });
});
