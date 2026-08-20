import type { HarnessMessage } from "@seq-star/harness-core";
import { describe, expect, it } from "vitest";
import {
  commitValidationIfCurrent,
  emptyDiagnosticsState,
  prepareDocumentDownload,
  reduceDiagnosticMessage,
  retainDiagnosticRow,
  sanitizeForDiagnostics,
} from "./diagnostics";

const uuid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const message = (
  index: number,
  type: string,
  payload: HarnessMessage["payload"] = {},
  target?: HarnessMessage["target"],
): HarnessMessage => ({
  id: uuid(index),
  type,
  version: "0.1.0",
  source: { component: "source" },
  ...(target === undefined ? {} : { target }),
  correlationId: uuid(index),
  timestamp: "2026-08-20T12:00:00.000Z",
  payload,
});

describe("diagnostic retention and safe serialization", () => {
  it("keeps at most 2,000 ordered non-hover messages", () => {
    let rows = emptyDiagnosticsState().rows;
    for (let index = 0; index < 2001; index += 1)
      rows = retainDiagnosticRow(rows, message(index, "harness.diagnostic"));
    expect(rows).toHaveLength(2000);
    expect(rows[0]?.message.id).toBe(uuid(1));
    expect(rows.at(-1)?.message.id).toBe(uuid(2000));
  });

  it("replaces hover by source/target while preserving other destinations", () => {
    const hover = (index: number, target: string) =>
      message(
        index,
        "interaction.native",
        {
          interactionId: String(index),
          interaction: "hover",
          phase: "set",
          origin: { componentId: "source" },
          loci: [],
        },
        { component: target },
      );
    let rows = retainDiagnosticRow([], hover(1, "a"));
    rows = retainDiagnosticRow(rows, hover(2, "a"));
    rows = retainDiagnosticRow(rows, hover(3, "b"));
    expect(rows.map((row) => row.message.id)).toEqual([uuid(2), uuid(3)]);
  });

  it("coalesces native and reflected highlight traffic without evicting ordered events", () => {
    const ordered = [
      message(1, "interaction.selection.apply", {}, { component: "viewer" }),
      message(2, "intent.annotation.show-in-structure", {}, { component: "viewer" }),
      message(3, "visualization.seqviewspec.request", {}, { component: "viewer" }),
    ];
    let rows = ordered.reduce(retainDiagnosticRow, [] as ReturnType<typeof retainDiagnosticRow>);
    for (let index = 4; index < 5004; index += 1) {
      const kind = index % 3;
      rows = retainDiagnosticRow(
        rows,
        message(
          index,
          kind === 0
            ? "interaction.native"
            : kind === 1
              ? "interaction.highlight.apply"
              : "interaction.highlight.clear",
          kind === 0 ? { interaction: "hover" } : { owner: { sourceComponent: "source" } },
          { component: "viewer" },
        ),
      );
    }
    expect(rows).toHaveLength(4);
    expect(rows.slice(0, 3).map((row) => row.message.type)).toEqual(
      ordered.map((item) => item.type),
    );
    expect(rows.at(-1)?.message.id).toBe(uuid(5003));
  });

  it("redacts credential fields and summarizes heavy log payloads", () => {
    const sanitized = sanitizeForDiagnostics(
      {
        apiToken: "private",
        document: { id: "doc", residues: "ACDEFG" },
      },
      { summarizeLargePayloads: true },
    );
    expect(sanitized).toEqual({
      apiToken: "[redacted]",
      document: { inspection: "on-demand", kind: "object", id: "doc", size: 32 },
    });
  });

  it("indexes lifecycle, mapping, and generated documents", () => {
    let state = emptyDiagnosticsState();
    state = reduceDiagnosticMessage(
      state,
      message(1, "lifecycle.visualization", {
        requestId: "r1",
        generation: 2,
        componentId: "viewer",
        status: "degraded",
        diagnostics: [],
      }),
    );
    state = reduceDiagnosticMessage(
      state,
      message(2, "mapping.result", {
        status: "partial",
        paths: [{ sourceIndex: 0, translatorIds: ["a", "b"] }],
        associations: [],
        diagnostics: [{ code: "gap" }],
      }),
    );
    state = reduceDiagnosticMessage(
      state,
      message(3, "visualization.mvs.request", {
        format: "mvs",
        requestId: "m1",
        mode: "replace",
        document: { root: { kind: "root" } },
      }),
    );
    expect(state.lifecycles).toHaveLength(1);
    expect(state.mappings[0]?.paths).toEqual([{ sourceIndex: 0, translatorIds: ["a", "b"] }]);
    expect(state.documents[0]).toMatchObject({ format: "mvs", requestId: "m1" });
  });

  it("invalidates replaced-document validation and ignores stale async results", () => {
    let state = reduceDiagnosticMessage(
      emptyDiagnosticsState(),
      message(
        10,
        "visualization.seqviewspec.request",
        { format: "seqviewspec", requestId: "same", mode: "replace", document: { valid: true } },
        { component: "viewer" },
      ),
    );
    const first = state.documents[0];
    expect(first?.identity).toBe(uuid(10));
    let validation = commitValidationIfCurrent(
      state.documents,
      { valid: true, diagnostics: [], documentIdentity: first?.identity ?? "" },
      {},
    );
    expect(validation[uuid(10)]?.valid).toBe(true);

    state = reduceDiagnosticMessage(
      state,
      message(
        11,
        "visualization.seqviewspec.request",
        { format: "seqviewspec", requestId: "same", mode: "replace", document: { valid: false } },
        { component: "viewer" },
      ),
    );
    expect(state.documents).toHaveLength(1);
    expect(state.documents[0]).toMatchObject({
      identity: uuid(11),
      targetComponent: "viewer",
    });
    expect(validation[state.documents[0]?.identity ?? ""]).toBeUndefined();
    const beforeStaleCommit = validation;
    validation = commitValidationIfCurrent(
      state.documents,
      { valid: true, diagnostics: [], documentIdentity: uuid(10) },
      validation,
    );
    expect(validation).toBe(beforeStaleCommit);
    expect(state.activeDocuments.viewer).toMatchObject({
      requestId: "same",
      documentIdentity: uuid(11),
      status: "requested",
    });
  });

  it("only prepares validated, redacted, parseable document downloads", () => {
    const document = {
      key: "seqviewspec:r1",
      identity: uuid(1),
      messageId: uuid(1),
      requestId: "r1",
      format: "seqviewspec" as const,
      document: { id: "doc", authorization: "private" },
    };
    expect(
      prepareDocumentDownload(document, {
        valid: false,
        diagnostics: ["invalid"],
        documentIdentity: uuid(1),
      }),
    ).toBeUndefined();
    expect(
      prepareDocumentDownload(document, {
        valid: true,
        diagnostics: [],
        documentIdentity: uuid(2),
      }),
    ).toBeUndefined();
    const prepared = prepareDocumentDownload(document, {
      valid: true,
      diagnostics: [],
      documentIdentity: uuid(1),
    });
    expect(prepared?.filename).toBe("r1.seqviewspec.json");
    expect(JSON.parse(prepared?.text ?? "null")).toEqual({
      id: "doc",
      authorization: "[redacted]",
    });
  });
});
