import { createApplicationHarness, type HarnessMessage } from "@seq-star/harness-core";
import {
  HarnessProvider,
  useHarness,
  useHarnessHost,
  useHarnessMessages,
} from "@seq-star/harness-react";
import { createCdsProteinPlugin } from "@seq-star/integration-plugins";
import { createNightingaleWrapperFactory } from "@seq-star/wrapper-nightingale";
import { createReferenceViewerWrapperFactory } from "@seq-star/wrapper-seq-viewer";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useCallback, useRef, useState } from "react";
import {
  CaseRendererChooser,
  type RendererMode,
  rendererSearch,
} from "../components/case-renderer-chooser";
import { VisualizationCard } from "../components/presentation";

const nucleotideComponent = "cds-nucleotide-view";
const proteinComponent = "cds-protein-view";
const rendererModes = ["reference", "nightingale"] as const satisfies readonly RendererMode[];
const rendererComponents = {
  reference: [
    { id: nucleotideComponent, type: "seqstar.reference-viewer" },
    { id: proteinComponent, type: "seqstar.reference-viewer" },
  ],
  nightingale: [
    { id: nucleotideComponent, type: "seqstar.nightingale" },
    { id: proteinComponent, type: "seqstar.nightingale" },
  ],
} as const;
const createPageHarness = (
  hosts: { readonly require: (id: string) => HTMLElement },
  mode: Exclude<RendererMode, "compare">,
) =>
  createApplicationHarness(
    {
      id: "cds-protein",
      components: rendererComponents[mode],
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
        createNightingaleWrapperFactory({ getHost: (id) => hosts.require(id) }),
      ],
      pluginFactories: [
        {
          plugin: "seqstar.cds-protein",
          create: () => createCdsProteinPlugin({ nucleotideComponent, proteinComponent }),
        },
      ],
    },
  );

function Panel({
  id,
  title,
  toolbar,
}: {
  readonly id: string;
  readonly title: string;
  readonly toolbar?: ReactNode;
}) {
  const host = useHarnessHost(id);
  return (
    <VisualizationCard className="visualization-card--flush" title={title} toolbar={toolbar}>
      <section
        aria-label={title}
        className="viewer-host cds-viewer-host"
        data-testid={`${id}-host`}
        ref={host}
      />
    </VisualizationCard>
  );
}
function Content({
  initialMode,
  onModeChange,
}: {
  readonly initialMode: RendererMode;
  readonly onModeChange: (mode: RendererMode) => void;
}) {
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
    <main className="mx-auto grid max-w-7xl gap-5 px-3 py-6 sm:px-6" data-testid="case-cds-protein">
      <section>
        <p className="font-medium text-sky-700 text-sm uppercase tracking-[0.16em]">Case study</p>
        <h1 className="mt-2 font-bold text-3xl text-slate-950">Nucleotide to protein CDS</h1>
        <p className="mt-3 max-w-4xl text-lg text-slate-600">
          Two independent Seq* viewers exchange named coordinate loci only through the harness. A
          protein residue maps to its complete zero-based, half-open codon interval.
        </p>
        <p data-testid="p70-harness-status" hidden>
          Harness: {status} · local synthetic fixture · no runtime network required
        </p>
      </section>
      <section className="status-card status-card--info" data-testid="p70-coordinate-convention">
        CDS: nucleotide [3, 21), strand +, phase 0; protein offset 0. Hover a nucleotide or protein
        letter; select an interval to report partial-codon edges.
      </section>
      <CaseRendererChooser
        descriptor={{ caseId: "cds-protein", modes: rendererModes, initialMode }}
        modeComponents={rendererComponents}
        onModeChange={onModeChange}
      >
        {(_, rendererControl) => (
          <div className="grid gap-5 xl:grid-cols-2">
            <Panel
              id={nucleotideComponent}
              title="Synthetic nucleotide / CDS"
              toolbar={rendererControl}
            />
            <Panel id={proteinComponent} title="Translated protein" />
          </div>
        )}
      </CaseRendererChooser>
      <section
        className="rounded-lg bg-slate-950 p-5 text-slate-100"
        data-testid="p70-mapping-status"
      >
        <h2 className="font-semibold text-lg">Mapping status</h2>
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
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const initialMode = rendererSearch(search.renderer, rendererModes, "reference");
  const mountedMode = useRef(initialMode).current;
  const createHarness = useCallback(
    ({ hosts }: { readonly hosts: { readonly require: (id: string) => HTMLElement } }) =>
      createPageHarness(hosts, mountedMode as Exclude<RendererMode, "compare">),
    [mountedMode],
  );
  return (
    <HarnessProvider
      createHarness={createHarness}
      fallback={<main className="p-8">Starting CDS/protein case…</main>}
    >
      <Content
        initialMode={initialMode}
        onModeChange={(renderer) => void navigate({ search: { renderer } })}
      />
    </HarnessProvider>
  );
}
export const Route = createFileRoute("/cds-protein")({
  validateSearch: (search: Record<string, unknown>) => ({ renderer: search.renderer }),
  component: CdsProteinPage,
});
