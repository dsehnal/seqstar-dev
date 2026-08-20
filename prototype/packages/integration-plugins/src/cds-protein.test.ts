import {
  type ComponentFactory,
  createApplicationHarness,
  type HarnessMessage,
} from "@seq-star/harness-core";
import { describe, expect, it } from "vitest";
import {
  cdsNucleotideDocument,
  cdsNucleotideSpace,
  cdsProteinDocument,
  cdsProteinSpace,
  createCdsProteinPlugin,
} from "./cds-protein.js";

describe("P70 CDS/protein plugin", () => {
  it("publishes two valid independent documents and lets the harness synchronize whole codons", async () => {
    expect(cdsNucleotideDocument.sequences[0]?.residues).toHaveLength(24);
    expect(cdsProteinDocument.sequences[0]?.residues).toBe("MAEFPG");
    const factory = (type: string, space: typeof cdsNucleotideSpace): ComponentFactory => ({
      type,
      create({ id }) {
        return {
          id,
          capabilities: ["seqstar:format/seqviewspec"],
          async start(context) {
            context.reportCoordinateSpaces([space]);
          },
          dispose() {},
        };
      },
    });
    const harness = createApplicationHarness(
      {
        id: "p70-test",
        components: [
          { id: "nucleotide", type: "test.nucleotide" },
          { id: "protein", type: "test.protein" },
        ],
        plugins: [{ id: "p70", plugin: "test.p70" }],
        synchronization: [
          {
            id: "p70-hover",
            interaction: "hover",
            between: ["nucleotide", "protein"],
            unmapped: "clear",
          },
          {
            id: "p70-select",
            interaction: "select",
            between: ["nucleotide", "protein"],
            unmapped: "preserve",
          },
        ],
      },
      {
        componentFactories: [
          factory("test.nucleotide", cdsNucleotideSpace),
          factory("test.protein", cdsProteinSpace as typeof cdsNucleotideSpace),
        ],
        pluginFactories: [
          {
            plugin: "test.p70",
            create: () =>
              createCdsProteinPlugin({
                nucleotideComponent: "nucleotide",
                proteinComponent: "protein",
              }),
          },
        ],
      },
    );
    const observed: HarnessMessage[] = [];
    harness.fabric.observe().subscribe((message) => observed.push(message));
    await harness.start();
    const send = (
      componentId: string,
      locus: unknown,
      interaction: "hover" | "select" = "hover",
      phase: "set" | "clear" = "set",
      lease?: { readonly correlationId: string; readonly interactionId: string },
    ) => {
      const id = crypto.randomUUID();
      const correlationId = lease?.correlationId ?? id;
      const interactionId = lease?.interactionId ?? crypto.randomUUID();
      harness.fabric.publish({
        id,
        type: "interaction.native",
        version: "0.1.0",
        source: { component: componentId },
        correlationId,
        timestamp: new Date().toISOString(),
        payload: {
          interactionId,
          interaction,
          phase,
          origin: { componentId },
          loci: phase === "clear" ? [] : [locus],
        } as never,
      });
      return { id, correlationId, interactionId };
    };
    const forward = send("nucleotide", {
      kind: "point",
      space: cdsNucleotideSpace,
      position: { kind: "index", value: 4 },
    });
    const reverse = send(
      "protein",
      { kind: "point", space: cdsProteinSpace, position: { kind: "index", value: 0 } },
      "select",
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    const reflected = (id: string, type: string) =>
      observed.find((message) => message.correlationId === id && message.type === type);
    expect(reflected(forward.correlationId, "interaction.highlight.apply")?.target).toEqual({
      component: "protein",
    });
    const reverseReflection = reflected(reverse.correlationId, "interaction.selection.apply");
    expect(reverseReflection?.target).toEqual({ component: "nucleotide" });
    if (reverseReflection === undefined)
      throw new Error("Expected protein selection to reach nucleotide viewer.");
    expect(
      (reverseReflection.payload as { loci?: readonly { start?: number; end?: number }[] })
        .loci?.[0],
    ).toMatchObject({ start: 3, end: 6 });
    expect(observed.some((message) => message.type === "cds-protein.mapping")).toBe(true);
    const clear = send("nucleotide", undefined, "hover", "clear", forward);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const reflectedClear = observed.find(
      (message) =>
        message.causationId === clear.id && message.type === "interaction.highlight.clear",
    );
    expect(reflectedClear).toMatchObject({
      correlationId: forward.correlationId,
      causationId: clear.id,
      payload: {
        interactionId: forward.interactionId,
        owner: {
          correlationId: forward.correlationId,
          sourceComponent: "nucleotide",
        },
      },
    });
    expect(reflectedClear?.target).toEqual({
      component: "protein",
    });
    const mappingCountBeforeDispose = observed.filter(
      (message) => message.type === "cds-protein.mapping",
    ).length;
    await harness.dispose();
    harness.fabric.publish({
      id: crypto.randomUUID(),
      type: "interaction.native",
      version: "0.1.0",
      source: { component: "nucleotide" },
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      payload: {
        interactionId: crypto.randomUUID(),
        interaction: "hover",
        phase: "set",
        origin: { componentId: "nucleotide" },
        loci: [],
      } as never,
    });
    expect(observed.filter((message) => message.type === "cds-protein.mapping")).toHaveLength(
      mappingCountBeforeDispose,
    );
  });
});
