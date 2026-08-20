import { MVSData } from "molstar/lib/extensions/mvs/index.js";
import { describe, expect, it } from "vitest";
import contactsText from "../../../fixtures/complex/mappings/1BRS-chain-A-D-heavy-atom-contacts.tsv?raw";
import p04637MappingText from "../../../fixtures/uniprot-structure/mappings/P04637-1TUP-chain-A.tsv?raw";
import { createNeutral1A3nMvs } from "./alignment-structure.js";
import { generateComplexMvs, parseComplexContactsTsv } from "./complex.js";
import {
  countMvsRepresentationTypes,
  countMvsTreeNodes,
  queryMvsTree,
} from "./mvs-presentation.js";
import {
  createP04637MappingTranslators,
  createUniProtStructureSeqViewSpec,
  generateUniProtAnnotationMvs,
  p53StructureSpace,
  parseP04637MappingTsv,
} from "./uniprot-structure.js";

const p04637Rows = parseP04637MappingTsv(p04637MappingText);
const contacts = parseComplexContactsTsv(contactsText);

const p04637Profiles = [
  ["missense-score", "score-heatmap"],
  ["structure-coverage", "coverage-swatch"],
  ["regions", "region-blocks"],
  ["sites", "site-markers"],
  ["variants", "variant-markers"],
] as const;

const generateP04637Profile = async (trackId: string, layerId: string) => {
  const [forward] = createP04637MappingTranslators(p04637Rows);
  return generateUniProtAnnotationMvs({
    document: createUniProtStructureSeqViewSpec(p04637Rows),
    viewId: "P04637-structure-main",
    trackId,
    layerId,
    structureUrl: "/fixtures/1TUP.cif",
    signal: new AbortController().signal,
    requestId: `g40-${trackId}`,
    translate: async (loci, signal) =>
      (await forward.map({ loci, target: p53StructureSpace }, signal)).associations,
  });
};

const assertValid = (document: Parameters<typeof queryMvsTree>[0]) => {
  expect(MVSData.validationIssues(document, { noExtra: true })).toBeUndefined();
};

const selectorCount = (document: Parameters<typeof queryMvsTree>[0]): number =>
  queryMvsTree(document, "color").reduce((total, node) => {
    const selector = (node.params as { readonly selector?: unknown } | undefined)?.selector;
    return total + (Array.isArray(selector) ? selector.length : 0);
  }, 0);

describe("G40 cross-case MolViewSpec presentation hardening", () => {
  it("keeps every P04637 activation as one validated cartoon-only document", async () => {
    const generated = await Promise.all(
      p04637Profiles.map(async ([trackId, layerId]) => ({
        trackId,
        generation: await generateP04637Profile(trackId, layerId),
      })),
    );

    for (const { trackId, generation } of generated) {
      assertValid(generation.document);
      expect(countMvsTreeNodes(generation.document)).toMatchObject({
        download: 1,
        parse: 1,
        structure: 1,
        component: 1,
        representation: 1,
      });
      expect(countMvsRepresentationTypes(generation.document)).toEqual({ cartoon: 1 });
      expect(queryMvsTree(generation.document, "focus")).toHaveLength(0);
      expect(queryMvsTree(generation.document, "primitive")).toHaveLength(0);
      expect(selectorCount(generation.document)).toBeGreaterThan(0);
      expect(generation.requestId).toBe(`g40-${trackId}`);
    }

    const score = generated.find(({ trackId }) => trackId === "missense-score")?.generation;
    expect(score?.counts).toEqual({ mapped: 196, partial: 0, ambiguous: 0, unmapped: 197 });
    expect(score === undefined ? 0 : selectorCount(score.document)).toBe(196);
  });

  it("keeps complex interface context proportional and contact detail bounded", () => {
    const interfaceView = generateComplexMvs({
      contacts,
      structureUrl: "/fixtures/1BRS.cif",
      requestId: "g40-interface",
      activation: "interface",
    });
    assertValid(interfaceView.document);
    expect(countMvsRepresentationTypes(interfaceView.document)).toEqual({ cartoon: 2 });
    expect(countMvsTreeNodes(interfaceView.document)).toMatchObject({ component: 2 });
    expect(queryMvsTree(interfaceView.document, "focus")).toHaveLength(0);

    const contactView = generateComplexMvs({
      contacts,
      structureUrl: "/fixtures/1BRS.cif",
      requestId: "g40-contact",
      activation: "contact",
      relationshipId: "1brs-A-D-001",
    });
    assertValid(contactView.document);
    expect(countMvsRepresentationTypes(contactView.document)).toEqual({
      ball_and_stick: 2,
      cartoon: 2,
    });
    expect(countMvsTreeNodes(contactView.document)).toMatchObject({ component: 5, focus: 1 });
    expect(contactView.endpointRoles.flatMap((endpoint) => endpoint.selectors)).toHaveLength(2);
  });

  it("retains the 1A3N alignment view as a neutral, static-annotation-free cartoon", () => {
    const document = createNeutral1A3nMvs("/fixtures/1A3N.cif");
    assertValid(document);
    expect(countMvsTreeNodes(document)).toMatchObject({
      download: 1,
      parse: 1,
      structure: 1,
      component: 1,
      representation: 1,
      color: 1,
    });
    expect(countMvsRepresentationTypes(document)).toEqual({ cartoon: 1 });
    expect(queryMvsTree(document, "focus")).toHaveLength(0);
    expect(queryMvsTree(document, "primitive")).toHaveLength(0);
    expect(selectorCount(document)).toBe(0);
  });
});
