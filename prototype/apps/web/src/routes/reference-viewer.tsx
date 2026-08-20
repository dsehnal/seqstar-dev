import { createApplicationHarness, type HarnessMessage } from "@seq-star/harness-core";
import {
  HarnessProvider,
  useHarness,
  useHarnessHost,
  useHarnessMessages,
} from "@seq-star/harness-react";
import {
  createCheckedFixtureProvider,
  createCheckedFixtureProviderPlugin,
  referenceViewerDiagnosticFixture,
} from "@seq-star/integration-plugins";
import { createReferenceViewerWrapperFactory } from "@seq-star/wrapper-seq-viewer";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";

const fixtures = createCheckedFixtureProvider([referenceViewerDiagnosticFixture]);

const createPageHarness = (hosts: { readonly require: (id: string) => HTMLElement }) =>
  createApplicationHarness(
    {
      id: "reference-viewer-diagnostic",
      components: [{ id: "reference-viewer", type: "seqstar.reference-viewer" }],
      plugins: [{ id: "reference-fixture", plugin: "seqstar.fixture-provider" }],
    },
    {
      componentFactories: [
        createReferenceViewerWrapperFactory({ getHost: (id) => hosts.require(id) }),
      ],
      pluginFactories: [
        {
          plugin: "seqstar.fixture-provider",
          create: () =>
            createCheckedFixtureProviderPlugin(fixtures, {
              fixtureId: "reference-viewer-diagnostic",
              targetComponent: "reference-viewer",
              messageId: "e56f6535-ca7d-4d1d-8d30-64b3429ce5e7",
              correlationId: "a9567c3f-0557-4a5c-ae78-cb606eb8d4c1",
              timestamp: "2026-08-20T00:00:00.000Z",
            }),
        },
      ],
    },
  );

const lifecycleText = (message: HarnessMessage): string | undefined => {
  if (message.type !== "lifecycle.visualization") return undefined;
  const payload = message.payload as {
    readonly componentId?: unknown;
    readonly requestId?: unknown;
    readonly status?: unknown;
  };
  if (
    payload.componentId !== "reference-viewer" ||
    typeof payload.requestId !== "string" ||
    typeof payload.status !== "string"
  )
    return undefined;
  return `${payload.requestId}: ${payload.status}`;
};

type NativeDiagnostic = {
  readonly interaction: string;
  readonly phase: string;
  readonly semanticTarget: string;
  readonly loci: string;
  readonly viewport: string;
};

const nativeDiagnostic = (message: HarnessMessage): NativeDiagnostic | undefined => {
  if (message.type !== "interaction.native" || message.source.component !== "reference-viewer")
    return undefined;
  const payload = message.payload as {
    readonly interaction?: unknown;
    readonly phase?: unknown;
    readonly semanticTarget?: unknown;
    readonly loci?: unknown;
    readonly viewport?: unknown;
  };
  if (typeof payload.interaction !== "string" || !Array.isArray(payload.loci)) return undefined;
  return {
    interaction: payload.interaction,
    phase: typeof payload.phase === "string" ? payload.phase : "set",
    semanticTarget: JSON.stringify(payload.semanticTarget ?? null),
    loci: JSON.stringify(payload.loci),
    viewport: JSON.stringify(payload.viewport ?? null),
  };
};

function ReferenceViewerContent() {
  const hostRef = useHarnessHost("reference-viewer");
  const { harness, status } = useHarness();
  const [events, setEvents] = useState<readonly string[]>([]);
  const [nativeEvents, setNativeEvents] = useState<readonly string[]>([]);
  const [hover, setHover] = useState<NativeDiagnostic>();
  const [selection, setSelection] = useState<NativeDiagnostic>();
  const [viewport, setViewport] = useState<NativeDiagnostic>();
  const [externalOwner, setExternalOwner] = useState<
    { readonly correlationId: string; readonly interactionId: string } | undefined
  >();
  useHarnessMessages(
    useCallback((message: HarnessMessage) => {
      const text = lifecycleText(message);
      if (text !== undefined) setEvents((current) => [...current.slice(-7), text]);
      const native = nativeDiagnostic(message);
      if (native)
        setNativeEvents((current) => [
          ...current.slice(-7),
          `${native.interaction}:${native.phase}:${native.semanticTarget}:${native.loci}`,
        ]);
      if (native?.interaction === "hover") setHover(native);
      if (native?.interaction === "select") setSelection(native);
      if (native?.interaction === "viewport") setViewport(native);
    }, []),
  );
  const applyExternalHighlight = () => {
    const correlationId = crypto.randomUUID();
    const interactionId = crypto.randomUUID();
    harness.fabric.publish({
      id: crypto.randomUUID(),
      type: "interaction.highlight.apply",
      version: "0.1.0",
      source: { component: "reference-diagnostic-controls" },
      target: { component: "reference-viewer" },
      correlationId,
      timestamp: new Date().toISOString(),
      payload: {
        interactionId,
        owner: { correlationId, sourceComponent: "reference-diagnostic-controls" },
        mode: "replace",
        loci: [
          {
            kind: "point",
            space: { id: "diagnostic-protein-space", kind: "sequence", length: 37 },
            position: { kind: "index", value: 12 },
          },
        ],
        semanticTarget: { annotationId: "diagnostic-sites", itemId: "site-1" },
      },
    } satisfies HarnessMessage<"interaction.highlight.apply">);
    setExternalOwner({ correlationId, interactionId });
  };
  const clearExternalHighlight = () => {
    if (externalOwner === undefined) return;
    harness.fabric.publish({
      id: crypto.randomUUID(),
      type: "interaction.highlight.clear",
      version: "0.1.0",
      source: { component: "reference-diagnostic-controls" },
      target: { component: "reference-viewer" },
      correlationId: externalOwner.correlationId,
      timestamp: new Date().toISOString(),
      payload: {
        interactionId: externalOwner.interactionId,
        owner: {
          correlationId: externalOwner.correlationId,
          sourceComponent: "reference-diagnostic-controls",
        },
      },
    } satisfies HarnessMessage<"interaction.highlight.clear">);
    setExternalOwner(undefined);
  };
  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8">
      <section>
        <p className="font-medium text-sky-700 text-sm">P22 diagnostic route</p>
        <h1 className="mt-1 font-semibold text-3xl text-slate-950">Seq* reference viewer</h1>
        <p className="mt-3 max-w-3xl text-slate-600">
          This deliberately small, offline route exercises one page-scoped harness and one wrapper.
          Hover or select residues, then use the checked relationship row to inspect all endpoint
          loci. The navigation band emits its serializable viewport descriptor; external controls
          target this one owner only.
        </p>
      </section>
      <section className="grid gap-3 rounded-lg border border-sky-200 bg-sky-50 p-5">
        <div>
          <h2 className="font-semibold text-slate-950 text-lg">Targeted external owner command</h2>
          <p className="mt-1 text-slate-600 text-sm">
            These diagnostics publish typed highlight commands directly to this single viewer. They
            do not create native events or synchronize another visualizer.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="rounded bg-sky-700 px-3 py-2 font-medium text-sm text-white"
            data-testid="reference-viewer-apply-external"
            onClick={applyExternalHighlight}
            type="button"
          >
            Apply external highlight
          </button>
          <button
            className="rounded border border-sky-700 px-3 py-2 font-medium text-sky-900 text-sm disabled:opacity-50"
            data-testid="reference-viewer-clear-external"
            disabled={externalOwner === undefined}
            onClick={clearExternalHighlight}
            type="button"
          >
            Clear external highlight
          </button>
        </div>
        <output
          className="font-mono text-xs text-slate-700"
          data-testid="reference-viewer-external"
        >
          {externalOwner === undefined ? "no external owner active" : "external owner active"}
        </output>
      </section>
      <section
        aria-labelledby="reference-viewer-heading"
        className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        data-testid="visualizer-panel-reference-viewer-diagnostic"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-950 text-xl" id="reference-viewer-heading">
            Reference viewer
          </h2>
        </div>
        <section
          aria-label="Seq* reference viewer canvas"
          className="mt-4 h-72 overflow-hidden rounded border border-slate-200"
          data-testid="reference-viewer-host"
          ref={hostRef}
        />
        <p className="mt-3 text-slate-600 text-sm" data-testid="reference-viewer-harness-status">
          Harness: {status}
        </p>
      </section>
      <section
        aria-labelledby="reference-native-diagnostics-heading"
        className="grid gap-3 rounded-lg bg-slate-950 p-5 text-slate-100"
      >
        <h2 className="font-semibold text-lg" id="reference-native-diagnostics-heading">
          Native interaction conformance
        </h2>
        <p className="text-slate-300 text-sm">
          Local canvas state appears immediately; this read-only log exposes its semantic target and
          JSON-safe loci after the wrapper publishes the native event.
        </p>
        <dl className="grid gap-3 text-xs">
          <div>
            <dt className="font-medium text-slate-200">Native event stream</dt>
            <dd
              className="mt-1 break-all text-slate-300"
              data-testid="reference-viewer-native-events"
            >
              {nativeEvents.length === 0 ? "Awaiting native events." : nativeEvents.join("\n")}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-200">Hover</dt>
            <dd className="mt-1 break-all text-slate-300" data-testid="reference-viewer-hover">
              {hover === undefined ? "Awaiting local hover." : JSON.stringify(hover)}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-200">Selection / relationship endpoints</dt>
            <dd className="mt-1 break-all text-slate-300" data-testid="reference-viewer-selection">
              {selection === undefined ? "Awaiting local selection." : JSON.stringify(selection)}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-200">Viewport descriptor</dt>
            <dd className="mt-1 break-all text-slate-300" data-testid="reference-viewer-viewport">
              {viewport === undefined ? "Awaiting navigation." : viewport.viewport}
            </dd>
          </div>
        </dl>
      </section>
      <section
        aria-labelledby="reference-diagnostics-heading"
        className="rounded-lg bg-slate-950 p-5 text-slate-100"
      >
        <h2 className="font-semibold text-lg" id="reference-diagnostics-heading">
          Lifecycle diagnostics
        </h2>
        <ol
          className="mt-3 list-inside list-decimal text-slate-300 text-sm"
          data-testid="reference-viewer-lifecycle"
        >
          {events.length === 0 ? (
            <li>Awaiting lifecycle messages.</li>
          ) : (
            events.map((event, index) => <li key={`${event}-${index}`}>{event}</li>)
          )}
        </ol>
      </section>
    </main>
  );
}

function ReferenceViewerPage() {
  const createHarness = useCallback(
    ({ hosts }: { readonly hosts: { readonly require: (id: string) => HTMLElement } }) =>
      createPageHarness(hosts),
    [],
  );
  return (
    <HarnessProvider
      createHarness={createHarness}
      fallback={<main className="p-8">Starting reference viewer…</main>}
    >
      <ReferenceViewerContent />
    </HarnessProvider>
  );
}

export const Route = createFileRoute("/reference-viewer")({ component: ReferenceViewerPage });
