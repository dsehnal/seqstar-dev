import { describe, expect, it } from "vitest";
import { validateRendererChooserConfiguration } from "./index.js";

const descriptor = {
  caseId: "complex",
  modes: ["reference", "nightingale"],
  initialMode: "reference",
} as const;
const components = {
  reference: [{ id: "sequence", type: "seqstar.reference-viewer" }],
  nightingale: [{ id: "sequence", type: "seqstar.nightingale" }],
} as const;

describe("renderer chooser configuration", () => {
  it("accepts the exact frozen JSON boundary", () => {
    expect(() => validateRendererChooserConfiguration(descriptor, components)).not.toThrow();
    expect(() =>
      validateRendererChooserConfiguration(
        {
          caseId: "renderer-portability",
          modes: ["compare", "reference", "nightingale"],
          initialMode: "compare",
        },
        {
          compare: [
            { id: "reference", type: "seqstar.reference-viewer" },
            { id: "nightingale", type: "seqstar.nightingale" },
          ],
          reference: [{ id: "reference", type: "seqstar.reference-viewer" }],
          nightingale: [{ id: "nightingale", type: "seqstar.nightingale" }],
        },
      ),
    ).not.toThrow();
  });

  it.each([
    [{ ...descriptor, extra: true }, components],
    [{ ...descriptor, modes: ["reference", "reference"] }, components],
    [{ ...descriptor, modes: ["reference", "compare"] }, components],
    [descriptor, { reference: components.reference }],
    [descriptor, { ...components, extra: components.reference }],
    [
      descriptor,
      {
        ...components,
        reference: [{ id: "sequence", type: "seqstar.reference-viewer", extra: true }],
      },
    ],
  ])("fails closed for malformed descriptors or mode maps", (candidate, modes) => {
    expect(() => validateRendererChooserConfiguration(candidate, modes)).toThrow();
  });

  it("rejects accessors, cycles, and non-plain configuration", () => {
    const accessor = Object.defineProperty({}, "caseId", { get: () => "complex" });
    expect(() => validateRendererChooserConfiguration(accessor, components)).toThrow();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() =>
      validateRendererChooserConfiguration(descriptor, {
        ...components,
        reference: [{ id: "sequence", type: "seqstar.reference-viewer", config: cyclic }],
      }),
    ).toThrow();
    expect(() =>
      validateRendererChooserConfiguration(descriptor, {
        ...components,
        reference: [
          new (class Component {
            id = "sequence";
            type = "seqstar.reference-viewer";
          })(),
        ],
      }),
    ).toThrow();
  });
});
