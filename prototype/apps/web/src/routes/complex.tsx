import { createApplicationHarness, type HarnessMessage } from "@seq-star/harness-core";
import {
  HarnessProvider,
  useHarness,
  useHarnessHost,
  useHarnessMessages,
} from "@seq-star/harness-react";
import { type ComplexMvsGeneration, createComplexPlugin } from "@seq-star/integration-plugins";
import { createMolstarWrapperFactory } from "@seq-star/wrapper-molstar";
import { createReferenceViewerWrapperFactory } from "@seq-star/wrapper-seq-viewer";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import confidenceTsv from "../../../../fixtures/complex/expected/synthetic-confidence.tsv?raw";
import structureUrl from "../../../../fixtures/complex/input/1BRS.cif?url";
import barnaseFasta from "../../../../fixtures/complex/input/P00648.fasta?raw";
import barstarFasta from "../../../../fixtures/complex/input/P11540.fasta?raw";
import contactsTsv from "../../../../fixtures/complex/mappings/1BRS-chain-A-D-heavy-atom-contacts.tsv?raw";
import barnaseMappingTsv from "../../../../fixtures/complex/mappings/P00648-1BRS-chain-A.tsv?raw";
import barstarMappingTsv from "../../../../fixtures/complex/mappings/P11540-1BRS-chain-D.tsv?raw";

const sequenceComponent = "complex-sequence";
const structureComponent = "complex-structure";
const fasta = (source: string) => source.split(/\r?\n/u).slice(1).join("").trim();

const createPageHarness = (hosts: { readonly require: (id: string) => HTMLElement }) =>
  createApplicationHarness(
    {
      id: "complex",
      components: [
        { id: sequenceComponent, type: "seqstar.reference-viewer" },
        { id: structureComponent, type: "seqstar.molstar-mvs" },
      ],
      plugins: [{ id: "complex-mvs", plugin: "seqstar.complex-mvs" }],
      synchronization: [
        {
          id: "complex-hover",
          interaction: "hover",
          between: [sequenceComponent, structureComponent],
          unmapped: "clear",
        },
        {
          id: "complex-select",
          interaction: "select",
          between: [sequenceComponent, structureComponent],
          unmapped: "preserve",
        },
      ],
    },
    {
      componentFactories: [
        createReferenceViewerWrapperFactory({ getHost: (id) => hosts.require(id) }),
        createMolstarWrapperFactory({ getHost: (id) => hosts.require(id) }),
      ],
      pluginFactories: [
        {
          plugin: "seqstar.complex-mvs",
          create: () =>
            createComplexPlugin({
              sequenceComponent,
              structureComponent,
              barnaseMappingTsv,
              barstarMappingTsv,
              contactsTsv,
              confidenceTsv,
              barnaseResidues: fasta(barnaseFasta),
              barstarResidues: fasta(barstarFasta),
              structureUrl,
            }),
        },
      ],
    },
  );

function Panel({ id, title }: { readonly id: string; readonly title: string }) {
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

function ComplexContent() {
  const { status } = useHarness();
  const [generated, setGenerated] = useState<ComplexMvsGeneration>();
  const [lifecycle, setLifecycle] = useState("awaiting activation");
  useHarnessMessages(
    useCallback(
      (event: HarnessMessage) => {
        if (event.type === "document.generated.mvs")
          setGenerated(event.payload as unknown as ComplexMvsGeneration);
        if (event.type === "lifecycle.visualization") {
          const value = event.payload as { requestId?: string; status?: string };
          if (
            value.requestId !== undefined &&
            value.requestId === generated?.requestId &&
            value.status !== undefined
          )
            setLifecycle(value.status);
        }
      },
      [generated?.requestId],
    ),
  );
  const download = () => {
    if (generated === undefined) return;
    const href = URL.createObjectURL(
      new Blob([JSON.stringify(generated.document, null, 2)], {
        type: "application/vnd.molstar.mvsj+json",
      }),
    );
    const link = document.createElement("a");
    link.href = href;
    link.download = `${generated.requestId}.mvsj`;
    link.click();
    URL.revokeObjectURL(href);
  };
  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-6 py-8" data-testid="case-complex">
      <section>
        <p className="font-medium text-sky-700 text-sm uppercase tracking-[0.16em]">Case study 3</p>
        <h1 className="mt-2 font-bold text-3xl text-slate-950">Barnase–barstar complex</h1>
        <p className="mt-3 max-w-4xl text-lg text-slate-600">
          An explicit two-polymer assembly: barnase P00648 / chain A and barstar P11540 / chain D.
          The gap separates coordinate spaces and cannot select a fabricated biological position.
        </p>
        <p className="mt-2 text-slate-500 text-sm" data-testid="p50-harness-status">
          Harness: {status} · local 1BRS fixture only
        </p>
      </section>
      <p
        className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-950 text-sm"
        data-testid="p50-synthetic-label"
      >
        Synthetic confidence — deterministic prototype values, not a biological prediction.
      </p>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel id={sequenceComponent} title="Named complex assembly" />
        <Panel id={structureComponent} title="Mol* / generated MVS" />
      </div>
      <section
        className="grid gap-3 rounded-lg bg-slate-950 p-5 text-slate-100"
        data-testid="p50-mvs-inspector"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-lg">MVS and frozen mapping summary</h2>
            <p className="text-slate-300 text-sm" data-testid="p50-request-id">
              {generated?.requestId ?? "Activate Interface residues or 43 frozen contacts."}
            </p>
            <p className="text-slate-300 text-sm" data-testid="p50-lifecycle">
              {lifecycle}
            </p>
          </div>
          <button
            className="rounded border border-slate-500 px-3 py-2 text-sm disabled:opacity-50"
            disabled={generated === undefined}
            onClick={download}
            type="button"
          >
            Download validated MVSJ
          </button>
        </div>
        {generated === undefined ? null : (
          <>
            <p className="text-slate-300 text-sm" data-testid="p50-role-summary">
              {generated.activation} · {generated.relationshipId ?? "43 contacts"} ·{" "}
              {generated.endpointRoles
                .map((endpoint) => `${endpoint.role}: ${endpoint.selectors.length}`)
                .join(" · ")}
            </p>
            <pre
              className="max-h-80 overflow-auto rounded bg-black/30 p-3 text-xs"
              data-testid="p50-mvs-json"
            >
              {JSON.stringify(generated.document, null, 2)}
            </pre>
          </>
        )}
        <p className="text-slate-400 text-xs">
          Frozen source transforms: 19 barnase interface residues, 16 barstar interface residues, 43
          contacts; barstar C41A/C83A remain explicit construct conflicts.
        </p>
      </section>
    </main>
  );
}

function ComplexPage() {
  const createHarness = useCallback(
    ({ hosts }: { readonly hosts: { readonly require: (id: string) => HTMLElement } }) =>
      createPageHarness(hosts),
    [],
  );
  return (
    <HarnessProvider
      createHarness={createHarness}
      fallback={<main className="p-8">Starting offline 1BRS complex…</main>}
    >
      <ComplexContent />
    </HarnessProvider>
  );
}

export const Route = createFileRoute("/complex")({ component: ComplexPage });
