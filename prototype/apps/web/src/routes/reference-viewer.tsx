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
import { Eraser, Send } from "lucide-react";
import { useCallback, useState } from "react";
import { VisualizationCard } from "../components/presentation";

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
      <section className="page-intro">
        <p className="page-intro__eyebrow">Reference sequence viewer lab</p>
        <h1 className="page-intro__title">Reference sequence viewer</h1>
        <p className="page-intro__description">
          This deliberately small, offline route exercises one page-scoped harness and one wrapper.
          Hover or select residues, then use the checked relationship row to inspect all endpoint
          loci. The navigation band emits its serializable viewport descriptor; external controls
          target this one owner only.
        </p>
      </section>
      <VisualizationCard
        className="visualization-card--flush"
        title="Targeted external owner command"
        description="Publish typed highlight commands to this viewer without creating native events or synchronizing another visualizer."
      >
        <div className="p-4">
          <p className="sr-only">
            These diagnostics publish typed highlight commands directly to this single viewer. They
            do not create native events or synchronize another visualizer.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className="icon-button-with-label"
              data-testid="reference-viewer-apply-external"
              onClick={applyExternalHighlight}
              type="button"
            >
              <Send aria-hidden="true" size={15} />
              Apply external highlight
            </button>
            <button
              className="icon-button-with-label"
              data-testid="reference-viewer-clear-external"
              disabled={externalOwner === undefined}
              onClick={clearExternalHighlight}
              type="button"
            >
              <Eraser aria-hidden="true" size={15} />
              Clear external highlight
            </button>
          </div>
          <output
            className="font-mono text-xs text-slate-700"
            data-testid="reference-viewer-external"
          >
            {externalOwner === undefined ? "no external owner active" : "external owner active"}
          </output>
        </div>
      </VisualizationCard>
      <VisualizationCard
        className="visualization-card--flush"
        title="Reference viewer"
        description="Interact with residues, relationship endpoints, and the shared navigation viewport."
        data-testid="visualizer-panel-reference-viewer-diagnostic"
      >
        <section
          aria-label="Seq* reference viewer canvas"
          className="viewer-host reference-diagnostic-host"
          data-testid="reference-viewer-host"
          ref={hostRef}
        />
        <p data-testid="reference-viewer-harness-status" hidden>
          Harness: {status}
        </p>
      </VisualizationCard>
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
