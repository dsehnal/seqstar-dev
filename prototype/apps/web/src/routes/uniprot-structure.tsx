import { createApplicationHarness, type HarnessMessage } from "@seq-star/harness-core";
import {
  HarnessProvider,
  useHarness,
  useHarnessHost,
  useHarnessMessages,
} from "@seq-star/harness-react";
import {
  createUniProtStructurePlugin,
  type UniProtMvsGeneration,
} from "@seq-star/integration-plugins";
import { createMolstarWrapperFactory } from "@seq-star/wrapper-molstar";
import { createNightingaleWrapperFactory } from "@seq-star/wrapper-nightingale";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import structureUrl from "../../../../fixtures/uniprot-structure/input/1TUP.cif?url";
import mappingTsv from "../../../../fixtures/uniprot-structure/mappings/P04637-1TUP-chain-A.tsv?raw";

const sequenceComponent = "uniprot-tracks";
const structureComponent = "structure-view";

const createPageHarness = (hosts: { readonly require: (id: string) => HTMLElement }) =>
  createApplicationHarness(
    {
      id: "uniprot-structure",
      components: [
        { id: sequenceComponent, type: "seqstar.nightingale" },
        { id: structureComponent, type: "seqstar.molstar-mvs" },
      ],
      plugins: [{ id: "uniprot-mvs", plugin: "seqstar.uniprot-mvs" }],
      synchronization: [
        {
          id: "P04637-1TUP-hover",
          interaction: "hover",
          between: [sequenceComponent, structureComponent],
          unmapped: "clear",
        },
        {
          id: "P04637-1TUP-selection",
          interaction: "select",
          between: [sequenceComponent, structureComponent],
          unmapped: "preserve",
        },
      ],
    },
    {
      componentFactories: [
        createNightingaleWrapperFactory({ getHost: (id) => hosts.require(id) }),
        createMolstarWrapperFactory({ getHost: (id) => hosts.require(id) }),
      ],
      pluginFactories: [
        {
          plugin: "seqstar.uniprot-mvs",
          create: () =>
            createUniProtStructurePlugin({
              sequenceComponent,
              structureComponent,
              mappingTsv,
              structureUrl,
            }),
        },
      ],
    },
  );

function ViewerPanel({ id, title }: { readonly id: string; readonly title: string }) {
  const host = useHarnessHost(id);
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-slate-950 text-xl">{title}</h2>
      <section
        aria-label={`${title} visualizer`}
        className="relative mt-3 h-96 overflow-auto rounded border border-slate-200"
        data-testid={`${id}-host`}
        ref={host}
      />
    </section>
  );
}

function UniProtStructureContent() {
  const { status } = useHarness();
  const [lastGenerated, setLastGenerated] = useState<UniProtMvsGeneration>();
  const [events, setEvents] = useState<readonly string[]>([]);
  const [lifecycles, setLifecycles] = useState<Readonly<Record<string, string>>>({});
  useHarnessMessages(
    useCallback((message: HarnessMessage) => {
      if (message.type === "document.generated.mvs")
        setLastGenerated(message.payload as unknown as UniProtMvsGeneration);
      if (message.type === "lifecycle.visualization") {
        const value = message.payload as { requestId?: string; status?: string };
        if (value.requestId !== undefined && value.status !== undefined)
          setLifecycles((current) => ({
            ...current,
            [value.requestId as string]: value.status as string,
          }));
      }
      if (message.type === "document.generated.mvs" || message.type === "visualization.mvs.request")
        setEvents((current) => [...current, message.type].slice(-8));
    }, []),
  );
  const download = () => {
    if (lastGenerated === undefined) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(lastGenerated.document, null, 2)], {
        type: "application/vnd.molstar.mvsj+json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${lastGenerated.requestId}.mvsj`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-6 py-8" data-testid="case-uniprot-structure">
      <section>
        <p className="font-medium text-sky-700 text-sm uppercase tracking-[0.16em]">Case study 2</p>
        <h1 className="mt-2 font-bold text-3xl text-slate-950">
          UniProt annotations and structure
        </h1>
        <p className="mt-3 max-w-4xl text-lg text-slate-600">
          The checked P04637 annotation document and local 1TUP mmCIF are connected through the
          harness translator registry. Activations create complete validated MVS requests; Mol*
          contains no UniProt-specific code.
        </p>
        <p className="mt-2 text-slate-500 text-sm" data-testid="p41-harness-status">
          Harness: {status} · no runtime network required
        </p>
      </section>
      <p className="rounded border border-sky-200 bg-sky-50 p-3 text-slate-700 text-sm">
        Use a Nightingale track-label button to generate the corresponding structure view.
      </p>
      <div className="grid gap-5 xl:grid-cols-2">
        <ViewerPanel id={sequenceComponent} title="UniProt P04637 tracks" />
        <ViewerPanel id={structureComponent} title="Mol* / MolViewSpec" />
      </div>
      <section
        className="grid gap-4 rounded-lg bg-slate-950 p-5 text-slate-100"
        data-testid="p41-mvs-inspector"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-lg">Generated MVS and mapping summary</h2>
            <p className="text-slate-300 text-sm" data-testid="p41-request-id">
              {lastGenerated?.requestId ?? "Activate an annotation track to generate a request."}
            </p>
            <p className="text-slate-300 text-sm" data-testid="p41-generated-lifecycle">
              {lastGenerated === undefined
                ? "No generated request"
                : (lifecycles[lastGenerated.requestId] ?? "awaiting lifecycle")}
            </p>
          </div>
          <button
            className="rounded border border-slate-500 px-3 py-2 text-sm disabled:opacity-50"
            disabled={lastGenerated === undefined}
            onClick={download}
            type="button"
          >
            Download validated MVSJ
          </button>
        </div>
        {lastGenerated === undefined ? null : (
          <>
            <p className="text-sm" data-testid="p41-mapping-counts">
              mapped {lastGenerated.counts.mapped} · partial {lastGenerated.counts.partial} ·
              ambiguous {lastGenerated.counts.ambiguous} · unmapped {lastGenerated.counts.unmapped}
            </p>
            <ul className="grid gap-1 text-slate-300 text-xs" data-testid="p41-item-summary">
              {lastGenerated.mapping.map((item) => (
                <li key={item.itemId}>
                  {item.itemId}: {item.status} · {item.selectors.length} residues · {item.color}
                </li>
              ))}
            </ul>
            <pre
              className="max-h-80 overflow-auto rounded bg-black/30 p-3 text-xs"
              data-testid="p41-mvs-json"
            >
              {JSON.stringify(lastGenerated.document, null, 2)}
            </pre>
          </>
        )}
        <p className="text-slate-400 text-xs" data-testid="p41-message-order">
          {events.join(" → ")}
        </p>
      </section>
    </main>
  );
}

function UniProtStructurePage() {
  const createHarness = useCallback(
    ({ hosts }: { readonly hosts: { readonly require: (id: string) => HTMLElement } }) =>
      createPageHarness(hosts),
    [],
  );
  return (
    <HarnessProvider
      createHarness={createHarness}
      fallback={<main className="p-8">Starting offline P04637 / 1TUP case…</main>}
    >
      <UniProtStructureContent />
    </HarnessProvider>
  );
}

export const Route = createFileRoute("/uniprot-structure")({ component: UniProtStructurePage });
