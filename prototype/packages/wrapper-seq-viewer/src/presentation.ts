import type { SequenceWrapperPresentationConfig } from "@seq-star/seq-viewer";

export class ReferencePresentationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ReferencePresentationError";
    this.code = code;
  }
}

const fail = (code: string, message: string): never => {
  throw new ReferencePresentationError(code, message);
};
const arrayIndex = (key: string): boolean => /^(?:0|[1-9][0-9]*)$/u.test(key);

/** Validate without invoking host getters, then detach every accepted value. */
const assertJson = (value: unknown, seen = new WeakSet<object>()): void => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return;
  if (typeof value !== "object")
    fail(
      "wrapper.seq-viewer.presentation.json",
      "Reference presentation must contain JSON-safe values only.",
    );
  const object = value as object;
  if (seen.has(object))
    fail("wrapper.seq-viewer.presentation.json", "Reference presentation cannot contain cycles.");
  seen.add(object);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype)
      fail(
        "wrapper.seq-viewer.presentation.json",
        "Reference presentation arrays must be plain arrays.",
      );
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (key === "length") continue;
      if (!arrayIndex(key) || !("value" in descriptor) || !descriptor.enumerable)
        fail(
          "wrapper.seq-viewer.presentation.json",
          "Reference presentation arrays cannot contain accessors or extra properties.",
        );
      assertJson(descriptor.value, seen);
    }
    for (let index = 0; index < value.length; index += 1)
      if (!Object.hasOwn(value, index))
        fail(
          "wrapper.seq-viewer.presentation.json",
          "Reference presentation arrays cannot contain holes.",
        );
    return;
  }
  if (
    Object.getPrototypeOf(object) !== Object.prototype ||
    Reflect.ownKeys(object).some((key) => typeof key !== "string")
  )
    fail(
      "wrapper.seq-viewer.presentation.json",
      "Reference presentation objects must be plain objects without symbol keys.",
    );
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(object))) {
    if (!("value" in descriptor) || !descriptor.enumerable)
      fail(
        "wrapper.seq-viewer.presentation.json",
        "Reference presentation cannot contain accessors or hidden properties.",
      );
    assertJson(descriptor.value, seen);
  }
};
const record = (value: unknown, path: string): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    fail("wrapper.seq-viewer.presentation.shape", `${path} must be a plain object.`);
  return value as Record<string, unknown>;
};
const keys = (value: Record<string, unknown>, allowed: readonly string[], path: string): void => {
  for (const key of Object.keys(value))
    if (!allowed.includes(key))
      fail("wrapper.seq-viewer.presentation.shape", `${path}.${key} is not supported.`);
};
const text = (value: unknown, path: string): string => {
  if (typeof value !== "string" || value.trim() === "")
    fail("wrapper.seq-viewer.presentation.shape", `${path} must be a non-empty string.`);
  return value as string;
};

export const snapshotReferenceViewerPresentation = (
  value: unknown,
): SequenceWrapperPresentationConfig => {
  if (value === undefined) return Object.freeze({});
  assertJson(value);
  const presentation = record(value, "presentation");
  keys(presentation, ["tracks"], "presentation");
  if (presentation.tracks === undefined) return Object.freeze({});
  const trackValues = presentation.tracks;
  if (!Array.isArray(trackValues))
    fail("wrapper.seq-viewer.presentation.shape", "presentation.tracks must be an array.");
  const actionValues = trackValues as unknown[];
  const ids = new Set<string>();
  const tracks = Object.freeze(
    actionValues.map((candidate, index) => {
      const track = record(candidate, `presentation.tracks[${index}]`);
      keys(track, ["trackId", "action"], `presentation.tracks[${index}]`);
      const trackId = text(track.trackId, `presentation.tracks[${index}].trackId`);
      if (ids.has(trackId))
        fail(
          "wrapper.seq-viewer.presentation.duplicate-track",
          `presentation.tracks contains duplicate track '${trackId}'.`,
        );
      ids.add(trackId);
      if (track.action === undefined) return Object.freeze({ trackId });
      const action = record(track.action, `presentation.tracks[${index}].action`);
      keys(
        action,
        ["kind", "accessibleName", "tooltip", "icon"],
        `presentation.tracks[${index}].action`,
      );
      const kind = action.kind;
      const icon = action.icon;
      if (kind !== "structure-profile" && kind !== "layer-inspection")
        fail(
          "wrapper.seq-viewer.presentation.shape",
          `presentation.tracks[${index}].action.kind is invalid.`,
        );
      if (icon !== "box" && icon !== "layers")
        fail(
          "wrapper.seq-viewer.presentation.shape",
          `presentation.tracks[${index}].action.icon is invalid.`,
        );
      return Object.freeze({
        trackId,
        action: Object.freeze({
          kind,
          icon,
          accessibleName: text(
            action.accessibleName,
            `presentation.tracks[${index}].action.accessibleName`,
          ),
          tooltip: text(action.tooltip, `presentation.tracks[${index}].action.tooltip`),
        }),
      });
    }),
  );
  return Object.freeze({ tracks });
};
