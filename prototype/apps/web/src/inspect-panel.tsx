import type { HarnessMessage } from "@seq-star/harness-core";
import { useHarnessMessages } from "@seq-star/harness-react";
import { validateSeqViewSpec } from "@seq-star/seq-view-spec";
import { useCallback, useEffect, useRef, useState } from "react";
import { downloadPreparedDocument } from "./diagnostics";
import {
  commitInspectValidation,
  emptyInspectPanelState,
  type InspectDocument,
  type InspectPanelState,
  type InspectPanelTargets,
  type InspectValidation,
  prepareInspectDownload,
  reduceInspectPanelMessage,
  safeInspectJson,
} from "./inspect-panel-state";

export const useInspectPanelState = (targets: InspectPanelTargets): InspectPanelState => {
  const [state, setState] = useState<InspectPanelState>(emptyInspectPanelState);
  const sequenceComponent = targets.sequenceComponent;
  const structureComponent = targets.structureComponent;
  useHarnessMessages(
    useCallback(
      (message: HarnessMessage) => {
        setState((current) =>
          reduceInspectPanelMessage(current, message, { sequenceComponent, structureComponent }),
        );
      },
      [sequenceComponent, structureComponent],
    ),
  );
  return state;
};

const validateDocument = async (document: InspectDocument): Promise<InspectValidation> => {
  if (document.format === "seqviewspec") {
    const result = validateSeqViewSpec(document.document);
    return {
      identity: document.identity,
      valid: result.ok,
      diagnostics: result.diagnostics.map((item) => `${item.code}: ${item.message}`),
    };
  }
  const { MVSData } = await import("molstar/lib/extensions/mvs/index.js");
  const issues = MVSData.validationIssues(document.document as never, { noExtra: true }) ?? [];
  return {
    identity: document.identity,
    valid: issues.length === 0,
    diagnostics: issues.map(String),
  };
};

const useValidation = (document: InspectDocument | undefined): InspectValidation | undefined => {
  const [validation, setValidation] = useState<InspectValidation>();
  const currentRef = useRef(document);
  currentRef.current = document;
  useEffect(() => {
    if (document === undefined) {
      setValidation(undefined);
      return;
    }
    let live = true;
    void validateDocument(document).then((result) => {
      if (!live) return;
      setValidation((current) => commitInspectValidation(currentRef.current, result, current));
    });
    return () => {
      live = false;
    };
  }, [document]);
  return validation?.identity === document?.identity ? validation : undefined;
};

const copyDocument = async (document: InspectDocument): Promise<void> => {
  const text = `${safeInspectJson(document.document)}\n`;
  if (navigator.clipboard?.writeText !== undefined) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // The fallback keeps the prototype usable when clipboard permission is absent.
    }
  }
  const input = window.document.createElement("textarea");
  input.value = text;
  input.style.position = "fixed";
  input.style.opacity = "0";
  window.document.body.append(input);
  input.select();
  window.document.execCommand("copy");
  input.remove();
};

type Tab = "summary" | "seqviewspec" | "mvs" | "messages";

function DocumentSection({
  document,
  format,
  testId,
  validation,
}: {
  readonly document: InspectDocument | undefined;
  readonly format: "SeqViewSpec" | "MolViewSpec";
  readonly testId: string;
  readonly validation: InspectValidation | undefined;
}) {
  const [copyStatus, setCopyStatus] = useState("");
  const prepared = prepareInspectDownload(document, validation);
  return (
    <section aria-labelledby={`${testId}-heading`} className="grid gap-3" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold" id={`${testId}-heading`}>
            Current displayed {format}
          </h3>
          <p className="text-slate-300 text-xs">
            {document === undefined
              ? "No targeted document observed."
              : `${document.requestId} · ${document.lifecycle} · ${validation === undefined ? "validating" : validation.valid ? "valid" : "invalid"}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded border border-slate-500 px-2 py-1 text-xs disabled:opacity-50"
            data-testid={`inspect-copy-${document?.format ?? format.toLowerCase()}`}
            disabled={document === undefined || validation?.valid !== true}
            onClick={() => {
              if (document === undefined) return;
              void copyDocument(document).then(() => setCopyStatus("Copied"));
            }}
            type="button"
          >
            Copy validated JSON
          </button>
          <button
            className="rounded border border-slate-500 px-2 py-1 text-xs disabled:opacity-50"
            data-testid={`inspect-download-${document?.format ?? format.toLowerCase()}`}
            disabled={prepared === undefined}
            onClick={() => {
              if (prepared !== undefined) downloadPreparedDocument(prepared);
            }}
            type="button"
          >
            Download validated JSON
          </button>
        </div>
      </div>
      <p aria-live="polite" className="sr-only">
        <span data-testid={`inspect-copy-status-${document?.format ?? format.toLowerCase()}`}>
          {copyStatus}
        </span>
      </p>
      {validation?.valid === false ? (
        <p className="text-red-300 text-xs" role="alert">
          {validation.diagnostics.join("; ")}
        </p>
      ) : null}
      <pre
        className="max-h-80 overflow-auto rounded bg-black/30 p-3 text-xs"
        data-testid={`inspect-${document?.format ?? format.toLowerCase()}-json`}
      >
        {document === undefined ? "null" : safeInspectJson(document.document)}
      </pre>
    </section>
  );
}

export function InspectPanel({ state }: { readonly state: InspectPanelState }) {
  const [tab, setTab] = useState<Tab>("summary");
  const sequenceValidation = useValidation(state.sequenceDocument);
  const structureValidation = useValidation(state.structureDocument);
  const activeDataset = state.catalog?.datasets.find(
    (dataset) => dataset.id === state.datasetStatus?.datasetId,
  );
  const tabs: readonly { readonly id: Tab; readonly label: string }[] = [
    { id: "summary", label: "Summary" },
    { id: "seqviewspec", label: "SeqViewSpec" },
    { id: "mvs", label: "MolViewSpec" },
    { id: "messages", label: `Messages (${state.rows.length})` },
  ];
  return (
    <aside
      aria-labelledby="inspect-heading"
      className="max-h-[36rem] overflow-y-auto rounded-lg bg-slate-950 p-5 text-slate-100"
      data-testid="inspect-panel"
    >
      <div className="sticky top-0 z-10 bg-slate-950 pb-3">
        <h2 className="font-semibold text-lg" id="inspect-heading">
          Inspect current harness state
        </h2>
        <div aria-label="Inspector sections" className="mt-3 flex flex-wrap gap-2" role="tablist">
          {tabs.map((item) => (
            <button
              aria-controls={`inspect-tabpanel-${item.id}`}
              aria-selected={tab === item.id}
              className={`rounded px-3 py-2 text-sm ${tab === item.id ? "bg-sky-600 text-white" : "border border-slate-600 text-slate-200"}`}
              data-testid={`inspect-tab-${item.id}`}
              id={`inspect-tab-${item.id}`}
              key={item.id}
              onClick={() => setTab(item.id)}
              role="tab"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <section
        aria-labelledby="inspect-tab-summary"
        className="grid gap-4"
        hidden={tab !== "summary"}
        id="inspect-tabpanel-summary"
        role="tabpanel"
      >
        <div data-testid="inspect-dataset-summary">
          <h3 className="font-semibold">Dataset and request lifecycle</h3>
          <p className="mt-1 text-slate-300 text-sm">
            {activeDataset?.label ?? "Waiting for dataset catalog"} ·{" "}
            {state.datasetStatus?.status ?? "pending"}
          </p>
          <p className="text-slate-400 text-xs">
            generation {state.datasetStatus?.generation ?? "—"} · sequence{" "}
            {state.datasetStatus?.sequenceRequestId ?? "—"} · structure{" "}
            {state.datasetStatus?.structureRequestId ?? "—"}
          </p>
        </div>
        <div>
          <h3 className="font-semibold">Current displayed documents</h3>
          <ul className="mt-1 text-slate-300 text-sm">
            <li data-testid="inspect-seq-request-id">
              SeqViewSpec: {state.sequenceDocument?.requestId ?? "pending"} ·{" "}
              <span data-testid="inspect-seq-lifecycle">
                {state.sequenceDocument?.lifecycle ?? "none visible"}
              </span>
            </li>
            <li data-testid="inspect-mvs-request-id">
              MolViewSpec: {state.structureDocument?.requestId ?? "pending"} ·{" "}
              <span data-testid="inspect-mvs-lifecycle">
                {state.structureDocument?.lifecycle ?? "none visible"}
              </span>
            </li>
          </ul>
          <p className="mt-2 text-slate-400 text-xs">
            pending sequence: {state.pendingSequenceDocument?.requestId ?? "none"} · pending
            structure: {state.pendingStructureDocument?.requestId ?? "none"}
          </p>
        </div>
        <div>
          <h3 className="font-semibold">Current mapping summary</h3>
          {state.generation === undefined ? (
            <p className="mt-1 text-slate-300 text-sm">
              Neutral structure view; activate a track for mapped detail.
            </p>
          ) : (
            <>
              <p className="mt-1 text-slate-300 text-sm" data-testid="inspect-mapping-counts">
                mapped {state.generation.counts.mapped} · partial {state.generation.counts.partial}{" "}
                · ambiguous {state.generation.counts.ambiguous} · unmapped{" "}
                {state.generation.counts.unmapped}
              </p>
              <ul
                className="mt-2 grid gap-1 text-slate-300 text-xs"
                data-testid="inspect-mapping-items"
              >
                {state.generation.mapping.map((item) => (
                  <li key={item.itemId}>
                    {item.itemId}: {item.status} · {item.selectors.length} residues · {item.color}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <p className="text-slate-400 text-xs" data-testid="inspect-message-order">
          {state.rows
            .filter(
              (row) =>
                row.message.type === "document.generated.mvs" ||
                row.message.type === "visualization.mvs.request",
            )
            .slice(-8)
            .map((row) => row.message.type)
            .join(" → ")}
        </p>
      </section>
      <section
        aria-labelledby="inspect-tab-seqviewspec"
        hidden={tab !== "seqviewspec"}
        id="inspect-tabpanel-seqviewspec"
        role="tabpanel"
      >
        <DocumentSection
          document={state.sequenceDocument}
          format="SeqViewSpec"
          testId="inspect-seqviewspec"
          validation={sequenceValidation}
        />
      </section>
      <section
        aria-labelledby="inspect-tab-mvs"
        hidden={tab !== "mvs"}
        id="inspect-tabpanel-mvs"
        role="tabpanel"
      >
        <DocumentSection
          document={state.structureDocument}
          format="MolViewSpec"
          testId="inspect-mvs"
          validation={structureValidation}
        />
      </section>
      <section
        aria-labelledby="inspect-tab-messages"
        hidden={tab !== "messages"}
        id="inspect-tabpanel-messages"
        role="tabpanel"
      >
        <h3 className="font-semibold">Bounded chronological messages</h3>
        <ol className="mt-2 grid gap-2" data-testid="inspect-message-list">
          {state.rows.slice(-100).map((row) => (
            <li className="rounded border border-slate-700 p-2 text-xs" key={row.message.id}>
              <span className="font-medium">{row.message.type}</span>
              <span className="ml-2 text-slate-400">{row.message.timestamp}</span>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  );
}
