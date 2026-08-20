import { createApplicationHarness, type HarnessMessage } from "@seq-star/harness-core";
import { HarnessProvider, useHarness, useHarnessHost } from "@seq-star/harness-react";
import {
  createUniProtDatasetsPlugin,
  type UniProtDatasetAssetBundle,
  type UniProtDatasetId,
} from "@seq-star/integration-plugins";
import { createMolstarWrapperFactory } from "@seq-star/wrapper-molstar";
import { createNightingaleWrapperFactory } from "@seq-star/wrapper-nightingale";
import { createReferenceViewerWrapperFactory } from "@seq-star/wrapper-seq-viewer";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef } from "react";
import alignmentAfa from "../../../../fixtures/alignment-structure/expected/PF00042.29-32rows.query-centric.afa?raw";
import alignmentStructureUrl from "../../../../fixtures/alignment-structure/input/1A3N.cif?url";
import p69905Fasta from "../../../../fixtures/alignment-structure/input/P69905.fasta?raw";
import p69905StructureMapping from "../../../../fixtures/alignment-structure/mappings/P69905-1A3N-chain-A.tsv?raw";
import p69905AlignmentMapping from "../../../../fixtures/alignment-structure/mappings/P69905-PF00042-1A3N-chain-A.tsv?raw";
import syntheticConfidence from "../../../../fixtures/complex/expected/synthetic-confidence.tsv?raw";
import complexStructureUrl from "../../../../fixtures/complex/input/1BRS.cif?url";
import p00648Fasta from "../../../../fixtures/complex/input/P00648.fasta?raw";
import complexContacts from "../../../../fixtures/complex/mappings/1BRS-chain-A-D-heavy-atom-contacts.tsv?raw";
import p00648Mapping from "../../../../fixtures/complex/mappings/P00648-1BRS-chain-A.tsv?raw";
import p53StructureUrl from "../../../../fixtures/uniprot-structure/input/1TUP.cif?url";
import p04637Mapping from "../../../../fixtures/uniprot-structure/mappings/P04637-1TUP-chain-A.tsv?raw";
import {
  CaseRendererChooser,
  type RendererMode,
  rendererSearch,
} from "../components/case-renderer-chooser";
import { ViewerPanel } from "../components/presentation";
import { InspectPanel, useInspectPanelState } from "../inspect-panel";

const sequenceComponent = "uniprot-tracks";
const structureComponent = "structure-view";

const assets: UniProtDatasetAssetBundle = {
  p04637: { mappingTsv: p04637Mapping, structureUrl: p53StructureUrl },
  p69905: {
    alignmentAfa,
    p69905Fasta,
    alignmentMappingTsv: p69905AlignmentMapping,
    structureMappingTsv: p69905StructureMapping,
    structureUrl: alignmentStructureUrl,
  },
  p00648: {
    p00648Fasta,
    mappingTsv: p00648Mapping,
    contactsTsv: complexContacts,
    confidenceTsv: syntheticConfidence,
    structureUrl: complexStructureUrl,
  },
};

const rendererModes = ["reference", "nightingale"] as const satisfies readonly RendererMode[];
const rendererComponents = {
  reference: [{ id: sequenceComponent, type: "seqstar.reference-viewer" }],
  nightingale: [{ id: sequenceComponent, type: "seqstar.nightingale" }],
} as const;
const createPageHarness = (
  hosts: { readonly require: (id: string) => HTMLElement },
  mode: Exclude<RendererMode, "compare">,
) =>
  createApplicationHarness(
    {
      id: "uniprot-structure-datasets",
      components: [
        ...rendererComponents[mode],
        { id: structureComponent, type: "seqstar.molstar-mvs" },
      ],
      plugins: [{ id: "uniprot-datasets", plugin: "seqstar.uniprot-datasets" }],
      synchronization: [
        {
          id: "uniprot-datasets-hover",
          interaction: "hover",
          between: [sequenceComponent, structureComponent],
          unmapped: "clear",
        },
        {
          id: "uniprot-datasets-selection",
          interaction: "select",
          between: [sequenceComponent, structureComponent],
          unmapped: "preserve",
        },
      ],
    },
    {
      componentFactories: [
        createNightingaleWrapperFactory({ getHost: (id) => hosts.require(id) }),
        createReferenceViewerWrapperFactory({ getHost: (id) => hosts.require(id) }),
        createMolstarWrapperFactory({ getHost: (id) => hosts.require(id) }),
      ],
      pluginFactories: [
        {
          plugin: "seqstar.uniprot-datasets",
          create: () =>
            createUniProtDatasetsPlugin({ sequenceComponent, structureComponent, assets }),
        },
      ],
    },
  );

function UniProtStructureContent({
  initialMode,
  onModeChange,
}: {
  readonly initialMode: RendererMode;
  readonly onModeChange: (mode: RendererMode) => void;
}) {
  const { harness, status } = useHarness();
  const sequenceHost = useHarnessHost(sequenceComponent);
  const structureHost = useHarnessHost(structureComponent);
  const inspect = useInspectPanelState({ sequenceComponent, structureComponent });
  const transition = inspect.datasetStatus;
  const requestedDatasetId =
    transition?.status === "superseded"
      ? (transition.previousDatasetId ?? transition.datasetId)
      : (transition?.datasetId ?? inspect.catalog?.initialDatasetId ?? "");
  const requestedDataset = inspect.catalog?.datasets.find(
    (item) => item.id === transition?.datasetId,
  );
  const displayedDatasetId =
    transition?.status === "active" ? transition.datasetId : transition?.previousDatasetId;
  const displayedDataset = inspect.catalog?.datasets.find((item) => item.id === displayedDatasetId);
  const switching = transition?.status === "switching";
  const transitionLabel =
    transition?.status === "superseded" ? "transition incomplete" : "transition pending";
  const selectDataset = (datasetId: string) => {
    if (inspect.catalog?.datasets.some((dataset) => dataset.id === datasetId) !== true) return;
    const messageId = crypto.randomUUID();
    harness.fabric.publish({
      id: messageId,
      type: "intent.dataset.select",
      version: "0.1.0",
      source: { component: "uniprot-dataset-selector" },
      target: { plugin: "seqstar.uniprot-datasets" },
      correlationId: messageId,
      timestamp: new Date().toISOString(),
      payload: { datasetId: datasetId as UniProtDatasetId },
    } satisfies HarnessMessage<"intent.dataset.select">);
  };
  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-6 py-8" data-testid="case-uniprot-structure">
      <section>
        <p className="font-medium text-sky-700 text-sm uppercase tracking-[0.16em]">Case study 2</p>
        <h1 className="mt-2 font-bold text-3xl text-slate-950">
          Switchable protein annotations and structure
        </h1>
        <p className="mt-3 max-w-4xl text-lg text-slate-600">
          Three checked offline datasets exercise different sequence tracks and structures. The
          integration plugin owns every document, mapping, and MolViewSpec generation step.
        </p>
        <p className="mt-2 text-slate-500 text-sm" data-testid="inspect-harness-status">
          Harness: {status} · no runtime network required
        </p>
      </section>
      <CaseRendererChooser
        descriptor={{ caseId: "uniprot-structure", modes: rendererModes, initialMode }}
        modeComponents={rendererComponents}
        onModeChange={onModeChange}
      >
        {() => null}
      </CaseRendererChooser>
      <section className="flex flex-wrap items-end gap-4 rounded-lg border border-sky-200 bg-sky-50 p-4">
        <label className="grid gap-1 font-medium text-slate-800 text-sm" htmlFor="dataset-select">
          Protein and structure dataset
          <select
            className="min-w-80 rounded border border-slate-400 bg-white px-3 py-2 text-slate-950 disabled:opacity-60"
            data-testid="dataset-selector"
            disabled={switching || inspect.catalog === undefined}
            id="dataset-select"
            onChange={(event) => selectDataset(event.currentTarget.value)}
            value={requestedDatasetId}
          >
            {inspect.catalog?.datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>
                {dataset.label}
              </option>
            ))}
          </select>
        </label>
        <p aria-live="polite" className="text-slate-600 text-sm" data-testid="dataset-status">
          {requestedDataset?.label ?? "Loading dataset catalog"} · {transition?.status ?? "pending"}
          {transition?.status === "switching" && displayedDataset !== undefined
            ? ` · previous ${displayedDataset.label} remains until both viewers confirm the switch`
            : ""}
        </p>
      </section>
      <p className="rounded border border-sky-200 bg-sky-50 p-3 text-slate-700 text-sm">
        Activate any sequence track label to replace the neutral structure with its mapped view.
      </p>
      <div className="grid gap-5 xl:grid-cols-2">
        <ViewerPanel
          id={sequenceComponent}
          title={
            transition?.status === "active" && displayedDataset !== undefined
              ? `${displayedDataset.label} tracks`
              : `Sequence tracks — ${transitionLabel}`
          }
          hostRef={sequenceHost}
        />
        <ViewerPanel
          id={structureComponent}
          title={
            transition?.status === "active" && displayedDataset?.structureId !== undefined
              ? `${displayedDataset.structureId} / MolViewSpec`
              : `Mol* / MolViewSpec — ${transitionLabel}`
          }
          hostRef={structureHost}
          kind="structure"
        />
      </div>
      <section data-testid="inspect-panel-container">
        <InspectPanel state={inspect} />
      </section>
    </main>
  );
}

function UniProtStructurePage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const initialMode = rendererSearch(search.renderer, rendererModes, "nightingale");
  const mountedMode = useRef(initialMode).current;
  const createHarness = useCallback(
    ({ hosts }: { readonly hosts: { readonly require: (id: string) => HTMLElement } }) =>
      createPageHarness(hosts, mountedMode as Exclude<RendererMode, "compare">),
    [mountedMode],
  );
  return (
    <HarnessProvider
      createHarness={createHarness}
      fallback={<main className="p-8">Starting checked offline protein datasets…</main>}
    >
      <UniProtStructureContent
        initialMode={initialMode}
        onModeChange={(renderer) => void navigate({ search: { renderer } })}
      />
    </HarnessProvider>
  );
}

export const Route = createFileRoute("/uniprot-structure")({
  validateSearch: (search: Record<string, unknown>) => ({ renderer: search.renderer }),
  component: UniProtStructurePage,
});
