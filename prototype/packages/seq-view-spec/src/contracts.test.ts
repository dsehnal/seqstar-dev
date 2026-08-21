import { describe, expect, it } from "vitest";
import {
  type ActiveSeqViewSpecProjection,
  createSeqViewSpec,
  isSeqViewSpecDigest,
  isSha256Digest,
  type SeqViewSpecDigest,
  validateSeqViewSpecShape,
} from "./index.js";

describe("SeqViewSpec projection and digest contract", () => {
  it("freezes the RFC8785/SHA-256 representation", () => {
    const digest: SeqViewSpecDigest = {
      algorithm: "sha256",
      canonicalization: "RFC8785",
      value: "sha256-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    };
    const projection: ActiveSeqViewSpecProjection = {
      componentId: "sequence",
      requestId: "request-1",
      generation: 2,
      documentId: "doc",
      viewId: "main",
      digest: digest.value,
      status: "rendered",
    };
    expect(projection.digest).toBe(digest.value);
    expect(isSha256Digest(digest.value)).toBe(true);
    expect(isSeqViewSpecDigest(digest)).toBe(true);
    expect(isSha256Digest("sha256-0123")).toBe(false);
    expect(
      isSha256Digest("sha256-0123456789ABCDEF0123456789abcdef0123456789abcdef0123456789abcdef"),
    ).toBe(false);
    expect(
      isSha256Digest("sha256-zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"),
    ).toBe(false);
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    expect(() => isSeqViewSpecDigest(cycle)).not.toThrow();
    expect(isSeqViewSpecDigest(cycle)).toBe(false);
    let reads = 0;
    const changingGetter = {
      algorithm: "placeholder",
      value: digest.value,
      canonicalization: "RFC8785",
    };
    Object.defineProperty(changingGetter, "algorithm", {
      enumerable: true,
      get: () => {
        reads += 1;
        if (reads === 1) return "sha256";
        throw new Error("changed after guard");
      },
    });
    expect(() => isSeqViewSpecDigest(changingGetter)).not.toThrow();
    expect(isSeqViewSpecDigest(changingGetter)).toBe(false);
  });

  it("accepts only the strict portable-document envelope", () => {
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    expect(
      validateSeqViewSpecShape({
        kind: "seq-view-spec",
        version: "0.1.0",
        id: "doc",
        sequences: [],
        views: [],
      }).ok,
    ).toBe(false);
    expect(
      validateSeqViewSpecShape({
        kind: "seq-view-spec",
        version: "0.1.0",
        id: "doc",
        sequences: [{}],
        views: [{}],
        unexpected: true,
      }).ok,
    ).toBe(false);
    expect(() => validateSeqViewSpecShape(cycle)).not.toThrow();
    expect(validateSeqViewSpecShape(cycle).ok).toBe(false);
    let reads = 0;
    const changingGetter = {
      kind: "placeholder",
      version: "0.1.0",
      id: "doc",
      sequences: [{}],
      views: [{}],
    };
    Object.defineProperty(changingGetter, "kind", {
      enumerable: true,
      get: () => {
        reads += 1;
        if (reads === 1) return "seq-view-spec";
        throw new Error("changed after guard");
      },
    });
    expect(() => validateSeqViewSpecShape(changingGetter)).not.toThrow();
    expect(validateSeqViewSpecShape(changingGetter).ok).toBe(false);
    const withAssemblyMemberMetadata = {
      kind: "seq-view-spec",
      version: "0.1.0",
      id: "doc",
      sequences: [{ id: "sequence", coordinateSpace: "space", alphabet: "protein", residues: "A" }],
      assemblies: [
        {
          id: "assembly",
          members: [{ id: "member", sequence: "sequence", metadata: { label: "not allowed" } }],
        },
      ],
      views: [
        {
          id: "view",
          axis: { segments: [{ id: "axis", space: "space", start: 0, end: 1 }] },
          sections: [
            {
              id: "section",
              tracks: [
                {
                  id: "track",
                  layers: [{ id: "layer", representation: "sequence", sequence: "sequence" }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(validateSeqViewSpecShape(withAssemblyMemberMetadata).ok).toBe(false);
  });

  it("rejects hostile accessors before semantic reads in validation transactions", () => {
    let reads = 0;
    const thirdReadGetter = {
      kind: "seq-view-spec",
      version: "0.1.0",
      id: "doc",
      sequences: [],
      views: [],
    };
    Object.defineProperty(thirdReadGetter, "kind", {
      enumerable: true,
      get: () => {
        reads += 1;
        if (reads >= 3) throw new Error("third read");
        return "seq-view-spec";
      },
    });
    const throwingGetter = {
      kind: "seq-view-spec",
      version: "0.1.0",
      id: "doc",
      sequences: [],
      views: [],
    };
    Object.defineProperty(throwingGetter, "kind", {
      enumerable: true,
      get: () => {
        throw new Error("always throws");
      },
    });
    for (const input of [thirdReadGetter, throwingGetter]) {
      expect(() => validateSeqViewSpecShape(input)).not.toThrow();
      expect(validateSeqViewSpecShape(input).ok).toBe(false);
    }
    expect(reads).toBe(0);
    expect(() => createSeqViewSpec(thirdReadGetter as never)).not.toThrow();
    expect(createSeqViewSpec(thirdReadGetter as never).ok).toBe(false);
  });
});
