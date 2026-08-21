import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import {
  type HarnessMessage,
  InteractionEventSchema,
  type InteractionLease,
  interactionClearApplies,
  isCapability,
  isCurrentGeneration,
  isHarnessMessage,
  isLifecycleTransition,
  payloadSchema,
} from "./index.js";

describe("harness contract golden examples", () => {
  it("rejects non-JSON-safe message envelopes and accepts a serializable one", () => {
    const messageId = "4fbc14d0-3adb-4e6f-a8c7-4cbd3067a42d";
    const message: HarnessMessage<"example"> = {
      id: messageId,
      type: "example",
      version: "0.1.0",
      source: { component: "source" },
      correlationId: messageId,
      timestamp: "2026-08-19T00:00:00.000Z",
      payload: { stable: true },
    };
    expect(isHarnessMessage(message)).toBe(true);
    expect(isHarnessMessage({ ...message, payload: { undefinedValue: undefined } })).toBe(false);
    expect(isHarnessMessage({ ...message, payload: new Uint8Array([1]) })).toBe(false);
    expect(isHarnessMessage({ ...message, timestamp: "not-an-instant" })).toBe(false);
    expect(isHarnessMessage({ ...message, timestamp: "2026-99-99T99:99:99Z" })).toBe(false);
    expect(isHarnessMessage({ ...message, timestamp: "2026-02-30T00:00:00.1Z" })).toBe(false);
    expect(isHarnessMessage({ ...message, timestamp: "2024-02-29T23:59:59.123456Z" })).toBe(true);
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    expect(() => isHarnessMessage({ ...message, payload: cycle })).not.toThrow();
    expect(isHarnessMessage({ ...message, payload: cycle })).toBe(false);
  });

  it("uses TypeBox schemas at registry boundaries", () => {
    const schema = payloadSchema<{ readonly id: string }>(
      Type.Object({ id: Type.String() }, { additionalProperties: false }),
    );
    expect(schema.check({ id: "ok" })).toBe(true);
    expect(schema.check({ id: "ok", extra: true })).toBe(false);
    expect(
      payloadSchema(InteractionEventSchema).check({
        interactionId: "native-1",
        interaction: "hover",
        phase: "set",
        origin: {
          componentId: "sequence",
          sequenceId: "p53",
          alignmentId: "msa",
          alignmentMemberId: "member-a",
        },
        semanticTarget: { endpointRole: "source", locusIndex: 0 },
        loci: [],
      }),
    ).toBe(true);
    expect(
      payloadSchema(InteractionEventSchema).check({
        interactionId: "native-1",
        interaction: "hover",
        phase: "set",
        origin: { componentId: "sequence", nativeEvent: "not-portable" },
        loci: [],
      }),
    ).toBe(false);
    expect(
      payloadSchema(InteractionEventSchema).check({
        interactionId: "viewport-1",
        interaction: "viewport",
        phase: "set",
        origin: { componentId: "sequence" },
        viewport: {
          offsetStart: 2,
          offsetEnd: 6,
          totalColumns: 10,
          segments: [
            { segmentId: "first", spaceId: "sequence-a", start: 2, end: 4 },
            { segmentId: "second", spaceId: "sequence-b", start: 0, end: 2 },
          ],
        },
        loci: [],
      }),
    ).toBe(true);
    expect(
      payloadSchema(InteractionEventSchema).check({
        interactionId: "viewport-1",
        interaction: "viewport",
        phase: "set",
        origin: { componentId: "sequence" },
        viewport: { offsetStart: -1, offsetEnd: 1, totalColumns: 1, segments: [] },
        loci: [],
      }),
    ).toBe(false);
    expect(
      payloadSchema(InteractionEventSchema).check({
        interactionId: "native-1",
        interaction: "hover",
        phase: "set",
        origin: { componentId: "sequence" },
        semanticTarget: { locusIndex: -1 },
        loci: [],
      }),
    ).toBe(false);
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    const guarded = payloadSchema(InteractionEventSchema);
    expect(() => guarded.check(cycle)).not.toThrow();
    expect(guarded.check(cycle)).toBe(false);
    let reads = 0;
    const changingGetter = {} as { readonly id: string };
    Object.defineProperty(changingGetter, "id", {
      enumerable: true,
      get: () => {
        reads += 1;
        if (reads === 1) return "valid-once";
        throw new Error("changed after guard");
      },
    });
    expect(() => schema.check(changingGetter)).not.toThrow();
    expect(schema.check(changingGetter)).toBe(false);
  });

  it("freezes capability grammar, lifecycle transitions, and late completion behavior", () => {
    expect(isCapability("seqstar:format/molviewspec")).toBe(true);
    expect(isCapability("not a capability")).toBe(false);
    expect(isLifecycleTransition("accepted", "rendered")).toBe(true);
    expect(isLifecycleTransition("rendered", "failed")).toBe(false);
    expect(isCurrentGeneration(3, 3)).toBe(true);
    expect(isCurrentGeneration(2, 3)).toBe(false);
  });

  it("clear is confined to the interaction owner and optional interaction id", () => {
    const lease: InteractionLease = {
      interactionId: "hover",
      owner: { correlationId: "root", sourceComponent: "sequence" },
    };
    expect(interactionClearApplies(lease, { owner: lease.owner })).toBe(true);
    expect(interactionClearApplies(lease, { interactionId: "other", owner: lease.owner })).toBe(
      false,
    );
    expect(
      interactionClearApplies(lease, {
        owner: { correlationId: "root", sourceComponent: "structure" },
      }),
    ).toBe(false);
  });

  it("documents FIFO/reentrancy as append-after-current-delivery", () => {
    const queue = ["native", "selection"];
    const delivery: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      delivery.push(current);
      if (current === "native") queue.push("derived");
    }
    expect(delivery).toEqual(["native", "selection", "derived"]);
  });
});
