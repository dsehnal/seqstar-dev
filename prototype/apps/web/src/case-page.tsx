import {
  type ComponentFactory,
  createApplicationHarness,
  type EventFabric,
  type HarnessMessage,
} from "@seq-star/harness-core";
import {
  type HarnessHostRegistry,
  HarnessProvider,
  useHarness,
  useHarnessComponentChanges,
  useHarnessHost,
  useHarnessMessages,
} from "@seq-star/harness-react";
import { validateSeqViewSpec } from "@seq-star/seq-view-spec";
import { useCallback, useRef, useState } from "react";
import {
  commitValidationIfCurrent,
  type DiagnosticsState,
  type DocumentValidation,
  type DocumentValidator,
  describeMessageTarget,
  downloadPreparedDocument,
  emptyDiagnosticsState,
  prepareDocumentDownload,
  reduceComponentChange,
  reduceDiagnosticMessage,
  sanitizeForDiagnostics,
} from "./diagnostics";

type PendingCase = {
  readonly id: string;
  readonly title: string;
  readonly story: string;
  readonly instructions: string;
  readonly panels: readonly {
    readonly id: string;
    readonly title: string;
    readonly detail: string;
  }[];
};

const publishLifecycle = (
  fabric: EventFabric,
  componentId: string,
  status: "accepted" | "degraded",
  correlationId: string,
  causationId?: string,
) => {
  const id = crypto.randomUUID();
  fabric.publish({
    id,
    type: "lifecycle.visualization",
    version: "0.1.0",
    source: { component: componentId },
    correlationId,
    ...(causationId === undefined ? {} : { causationId }),
    timestamp: new Date().toISOString(),
    payload: {
      requestId: `pending:${componentId}`,
      generation: 1,
      componentId,
      status,
      ...(status === "degraded" ? { previousView: "cleared" as const } : {}),
      capabilities: ["seqstar:web/pending"],
      diagnostics:
        status === "degraded"
          ? [
              {
                code: "web.packet.pending",
                severity: "warning" as const,
                message: "The integration wrapper for this panel is not installed yet.",
              },
            ]
          : [],
    },
  });
  return id;
};

const createPendingComponentFactory = (hosts: HarnessHostRegistry): ComponentFactory => ({
  type: "web.pending-panel",
  create({ id }) {
    let element: HTMLElement | undefined;
    return {
      id,
      capabilities: ["seqstar:web/pending"],
      async start(context) {
        element = hosts.require(id);
        element.dataset.harnessComponent = "ready";
        const root = document.documentElement;
        root.dataset.harnessStartCount = String(Number(root.dataset.harnessStartCount ?? "0") + 1);
        const correlationId = crypto.randomUUID();
        const acceptedId = publishLifecycle(context.fabric, id, "accepted", correlationId);
        publishLifecycle(context.fabric, id, "degraded", correlationId, acceptedId);
      },
      dispose() {
        element?.removeAttribute("data-harness-component");
        element = undefined;
      },
    };
  },
});

const createPageHarness = (definition: PendingCase, hosts: HarnessHostRegistry) =>
  createApplicationHarness(
    {
      id: definition.id,
      components: definition.panels.map((panel) => ({
        id: panel.id,
        type: "web.pending-panel",
      })),
    },
    { componentFactories: [createPendingComponentFactory(hosts)] },
  );

const documentValidators: Readonly<Record<"seqviewspec" | "mvs", DocumentValidator>> = {
  async seqviewspec(document) {
    const result = validateSeqViewSpec(document);
    return {
      valid: result.ok,
      diagnostics: result.diagnostics.map((item) => `${item.code}: ${item.message}`),
    };
  },
  async mvs(document) {
    const { MVSData } = await import("molstar/lib/extensions/mvs/index.js");
    const issues = MVSData.validationIssues(document as never, { noExtra: true }) ?? [];
    return { valid: issues.length === 0, diagnostics: issues.map(String) };
  },
};

function VisualizerPanel({ panel }: { readonly panel: PendingCase["panels"][number] }) {
  const hostRef = useHarnessHost(panel.id);
  const { status } = useHarness();
  return (
    <section
      aria-labelledby={`${panel.id}-heading`}
      className="min-h-48 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
      data-testid={`visualizer-panel-${panel.id}`}
      ref={hostRef}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold text-slate-950 text-xl" id={`${panel.id}-heading`}>
          {panel.title}
        </h2>
        <span className="rounded-full bg-amber-100 px-2 py-1 font-medium text-amber-900 text-xs">
          Packet pending
        </span>
      </div>
      <p className="mt-3 text-slate-600">{panel.detail}</p>
      <p className="mt-5 text-slate-500 text-sm" data-testid={`panel-status-${panel.id}`}>
        Harness: {status}. The visualizer wrapper is not installed in this packet.
      </p>
    </section>
  );
}

function DocumentInspector({ state }: { readonly state: DiagnosticsState }) {
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined);
  const [validation, setValidation] = useState<
    Readonly<Record<string, DocumentValidation | undefined>>
  >({});
  const documentsRef = useRef(state.documents);
  documentsRef.current = state.documents;
  const selected = state.documents.find((item) => item.key === selectedKey);
  const selectedValidation = selected === undefined ? undefined : validation[selected.identity];
  const validate = async () => {
    if (selected === undefined) return;
    const identity = selected.identity;
    const result = await documentValidators[selected.format](selected.document);
    setValidation((current) =>
      commitValidationIfCurrent(
        documentsRef.current,
        { ...result, documentIdentity: identity },
        current,
      ),
    );
  };
  const download = () => {
    if (selected === undefined || selectedValidation === undefined) return;
    const prepared = prepareDocumentDownload(selected, selectedValidation);
    if (prepared !== undefined) downloadPreparedDocument(prepared);
  };
  return (
    <section aria-labelledby="documents-heading" className="rounded border border-slate-700 p-3">
      <h3 className="font-semibold" id="documents-heading">
        Generated documents
      </h3>
      {state.documents.length === 0 ? (
        <p className="mt-2 text-slate-300 text-sm">No SeqViewSpec or MVS request observed.</p>
      ) : (
        <div className="mt-2 grid gap-3">
          <div className="flex flex-wrap gap-2">
            {state.documents.map((document) => (
              <button
                className="rounded border border-slate-500 px-2 py-1 text-xs"
                key={document.key}
                onClick={() => setSelectedKey(document.key)}
                type="button"
              >
                {document.format}: {document.requestId}
              </button>
            ))}
          </div>
          {selected === undefined ? null : (
            <div data-testid="document-inspector">
              <p className="text-slate-300 text-xs">
                {selected.format} · request {selected.requestId}
                {selected.viewId === undefined ? "" : ` · view ${selected.viewId}`}
                {selected.targetComponent === undefined
                  ? " · no target component"
                  : ` · target ${selected.targetComponent}`}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  className="rounded border border-slate-500 px-2 py-1 text-xs"
                  onClick={() => void validate()}
                  type="button"
                >
                  Validate document
                </button>
                <button
                  className="rounded border border-slate-500 px-2 py-1 text-xs disabled:opacity-50"
                  disabled={selectedValidation?.valid !== true}
                  onClick={download}
                  type="button"
                >
                  Download validated JSON
                </button>
              </div>
              {selectedValidation === undefined ? null : (
                <p className="mt-2 text-xs" role="status">
                  {selectedValidation.valid
                    ? "Document is valid."
                    : `Document is invalid: ${selectedValidation.diagnostics.join("; ")}`}
                </p>
              )}
              <pre className="mt-2 max-h-72 overflow-auto rounded bg-black/30 p-2 text-xs">
                {JSON.stringify(sanitizeForDiagnostics(selected.document), null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function DiagnosticsDrawer({ state }: { readonly state: DiagnosticsState }) {
  const { error, hosts, status } = useHarness();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | undefined>(undefined);
  const components = Object.values(state.components);
  return (
    <aside className="rounded-lg border border-slate-200 bg-slate-950 p-4 text-slate-100">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-lg">Harness diagnostics</h2>
          <p className="text-slate-300 text-sm">
            {state.rows.length} retained messages · {status}
          </p>
        </div>
        <button
          aria-expanded={open}
          className="rounded border border-slate-500 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          {open ? "Hide details" : "Show details"}
        </button>
      </div>
      {open ? (
        <div className="mt-4 grid gap-4" data-testid="diagnostics-drawer">
          {error === undefined ? null : <p role="alert">Harness error: {error.message}</p>}
          <section
            aria-labelledby="components-heading"
            className="rounded border border-slate-700 p-3"
          >
            <h3 className="font-semibold" id="components-heading">
              Components and capabilities
            </h3>
            <p className="mt-1 text-slate-300 text-sm">Registered host panels: {hosts.size}</p>
            <ul className="mt-2 text-sm">
              {components.map((component) => (
                <li key={component.id}>
                  {component.id}: {component.status} · {component.capabilities.join(", ") || "none"}
                </li>
              ))}
            </ul>
          </section>
          <section
            aria-labelledby="active-documents-heading"
            className="rounded border border-slate-700 p-3"
          >
            <h3 className="font-semibold" id="active-documents-heading">
              Active documents and views by wrapper
            </h3>
            {Object.values(state.activeDocuments).length === 0 ? (
              <p className="mt-2 text-slate-300 text-sm">No targeted request observed.</p>
            ) : (
              <ul className="mt-2 text-sm" data-testid="active-document-summary">
                {Object.values(state.activeDocuments).map((item) => (
                  <li key={item.componentId}>
                    {item.componentId}: {item.status} · request {item.requestId}
                    {item.viewId === undefined ? "" : ` · view ${item.viewId}`}
                    {item.visibleRequestId === undefined
                      ? ""
                      : ` · visible ${item.visibleRequestId}`}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section
            aria-labelledby="lifecycle-heading"
            className="rounded border border-slate-700 p-3"
          >
            <h3 className="font-semibold" id="lifecycle-heading">
              Visualization lifecycle and degradation
            </h3>
            {state.lifecycles.length === 0 ? (
              <p className="mt-2 text-slate-300 text-sm">No lifecycle results observed.</p>
            ) : (
              <ul className="mt-2 text-sm" data-testid="lifecycle-summary">
                {state.lifecycles.map((item) => (
                  <li key={`${item.componentId}:${item.requestId}`}>
                    {item.componentId}: {item.status} · generation {item.generation}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section
            aria-labelledby="mapping-heading"
            className="rounded border border-slate-700 p-3"
          >
            <h3 className="font-semibold" id="mapping-heading">
              Mapping paths and per-locus status
            </h3>
            {state.mappings.length === 0 ? (
              <p className="mt-2 text-slate-300 text-sm">No mapping result observed.</p>
            ) : (
              state.mappings.map((mapping) => (
                <pre className="mt-2 overflow-auto text-xs" key={mapping.messageId}>
                  {JSON.stringify(mapping, null, 2)}
                </pre>
              ))
            )}
          </section>
          <DocumentInspector state={state} />
          <section aria-label="Chronological harness messages" className="max-h-80 overflow-auto">
            <h3 className="font-semibold">Chronological messages and correlation chains</h3>
            {state.rows.length === 0 ? (
              <p className="text-slate-300 text-sm">No page messages yet.</p>
            ) : (
              <ol className="mt-2 grid gap-2">
                {state.rows.map((row) => (
                  <li className="rounded border border-slate-700 p-2" key={row.message.id}>
                    <button
                      className="w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                      onClick={() =>
                        setExpanded((value) =>
                          value === row.message.id ? undefined : row.message.id,
                        )
                      }
                      type="button"
                    >
                      <span className="font-medium">{row.message.type}</span>
                      <span className="ml-2 text-slate-300 text-xs">{row.message.timestamp}</span>
                    </button>
                    <p className="mt-1 text-slate-300 text-xs">
                      source:{" "}
                      {row.message.source.component ?? row.message.source.plugin ?? "unknown"}
                      {" · "}target: {describeMessageTarget(row.message)}
                      {" · "}correlation: {row.message.correlationId}
                      {row.message.causationId === undefined
                        ? ""
                        : ` · caused by: ${row.message.causationId}`}
                    </p>
                    {expanded === row.message.id ? (
                      <pre className="mt-2 overflow-auto rounded bg-black/30 p-2 text-xs">
                        {JSON.stringify(row.sanitized, null, 2)}
                      </pre>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      ) : null}
    </aside>
  );
}

function PendingCaseContent({
  definition,
  simulateStartupFailure,
}: {
  readonly definition: PendingCase;
  readonly simulateStartupFailure: () => void;
}) {
  const { harness, status } = useHarness();
  const [diagnostics, setDiagnostics] = useState<DiagnosticsState>(emptyDiagnosticsState);
  const onMessage = useCallback((message: HarnessMessage) => {
    setDiagnostics((current) => reduceDiagnosticMessage(current, message));
  }, []);
  const onComponentChange = useCallback((change: Parameters<typeof reduceComponentChange>[1]) => {
    setDiagnostics((current) => reduceComponentChange(current, change));
  }, []);
  useHarnessMessages(onMessage);
  useHarnessComponentChanges(onComponentChange);
  const recordProbe = () => {
    const id = crypto.randomUUID();
    harness.fabric.publish({
      id,
      type: "harness.diagnostic",
      version: "0.1.0",
      source: { component: "web-shell" },
      correlationId: id,
      timestamp: new Date().toISOString(),
      payload: {
        diagnostics: [
          {
            code: "web.shell.pending",
            message: `${definition.id} has no domain plugin installed yet.`,
            token: "never-render-this",
          },
        ],
      },
    });
    const documentMessageId = crypto.randomUUID();
    harness.fabric.publish({
      id: documentMessageId,
      type: "visualization.seqviewspec.request",
      version: "0.1.0",
      source: { component: "web-shell" },
      correlationId: documentMessageId,
      timestamp: new Date().toISOString(),
      payload: {
        format: "seqviewspec",
        requestId: `diagnostic-probe-${definition.id}`,
        mode: "replace",
        document: { id: "intentionally-invalid-probe", token: "never-render-this" },
      },
    });
  };
  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-6 py-10" data-testid={`case-${definition.id}`}>
      <section className="max-w-3xl">
        <p className="font-semibold text-sky-700 text-sm uppercase tracking-[0.16em]">Case study</p>
        <h1 className="mt-2 font-bold text-3xl text-slate-950">{definition.title}</h1>
        <p className="mt-3 text-lg text-slate-600 leading-8">{definition.story}</p>
        <p className="mt-4 rounded border border-sky-100 bg-sky-50 p-3 text-slate-700 text-sm">
          {definition.instructions}
        </p>
      </section>
      <p className="text-slate-500 text-sm" data-testid="page-harness-status">
        Page harness status: {status}
      </p>
      <div className="grid gap-5 lg:grid-cols-2">
        {definition.panels.map((panel) => (
          <VisualizerPanel key={panel.id} panel={panel} />
        ))}
      </div>
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-slate-600 text-sm">
          Fixture provenance and real generated documents will replace the explicit invalid
          diagnostics probe as integration packets land.
        </p>
        <button
          className="rounded bg-sky-700 px-3 py-2 font-medium text-sm text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
          onClick={recordProbe}
          type="button"
        >
          Record diagnostics probe
        </button>
        <button
          className="rounded border border-slate-400 px-3 py-2 font-medium text-sm text-slate-700"
          onClick={simulateStartupFailure}
          type="button"
        >
          Test harness startup recovery
        </button>
      </section>
      <DiagnosticsDrawer state={diagnostics} />
    </main>
  );
}

export function PendingCasePage({ definition }: { readonly definition: PendingCase }) {
  const definitionRef = useRef(definition);
  const failNextStart = useRef(false);
  const [factoryGeneration, setFactoryGeneration] = useState(0);
  const createHarness = useCallback(
    ({ hosts }: { readonly hosts: HarnessHostRegistry }) => {
      if (failNextStart.current) {
        failNextStart.current = false;
        throw new Error(`Unable to construct page harness '${definitionRef.current.id}'.`);
      }
      return createPageHarness(definitionRef.current, hosts);
    },
    // A generation change intentionally replaces the page-scoped harness.
    [factoryGeneration],
  );
  const simulateStartupFailure = useCallback(() => {
    failNextStart.current = true;
    setFactoryGeneration((value) => value + 1);
  }, []);
  const onDisposeStart = useCallback(({ hosts }: { readonly hosts: HarnessHostRegistry }) => {
    for (const host of hosts.entries())
      window.dispatchEvent(
        new CustomEvent("seqstar:harness-dispose", {
          detail: { componentId: host.id, hostConnected: host.element.isConnected },
        }),
      );
  }, []);
  return (
    <HarnessProvider
      createHarness={createHarness}
      fallback={
        <main className="mx-auto max-w-6xl px-6 py-10" data-testid={`case-${definition.id}`}>
          <p role="status">Creating page harness…</p>
        </main>
      }
      onDisposeStart={onDisposeStart}
    >
      <PendingCaseContent definition={definition} simulateStartupFailure={simulateStartupFailure} />
    </HarnessProvider>
  );
}

export type { PendingCase };
