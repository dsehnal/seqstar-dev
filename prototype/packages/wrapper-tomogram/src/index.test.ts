import { describe, expect, it } from "vitest";
import { validateTomogramViewDocument } from "./index.js";

const document = () => ({
  kind: "tomogram-particle-view",
  version: "0.1.0",
  id: "live-particles",
  title: "PP7",
  description: "Live",
  datasetId: "DS-10493",
  runId: "RN-34483",
  tomogramId: "TM-52425",
  neuroglancerUrl: "https://neuroglancer-demo.appspot.com/#!state",
  keyPhotoUrl: "https://files.cryoetdataportal.cziscience.com/key.png",
  sourceUrl: "https://cryoetdataportal.czscience.com/datasets/10493",
  dimensions: [1230, 1230, 480],
  voxelSpacingAngstrom: 4.995,
  coordinateSpace: { id: "particles", kind: "spatial-particle", length: 1 },
  particleClass: {
    id: "pp7",
    name: "PP7",
    annotationId: "AN-134660",
    objectId: "UniProtKB:P03630",
  },
  particles: [
    {
      id: "AN-134660:0001",
      classId: "pp7",
      location: [1, 2, 3],
      orientation: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    },
  ],
});

describe("tomogram document boundary", () => {
  it("accepts the exact JSON-safe live particle contract", () => {
    expect(validateTomogramViewDocument(document())).toBe(true);
  });

  it("rejects duplicate particles, count mismatches, and non-HTTPS sources", () => {
    expect(
      validateTomogramViewDocument({
        ...document(),
        coordinateSpace: { id: "particles", kind: "spatial-particle", length: 2 },
      }),
    ).toBe(false);
    expect(
      validateTomogramViewDocument({
        ...document(),
        particles: [...document().particles, ...document().particles],
        coordinateSpace: { id: "particles", kind: "spatial-particle", length: 2 },
      }),
    ).toBe(false);
    expect(
      validateTomogramViewDocument({ ...document(), keyPhotoUrl: "http://example.test/key.png" }),
    ).toBe(false);
    expect(
      validateTomogramViewDocument({
        ...document(),
        particles: [{ ...document().particles[0], orientation: [[1, 0, 0]] }],
      }),
    ).toBe(false);
    expect(validateTomogramViewDocument({ ...document(), unexpected: true })).toBe(false);
  });
});
