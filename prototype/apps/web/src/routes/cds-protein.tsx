import { createApplicationHarness, type HarnessMessage } from "@seq-star/harness-core";
import {
  HarnessProvider,
  useHarness,
  useHarnessHost,
  useHarnessMessages,
} from "@seq-star/harness-react";
import { createCdsProteinPlugin } from "@seq-star/integration-plugins";
import { createReferenceViewerWrapperFactory } from "@seq-star/wrapper-seq-viewer";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";

const nucleotideComponent = "cds-nucleotide-view";
const proteinComponent = "cds-protein-view";
const createPageHarness = (hosts: { readonly require: (id: string) => HTMLElement }) =>
  createApplicationHarness(
    {
      id: "cds-protein",
      components: [
        { id: nucleotideComponent, type: "seqstar.reference-viewer" },
        { id: proteinComponent, type: "seqstar.reference-viewer" },
      ],
      plugins: [{ id: "cds-protein", plugin: "seqstar.cds-protein" }],
      synchronization: [
        {
          id: "cds-hover",
          interaction: "hover",
          between: [nucleotideComponent, proteinComponent],
          unmapped: "clear",
        },
        {
          id: "cds-selection",
          interaction: "select",
          between: [nucleotideComponent, proteinComponent],
          unmapped: "preserve",
        },
      ],
    },
    {
      componentFactories: [
        createReferenceViewerWrapperFactory({ getHost: (id) => hosts.require(id) }),
      ],
      pluginFactories: [
        {
          plugin: "seqstar.cds-protein",
          create: () => createCdsProteinPlugin({ nucleotideComponent, proteinComponent }),
        },
      ],
    },
  );

function Panel({ id, title }: { readonly id: string; readonly title: string }) {
  const host = useHarnessHost(id);
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm sm:p-4">
      <h2 className="font-semibold text-slate-950 text-xl">{title}</h2>
      <section
        aria-label={title}
        className="mt-3 h-[22rem] min-h-0 w-full overflow-hidden rounded border border-slate-200"
        data-testid={`${id}-host`}
        ref={host}
      />
    </section>
  );
}
function Content() {
  const { status } = useHarness();
  const [mapping, setMapping] = useState<{
    direction?: string;
    status?: string;
    targetCount?: number;
    config?: {
      strand?: string;
      phase?: number;
      proteinOffset?: number;
      start?: number;
      end?: number;
    };
    diagnostics?: readonly { code: string }[];
  }>();
  useHarnessMessages(
    useCallback((message: HarnessMessage) => {
      if (message.type === "cds-protein.mapping") setMapping(message.payload as typeof mapping);
    }, []),
  );
  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-3 py-8 sm:px-6" data-testid="case-cds-protein">
      <section>
        <p className="font-medium text-sky-700 text-sm uppercase tracking-[0.16em]">
          Case study 5 · optional stretch
        </p>
        <h1 className="mt-2 font-bold text-3xl text-slate-950">Nucleotide to protein CDS</h1>
        <p className="mt-3 max-w-4xl text-lg text-slate-600">
          Two independent Seq* viewers exchange named coordinate loci only through the harness. A
          protein residue maps to its complete zero-based, half-open codon interval.
        </p>
        <p className="mt-2 text-slate-500 text-sm" data-testid="p70-harness-status">
          Harness: {status} · local synthetic fixture · no runtime network required
        </p>
      </section>
      <section
        className="rounded border border-sky-200 bg-sky-50 p-3 text-sm text-slate-700"
        data-testid="p70-coordinate-convention"
      >
        CDS: nucleotide [3, 21), strand +, phase 0; protein offset 0. Hover a nucleotide or protein
        letter; select an interval to report partial-codon edges.
      </section>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel id={nucleotideComponent} title="Synthetic nucleotide / CDS" />
        <Panel id={proteinComponent} title="Translated protein" />
      </div>
      <section
        className="rounded-lg bg-slate-950 p-5 text-slate-100"
        data-testid="p70-mapping-status"
      >
        <h2 className="font-semibold text-lg">Harness mapping status</h2>
        <p className="mt-2 text-slate-300 text-sm">
          {mapping === undefined
            ? "Hover or select either local viewer."
            : `${mapping.direction}: ${mapping.status}; ${mapping.targetCount} target locus/loci.`}
        </p>
        {mapping?.config !== undefined && (
          <p className="mt-1 text-slate-300 text-sm" data-testid="p70-mapping-config">
            strand {mapping.config.strand}, phase {mapping.config.phase}, offset{" "}
            {mapping.config.proteinOffset}, CDS [{mapping.config.start}, {mapping.config.end})
          </p>
        )}
        {mapping?.diagnostics?.map((item) => (
          <p className="mt-1 text-amber-300 text-xs" key={item.code}>
            {item.code}
          </p>
        ))}
      </section>
    </main>
  );
}
function CdsProteinPage() {
  const createHarness = useCallback(
    ({ hosts }: { readonly hosts: { readonly require: (id: string) => HTMLElement } }) =>
      createPageHarness(hosts),
    [],
  );
  return (
    <HarnessProvider
      createHarness={createHarness}
      fallback={<main className="p-8">Starting CDS/protein case…</main>}
    >
      <Content />
    </HarnessProvider>
  );
}
export const Route = createFileRoute("/cds-protein")({ component: CdsProteinPage });
