import { createApplicationHarness, type HarnessMessage } from "@seq-star/harness-core";
import {
  type ComponentInstanceSpec,
  HarnessProvider,
  useHarness,
  useHarnessHost,
  useHarnessMessages,
} from "@seq-star/harness-react";
import {
  createRendererPortabilityPlugin,
  rendererPortabilityDocument,
  rendererPortabilityDocumentDigest,
} from "@seq-star/integration-plugins";
import { createNightingaleWrapperFactory } from "@seq-star/wrapper-nightingale";
import { createReferenceViewerWrapperFactory } from "@seq-star/wrapper-seq-viewer";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CaseRendererChooser,
  type RendererMode,
  rendererSearch,
} from "../components/case-renderer-chooser";

const referenceId = "base-sequence";
const nightingaleId = "nightingale-sequence";

const rendererModes = [
  "compare",
  "reference",
  "nightingale",
] as const satisfies readonly RendererMode[];
const rendererComponents = {
  reference: [{ id: referenceId, type: "seqstar.reference-viewer" }],
  nightingale: [{ id: nightingaleId, type: "seqstar.nightingale" }],
  compare: [
    { id: referenceId, type: "seqstar.reference-viewer" },
    { id: nightingaleId, type: "seqstar.nightingale" },
  ],
} as const satisfies Readonly<Record<RendererMode, readonly ComponentInstanceSpec[]>>;

const createPageHarness = (
  hosts: { readonly require: (id: string) => HTMLElement },
  _mode: RendererMode,
) =>
  createApplicationHarness(
    {
      id: "renderer-portability",
      // Both initial renderers establish one verified visible replay envelope.
      // The chooser detects this committed mode and transactionally retires the
      // inactive peer before exposing a deep-linked single-renderer mode.
      components: rendererComponents.compare,
      plugins: [{ id: "renderer-portability", plugin: "seqstar.renderer-portability" }],
      synchronization: [
        {
          id: "renderer-portability-hover",
          interaction: "hover",
          between: [referenceId, nightingaleId],
          unmapped: "clear",
        },
        {
          id: "renderer-portability-selection",
          interaction: "select",
          between: [referenceId, nightingaleId],
          unmapped: "preserve",
        },
      ],
    },
    {
      componentFactories: [
        createReferenceViewerWrapperFactory({ getHost: (id) => hosts.require(id) }),
        createNightingaleWrapperFactory({ getHost: (id) => hosts.require(id) }),
      ],
      pluginFactories: [
        {
          plugin: "seqstar.renderer-portability",
          create: () =>
            createRendererPortabilityPlugin({
              referenceComponent: referenceId,
              nightingaleComponent: nightingaleId,
            }),
        },
      ],
    },
  );

type Lifecycle = {
  readonly componentId: string;
  readonly requestId: string;
  readonly status: string;
  readonly visibleRequestId?: string;
  readonly diagnostics?: readonly { readonly code?: string; readonly message?: string }[];
};
const lifecycle = (message: HarnessMessage): Lifecycle | undefined => {
  if (message.type !== "lifecycle.visualization") return undefined;
  const value = message.payload as Partial<Lifecycle>;
  return typeof value.componentId === "string" &&
    typeof value.requestId === "string" &&
    typeof value.status === "string"
    ? (value as Lifecycle)
    : undefined;
};

function RendererPanel({
  id,
  title,
  hidden = false,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly hidden?: boolean;
  readonly children?: React.ReactNode;
}) {
  const host = useHarnessHost(id);
  const panelTestId = id === referenceId ? "reference-viewer" : "nightingale";
  return (
    <section
      className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
      data-testid={`visualizer-panel-${panelTestId}`}
      hidden={hidden}
    >
      <h2 className="font-semibold text-slate-950 text-xl">{title}</h2>
      <section
        aria-label={`${title} renderer`}
        className="relative mt-4 h-72 overflow-auto rounded border border-slate-200 p-2"
        data-testid={`${id}-host`}
        ref={host}
      />
      {children}
    </section>
  );
}

function RendererPortabilityContent({
  initialMode,
  onModeChange,
}: {
  readonly initialMode: RendererMode;
  readonly onModeChange: (mode: RendererMode) => void;
}) {
  const { status } = useHarness();
  const [digest, setDigest] = useState("Computing RFC 8785 digest…");
  const [events, setEvents] = useState<readonly Lifecycle[]>([]);
  useEffect(() => {
    void rendererPortabilityDocumentDigest().then(setDigest);
  }, []);
  useHarnessMessages(
    useCallback((message: HarnessMessage) => {
      const value = lifecycle(message);
      if (
        value !== undefined &&
        (value.componentId === referenceId || value.componentId === nightingaleId)
      )
        setEvents((current) =>
          [
            ...current.filter(
              (entry) =>
                !(entry.componentId === value.componentId && entry.requestId === value.requestId),
            ),
            value,
          ].slice(-8),
        );
    }, []),
  );
  const byComponent = new Map(events.map((event) => [event.componentId, event]));
  return (
    <main
      className="mx-auto grid max-w-7xl gap-6 px-6 py-8"
      data-testid="case-renderer-portability"
    >
      <section className="max-w-4xl">
        <p className="font-medium text-sky-700 text-sm uppercase tracking-[0.16em]">Case study 1</p>
        <h1 className="mt-2 font-bold text-3xl text-slate-950">Renderer portability</h1>
        <p className="mt-3 text-lg text-slate-600">
          One checked-in UniProt TP53 P04637 SeqViewSpec request drives the independent Seq* and
          vendored Nightingale renderers. Hover or select either view to exercise harness-mediated
          identity translation and reflection.
        </p>
      </section>
      <section
        className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-slate-700"
        data-testid="renderer-portability-document"
      >
        <p>
          <strong>Document:</strong>{" "}
          <span data-testid="renderer-document-id">{rendererPortabilityDocument.id}</span>
        </p>
        <p className="mt-1 break-all">
          <strong>Digest:</strong> <span data-testid="renderer-document-digest">{digest}</span>
        </p>
        <p className="mt-1">
          <strong>Harness:</strong> {status}. The same immutable payload is independently targeted
          to both components.
        </p>
      </section>
      <CaseRendererChooser
        descriptor={{ caseId: "renderer-portability", modes: rendererModes, initialMode }}
        modeComponents={rendererComponents}
        onModeChange={onModeChange}
      >
        {(chooser) => (
          <div className="grid gap-5 xl:grid-cols-2">
            <RendererPanel
              hidden={!chooser.mountedComponentIds.includes(referenceId)}
              id={referenceId}
              title="Seq* reference viewer"
            >
              <p className="mt-3 text-slate-600 text-sm" data-testid="base-sequence-lifecycle">
                {byComponent.get(referenceId)?.status ?? "awaiting lifecycle"}
              </p>
            </RendererPanel>
            <RendererPanel
              hidden={!chooser.mountedComponentIds.includes(nightingaleId)}
              id={nightingaleId}
              title="Vendored Nightingale"
            >
              <p
                className="mt-3 text-slate-600 text-sm"
                data-testid="nightingale-sequence-lifecycle"
              >
                {byComponent.get(nightingaleId)?.status ?? "awaiting lifecycle"}
              </p>
              <p className="mt-1 text-amber-700 text-xs" data-testid="nightingale-fallback-status">
                {byComponent
                  .get(nightingaleId)
                  ?.diagnostics?.map((entry) => entry.code)
                  .filter(Boolean)
                  .join(", ") ?? "awaiting fallback report"}
              </p>
            </RendererPanel>
          </div>
        )}
      </CaseRendererChooser>
      <section
        className="rounded-lg bg-slate-950 p-5 text-slate-100"
        data-testid="renderer-portability-capabilities"
      >
        <h2 className="font-semibold text-lg">Capability and fallback comparison</h2>
        <p className="mt-2 text-slate-300 text-sm">
          The reference viewer supports every core representation. This Nightingale subset renders
          sequence, blocks, markers, heatmap, and swatch exactly. This document declares a
          bars-to-heatmap fallback that preserves its per-value color encoding. Links require an
          explicit marker/block fallback, while unsupported layers without a compatible declared
          fallback reject the replacement instead of being silently omitted.
        </p>
        <ul
          className="mt-3 grid gap-1 text-slate-300 text-sm"
          data-testid="renderer-portability-lifecycle"
        >
          {events.map((event) => (
            <li key={`${event.componentId}:${event.requestId}`}>
              {event.componentId}: {event.requestId} — {event.status}
              {event.visibleRequestId === undefined ? "" : ` (visible ${event.visibleRequestId})`}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function RendererPortabilityPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const initialMode = rendererSearch(search.renderer, rendererModes, "compare");
  const mountedMode = useRef(initialMode).current;
  const createHarness = useCallback(
    ({ hosts }: { readonly hosts: { readonly require: (id: string) => HTMLElement } }) =>
      createPageHarness(hosts, mountedMode),
    [mountedMode],
  );
  return (
    <HarnessProvider
      createHarness={createHarness}
      fallback={<main className="p-8">Starting renderer portability case…</main>}
    >
      <RendererPortabilityContent
        initialMode={initialMode}
        onModeChange={(renderer) => void navigate({ search: { renderer } })}
      />
    </HarnessProvider>
  );
}

export const Route = createFileRoute("/renderer-portability")({
  validateSearch: (search: Record<string, unknown>) => ({ renderer: search.renderer }),
  component: RendererPortabilityPage,
});
