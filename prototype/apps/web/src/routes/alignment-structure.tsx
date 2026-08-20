import { createApplicationHarness, type HarnessMessage } from "@seq-star/harness-core";
import {
  HarnessProvider,
  useHarness,
  useHarnessHost,
  useHarnessMessages,
} from "@seq-star/harness-react";
import { createAlignmentStructurePlugin } from "@seq-star/integration-plugins";
import { createMolstarWrapperFactory } from "@seq-star/wrapper-molstar";
import { createReferenceViewerWrapperFactory } from "@seq-star/wrapper-seq-viewer";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import alignmentAfa from "../../../../fixtures/alignment-structure/expected/PF00042.29-32rows.query-centric.afa?raw";
import structureUrl from "../../../../fixtures/alignment-structure/input/1A3N.cif?url";
import p69905Fasta from "../../../../fixtures/alignment-structure/input/P69905.fasta?raw";
import structureMappingTsv from "../../../../fixtures/alignment-structure/mappings/P69905-1A3N-chain-A.tsv?raw";
import alignmentMappingTsv from "../../../../fixtures/alignment-structure/mappings/P69905-PF00042-1A3N-chain-A.tsv?raw";

const alignmentComponent = "pf00042-alignment";
const structureComponent = "p69905-structure";

const createPageHarness = (hosts: { readonly require: (id: string) => HTMLElement }) =>
  createApplicationHarness(
    {
      id: "alignment-structure",
      components: [
        { id: alignmentComponent, type: "seqstar.reference-viewer" },
        { id: structureComponent, type: "seqstar.molstar-mvs" },
      ],
      plugins: [{ id: "alignment-structure", plugin: "seqstar.alignment-structure" }],
    },
    {
      componentFactories: [
        createReferenceViewerWrapperFactory({ getHost: (id) => hosts.require(id) }),
        createMolstarWrapperFactory({ getHost: (id) => hosts.require(id) }),
      ],
      pluginFactories: [
        {
          plugin: "seqstar.alignment-structure",
          create: () =>
            createAlignmentStructurePlugin({
              alignmentComponent,
              structureComponent,
              alignmentAfa,
              p69905Fasta,
              alignmentMappingTsv,
              structureMappingTsv,
              structureUrl,
            }),
        },
      ],
    },
  );

function ViewerPanel({
  id,
  title,
  detail,
}: {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
}) {
  const host = useHarnessHost(id);
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-slate-950 text-xl">{title}</h2>
      <p className="mt-1 text-slate-600 text-sm">{detail}</p>
      <section
        aria-label={`${title} visualizer`}
        className="mt-3 min-h-96 overflow-auto rounded border border-slate-200"
        data-testid={`${id}-host`}
        ref={host}
      />
    </section>
  );
}

type ReadySummary = {
  readonly documentId: string;
  readonly alignmentId: string;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly queryGapColumns: number;
  readonly translatorIds: readonly string[];
};
type MappingSummary = {
  readonly direction: string;
  readonly interaction: string;
  readonly status: string;
  readonly translatorIds: readonly string[];
  readonly targetCount: number;
  readonly sourceMemberId?: string;
  readonly alignmentId: string;
};

function AlignmentStructureContent() {
  const { status } = useHarness();
  const [ready, setReady] = useState<ReadySummary>();
  const [paths, setPaths] = useState<readonly string[]>([]);
  useHarnessMessages(
    useCallback((message: HarnessMessage) => {
      if (message.type === "alignment-structure.ready")
        setReady(message.payload as unknown as ReadySummary);
      if (message.type === "alignment-structure.mapping") {
        const mapping = message.payload as unknown as MappingSummary;
        const path = mapping.translatorIds.length
          ? mapping.translatorIds.join(" -> ")
          : "no structure path";
        setPaths((current) =>
          [
            ...current,
            `${mapping.alignmentId} · ${mapping.sourceMemberId ?? "alignment column"} · ${mapping.direction} · ${mapping.interaction} · ${mapping.status} · ${mapping.targetCount} targets · ${path}`,
          ].slice(-4),
        );
      }
    }, []),
  );
  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-6 py-8" data-testid="case-alignment-structure">
      <section>
        <p className="font-medium text-sky-700 text-sm uppercase tracking-[0.16em]">Case study 4</p>
        <h1 className="mt-2 font-bold text-3xl text-slate-950">
          Alignment to sequence to structure
        </h1>
        <p className="mt-3 max-w-4xl text-lg text-slate-600">
          The checked PF00042.29 alignment is normalized into one 32-member alignment. A query cell
          travels through its P69905 member sequence before 1A3N chain A; a gap has no invented
          sequence or structure position.
        </p>
        <p className="mt-2 text-slate-500 text-sm" data-testid="p60-harness-status">
          Harness: {status} · local checked fixture only
        </p>
      </section>
      <div className="grid gap-5 xl:grid-cols-2">
        <ViewerPanel
          id={alignmentComponent}
          title="PF00042.29 virtualized alignment"
          detail="32 stable rows · 118 columns · query P69905 positions 27–137"
        />
        <ViewerPanel
          id={structureComponent}
          title="Mol* / 1A3N chain A"
          detail="Local neutral MVS; mapped P69905 residues only"
        />
      </div>
      <section
        className="rounded-lg bg-slate-950 p-5 text-slate-100"
        data-testid="p60-mapping-summary"
      >
        <h2 className="font-semibold text-lg">Mapping and virtualization summary</h2>
        <p className="mt-2 text-slate-300 text-sm" data-testid="p60-counts">
          {ready === undefined
            ? "Preparing checked alignment…"
            : `${ready.rowCount} stable rows · ${ready.columnCount} columns · ${ready.queryGapColumns} query gaps`}
        </p>
        <p className="mt-2 text-slate-300 text-sm">
          Hover or select a non-gap query cell to inspect the explicit two-step translator path. Gap
          columns retain their alignment locus and clear the structure mark.
        </p>
        <ul className="mt-3 grid gap-1 text-slate-300 text-xs" data-testid="p60-translator-ids">
          {(ready?.translatorIds ?? [])
            .filter((id) => id.includes("HBA_HUMAN") || id.includes("P69905.sequence"))
            .map((id) => (
              <li key={id}>{id}</li>
            ))}
        </ul>
        <ul className="mt-3 grid gap-1 text-sky-200 text-xs" data-testid="p60-composed-paths">
          {paths.map((path, index) => (
            <li key={`${path}-${index}`}>{path}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function AlignmentStructurePage() {
  const createHarness = useCallback(
    ({ hosts }: { readonly hosts: { readonly require: (id: string) => HTMLElement } }) =>
      createPageHarness(hosts),
    [],
  );
  return (
    <HarnessProvider
      createHarness={createHarness}
      fallback={<main className="p-8">Starting offline PF00042.29 / 1A3N case…</main>}
    >
      <AlignmentStructureContent />
    </HarnessProvider>
  );
}

export const Route = createFileRoute("/alignment-structure")({ component: AlignmentStructurePage });
