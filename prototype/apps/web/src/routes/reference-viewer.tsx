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

function ReferenceViewerContent() {
  const hostRef = useHarnessHost("reference-viewer");
  const { status } = useHarness();
  const [events, setEvents] = useState<readonly string[]>([]);
  useHarnessMessages(
    useCallback((message: HarnessMessage) => {
      const text = lifecycleText(message);
      if (text !== undefined) setEvents((current) => [...current.slice(-7), text]);
    }, []),
  );
  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8">
      <section>
        <p className="font-medium text-sky-700 text-sm">P22 diagnostic route</p>
        <h1 className="mt-1 font-semibold text-3xl text-slate-950">Seq* reference viewer</h1>
        <p className="mt-3 max-w-3xl text-slate-600">
          This deliberately small, offline route exercises one page-scoped harness and one wrapper.
          Hover residues, select a locus, or activate a track header to inspect native wrapper
          events.
        </p>
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
