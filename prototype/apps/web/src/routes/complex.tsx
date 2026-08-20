import { createApplicationHarness } from "@seq-star/harness-core";
import { HarnessProvider, useHarness, useHarnessHost } from "@seq-star/harness-react";
import { createComplexPlugin } from "@seq-star/integration-plugins";
import { createMolstarWrapperFactory } from "@seq-star/wrapper-molstar";
import { createReferenceViewerWrapperFactory } from "@seq-star/wrapper-seq-viewer";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import confidenceTsv from "../../../../fixtures/complex/expected/synthetic-confidence.tsv?raw";
import structureUrl from "../../../../fixtures/complex/input/1BRS.cif?url";
import barnaseFasta from "../../../../fixtures/complex/input/P00648.fasta?raw";
import barstarFasta from "../../../../fixtures/complex/input/P11540.fasta?raw";
import contactsTsv from "../../../../fixtures/complex/mappings/1BRS-chain-A-D-heavy-atom-contacts.tsv?raw";
import barnaseMappingTsv from "../../../../fixtures/complex/mappings/P00648-1BRS-chain-A.tsv?raw";
import barstarMappingTsv from "../../../../fixtures/complex/mappings/P11540-1BRS-chain-D.tsv?raw";
import { InspectPanel, useInspectPanelState } from "../inspect-panel";

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
  const inspect = useInspectPanelState({ sequenceComponent, structureComponent });
  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-6 py-8" data-testid="case-complex">
      <section>
        <p className="font-medium text-sky-700 text-sm uppercase tracking-[0.16em]">Case study 3</p>
        <h1 className="mt-2 font-bold text-3xl text-slate-950">Barnase–barstar complex</h1>
        <p className="mt-3 max-w-4xl text-lg text-slate-600">
          An explicit two-polymer assembly: barnase P00648 / chain A and barstar P11540 / chain D.
          The visible gap separates coordinate spaces and cannot select a fabricated biological
          position. Hover residues to reflect an exact chain locus; select a contact to focus both
          named endpoints.
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
      <section className="grid gap-3 rounded-lg border border-sky-200 bg-sky-50 p-4 text-slate-700">
        <h2 className="font-semibold text-slate-950 text-lg">Track profiles and navigation</h2>
        <p className="text-sm">
          Track headers replace the lifecycle-bound MVS profile: named polymers → neutral, regions →
          regions, synthetic confidence → confidence, interface → interface, contacts → contacts.
          The sequence navigation band supports wheel/drag and keyboard pan, zoom, and reset.
        </p>
        <p className="text-xs">
          Frozen source transforms: 19 barnase interface residues, 16 barstar interface residues,
          and 43 contacts; barstar C41A/C83A remain explicit construct conflicts.
        </p>
      </section>
      <section data-testid="inspect-panel-container">
        <InspectPanel state={inspect} />
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
