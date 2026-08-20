import { MVSData } from "molstar/lib/extensions/mvs/index.js";
import { describe, expect, it } from "vitest";
import {
  appendMvsCartoonPresentation,
  countMvsRepresentationTypes,
  countMvsTreeNodes,
  type MvsCartoonStyle,
  type MvsResidueSelector,
  queryMvsTree,
} from "./mvs-presentation.js";

const selector = (
  labelSeqId: number,
  options: Partial<MvsResidueSelector> = {},
): MvsResidueSelector => ({
  label_entity_id: "3",
  label_asym_id: "C",
  auth_asym_id: "A",
  label_seq_id: labelSeqId,
  auth_seq_id: labelSeqId + 100,
  ...options,
});

const createDocument = (styles: readonly MvsCartoonStyle[]) => {
  const builder = MVSData.createBuilder();
  const structure = builder
    .download({ url: "fixtures/1TUP.cif" })
    .parse({ format: "mmcif" })
    .modelStructure();
  const summary = appendMvsCartoonPresentation(structure, styles);
  return {
    document: builder.getState({ title: "presentation test", description_format: "plaintext" }),
    summary,
  };
};

const p53Style: MvsCartoonStyle = {
  componentSelector: { label_entity_id: "3", label_asym_id: "C", auth_asym_id: "A" },
  baseColor: "#CBD5E1",
  residueColors: [
    {
      semanticId: "late-blue",
      color: "#2563EB",
      precedence: 1,
      selectors: [selector(10), selector(4)],
    },
    {
      semanticId: "early-red",
      color: "#DC2626",
      precedence: 2,
      selectors: [selector(7), selector(4)],
    },
  ],
};

describe("MVS presentation helper", () => {
  it("builds one dense cartoon with deterministic base and selector colors", () => {
    const { document, summary } = createDocument([p53Style]);
    expect(MVSData.validationIssues(document, { noExtra: true })).toBeUndefined();
    expect(summary).toEqual({
      cartoonComponents: 1,
      cartoonRepresentations: 1,
      selectorColorNodes: 2,
      atomicDetailComponents: 0,
      atomicDetailRepresentations: 0,
    });
    expect(countMvsTreeNodes(document)).toMatchObject({
      component: 1,
      representation: 1,
      color: 3,
    });
    const colors = queryMvsTree(document, "color").map((node) => node.params);
    expect(colors).toEqual([
      { color: "#CBD5E1" },
      { color: "#2563EB", selector: [selector(10)] },
      { color: "#DC2626", selector: [selector(4), selector(7)] },
    ]);
  });

  it("is byte-equivalent for input permutations and preserves structural selector identity", () => {
    const reordered: MvsCartoonStyle = {
      ...p53Style,
      residueColors: [...p53Style.residueColors]
        .reverse()
        .map((group) => ({ ...group, selectors: [...group.selectors].reverse() })),
    };
    const secondStyle: MvsCartoonStyle = {
      componentSelector: { label_entity_id: "4", label_asym_id: "D", auth_asym_id: "D" },
      baseColor: "#FDE68A",
      residueColors: [],
    };
    const first = createDocument([p53Style, secondStyle]).document;
    const second = createDocument([secondStyle, reordered]).document;
    expect(JSON.stringify(queryMvsTree(first)[0])).toBe(JSON.stringify(queryMvsTree(second)[0]));

    const insertionAndChain: MvsCartoonStyle = {
      ...p53Style,
      residueColors: [
        {
          semanticId: "identity",
          color: "#2563EB",
          precedence: 1,
          selectors: [
            selector(4),
            selector(4),
            selector(4, { label_entity_id: "4" }),
            selector(4, { label_asym_id: "D" }),
            selector(4, { pdbx_PDB_ins_code: "A" }),
            selector(4, { auth_asym_id: "B" }),
            selector(5),
            selector(4, { auth_seq_id: 105 }),
          ],
        },
      ],
    };
    const colors = queryMvsTree(createDocument([insertionAndChain]).document, "color");
    const selectorColor = colors[1];
    if (selectorColor === undefined) throw new Error("Expected a selector color node.");
    expect((selectorColor.params as { selector: readonly unknown[] }).selector).toHaveLength(7);
  });

  it("bounds sparse atomic detail to one union component per final color", () => {
    const { document, summary } = createDocument([
      {
        ...p53Style,
        atomicDetails: [
          {
            semanticId: "named-variants",
            color: "#7C3AED",
            selectors: [selector(9), selector(3), selector(3)],
          },
          {
            semanticId: "named-site",
            color: "#D97706",
            selectors: [selector(5)],
          },
        ],
      },
    ]);
    expect(MVSData.validationIssues(document, { noExtra: true })).toBeUndefined();
    expect(summary.atomicDetailComponents).toBe(2);
    expect(summary.atomicDetailRepresentations).toBe(2);
    expect(countMvsTreeNodes(document)).toMatchObject({ component: 3, representation: 3 });
    expect(countMvsRepresentationTypes(document)).toEqual({ ball_and_stick: 2, cartoon: 1 });
    expect(queryMvsTree(document, "color").map((node) => node.params)).toEqual([
      { color: "#CBD5E1" },
      { color: "#2563EB", selector: [selector(10)] },
      { color: "#DC2626", selector: [selector(4), selector(7)] },
      { color: "#7C3AED" },
      { color: "#D97706" },
    ]);
  });

  it("rejects ambiguous colors and duplicate cartoon styles instead of emitting arbitrary geometry", () => {
    expect(() =>
      createDocument([
        {
          ...p53Style,
          residueColors: [
            { semanticId: "red", color: "#DC2626", precedence: 1, selectors: [selector(4)] },
            { semanticId: "blue", color: "#2563EB", precedence: 1, selectors: [selector(4)] },
          ],
        },
      ]),
    ).toThrow("Ambiguous colors");
    expect(() => createDocument([p53Style, { ...p53Style, baseColor: "#FFFFFF" }])).toThrow(
      "Duplicate cartoon component selector",
    );
    expect(() =>
      createDocument([
        {
          ...p53Style,
          atomicDetails: [
            { semanticId: "red", color: "#DC2626", selectors: [selector(4)] },
            { semanticId: "blue", color: "#2563EB", selectors: [selector(4)] },
          ],
        },
      ]),
    ).toThrow("Ambiguous atomic-detail colors");
  });

  it("omits empty groups and detaches immutable query snapshots", () => {
    const { document, summary } = createDocument([
      {
        ...p53Style,
        residueColors: [{ semanticId: "empty", color: "#2563EB", precedence: 1, selectors: [] }],
        atomicDetails: [{ semanticId: "empty-detail", color: "#7C3AED", selectors: [] }],
      },
    ]);
    expect(summary).toMatchObject({ selectorColorNodes: 0, atomicDetailComponents: 0 });
    expect(countMvsRepresentationTypes(document)).toEqual({ cartoon: 1 });
    const source = MVSData.toMVSJ(document);
    const node = queryMvsTree(document, "color")[0];
    if (node === undefined) throw new Error("Expected base color node.");
    expect(() => {
      (node.params as { color: string }).color = "#000000";
    }).toThrow();
    expect(MVSData.toMVSJ(document)).toBe(source);
  });

  it("queries every state of a multiple-state MVS document", () => {
    const first = MVSData.createBuilder();
    first.canvas({ background_color: "white" });
    const second = MVSData.createBuilder();
    second.canvas({ background_color: "black" });
    const document = MVSData.createMultistate([
      first.getSnapshot({ title: "first", linger_duration_ms: 0 }),
      second.getSnapshot({ title: "second", linger_duration_ms: 0 }),
    ]);
    expect(queryMvsTree(document, "canvas")).toHaveLength(2);
  });
});
