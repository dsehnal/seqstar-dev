import { describe, expect, it } from "vitest";
import type { JsonValue } from "./index.js";
import { isDiagnostic, isJsonSafeValue } from "./index.js";

// @ts-expect-error functions are not serialized JSON values.
const functionJsonValue: JsonValue = { nested: () => undefined };
void functionJsonValue;
// @ts-expect-error class instances are not serialized JSON values.
const dateJsonValue: JsonValue = { nested: new Date() };
void dateJsonValue;

describe("shared serialized JSON contract", () => {
  it("rejects hostile and non-JSON values without throwing", () => {
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    class Instance {}
    const throwing = Object.create(Object.prototype) as { readonly value: unknown };
    Object.defineProperty(throwing, "value", {
      enumerable: true,
      get: () => {
        throw new Error("hostile getter");
      },
    });
    for (const value of [
      undefined,
      Symbol("x"),
      1n,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      new Date(),
      new Uint8Array([1]),
      new Instance(),
      cycle,
      throwing,
    ]) {
      expect(() => isJsonSafeValue(value)).not.toThrow();
      expect(isJsonSafeValue(value)).toBe(false);
    }
  });

  it("shares the recursive JSON check with diagnostics", () => {
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    expect(
      isDiagnostic({
        code: "example",
        severity: "warning",
        message: "valid",
        details: { nested: [null, 1, true] },
      }),
    ).toBe(true);
    expect(
      isDiagnostic({
        code: "example",
        severity: "warning",
        message: "invalid",
        details: { date: new Date() },
      }),
    ).toBe(false);
    expect(() => isDiagnostic(cycle)).not.toThrow();
    expect(isDiagnostic(cycle)).toBe(false);
  });
});
