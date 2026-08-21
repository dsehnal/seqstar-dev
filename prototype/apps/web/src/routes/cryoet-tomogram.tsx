import { createApplicationHarness, type HarnessMessage } from "@seq-star/harness-core";
import {
  HarnessProvider,
  useHarness,
  useHarnessHost,
  useHarnessMessages,
} from "@seq-star/harness-react";
import {
  CRYOET_LIVE_INDEX,
  CRYOET_PP7_PARTICLE_SETS,
  type CryoEtLiveMetadata,
  type CryoEtPp7ParticleSetId,
  createCryoEtTomogramPlugin,
} from "@seq-star/integration-plugins";
import { createMolstarWrapperFactory } from "@seq-star/wrapper-molstar";
import { createNightingaleWrapperFactory } from "@seq-star/wrapper-nightingale";
import { createReferenceViewerWrapperFactory } from "@seq-star/wrapper-seq-viewer";
import { createTomogramWrapperFactory } from "@seq-star/wrapper-tomogram";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, Database, ExternalLink, Microscope, ScanSearch } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import {
  CaseRendererChooser,
  type RendererMode,
  rendererSearch,
} from "../components/case-renderer-chooser";
import {
  CompactToolbar,
  PageIntro,
  ViewerPanel,
  VisualizationCard,
} from "../components/presentation";
import { InspectPanel, useInspectPanelState } from "../inspect-panel";

const tomogramComponent = "cryoet-tomogram";
const sequenceComponent = "cryoet-sequence";
const structureComponent = "cryoet-structure";
const rendererModes = ["reference", "nightingale"] as const satisfies readonly RendererMode[];
const referenceDefaultTrackAction = {
  kind: "structure-profile",
  icon: "box",
  accessibleName: "Show this track in 3D",
  tooltip: "Show this track as an annotated 3D structure",
} as const;
const nightingaleDefaultTrackAction = {
  label: "Show this track in 3D",
  kind: "structure",
} as const;
const rendererComponents = {
  reference: [
    {
      id: sequenceComponent,
      type: "seqstar.reference-viewer",
      config: { presentation: { defaultTrackAction: referenceDefaultTrackAction } },
    },
  ],
  nightingale: [
    {
      id: sequenceComponent,
      type: "seqstar.nightingale",
      config: { presentation: { defaultTrackAction: nightingaleDefaultTrackAction } },
    },
  ],
} as const;

const createPageHarness = (
  hosts: { readonly require: (id: string) => HTMLElement },
  mode: Exclude<RendererMode, "compare">,
  particleSetId: CryoEtPp7ParticleSetId,
) =>
  createApplicationHarness(
    {
      id: "cryoet-tomogram-live",
      components: [
        {
          id: tomogramComponent,
          type: "seqstar.tomogram-particles",
          config: { embedNeuroglancer: false },
        },
        ...rendererComponents[mode],
        { id: structureComponent, type: "seqstar.molstar-mvs" },
      ],
      plugins: [{ id: "cryoet-live", plugin: "seqstar.cryoet-tomogram" }],
      synchronization: [
        {
          id: "cryoet-residue-hover",
          interaction: "hover",
          between: [sequenceComponent, structureComponent],
          unmapped: "clear",
        },
        {
          id: "cryoet-residue-select",
          interaction: "select",
          between: [sequenceComponent, structureComponent],
          unmapped: "preserve",
        },
      ],
    },
    {
      componentFactories: [
        createTomogramWrapperFactory({ getHost: (id) => hosts.require(id) }),
        createReferenceViewerWrapperFactory({ getHost: (id) => hosts.require(id) }),
        createNightingaleWrapperFactory({ getHost: (id) => hosts.require(id) }),
        createMolstarWrapperFactory({ getHost: (id) => hosts.require(id) }),
      ],
      pluginFactories: [
        {
          plugin: "seqstar.cryoet-tomogram",
          create: () =>
            createCryoEtTomogramPlugin({
              tomogramComponent,
              sequenceComponent,
              structureComponent,
              particleSetId,
            }),
        },
      ],
    },
  );

type SelectedParticle = {
  readonly particleId: string;
  readonly index: number;
  readonly location: readonly [number, number, number];
  readonly classId: string;
};

function CryoEtContent({
  initialMode,
  particleSetId,
  onModeChange,
  onParticleSetChange,
}: {
  readonly initialMode: RendererMode;
  readonly particleSetId: CryoEtPp7ParticleSetId;
  readonly onModeChange: (mode: RendererMode) => void;
  readonly onParticleSetChange: (particleSetId: CryoEtPp7ParticleSetId) => void;
}) {
  const { harness } = useHarness();
  const tomogramHost = useHarnessHost(tomogramComponent);
  const sequenceHost = useHarnessHost(sequenceComponent);
  const structureHost = useHarnessHost(structureComponent);
  const inspect = useInspectPanelState({ sequenceComponent, structureComponent });
  const [metadata, setMetadata] = useState<CryoEtLiveMetadata>();
  const [particle, setParticle] = useState<SelectedParticle>();
  const [presentation, setPresentation] = useState<"density" | "structure">("density");
  useHarnessMessages(
    useCallback((message: HarnessMessage) => {
      if (message.type === "cryoet.data.ready")
        setMetadata(message.payload as unknown as CryoEtLiveMetadata);
      if (message.type === "cryoet.particle.selected") {
        setParticle(message.payload as unknown as SelectedParticle);
        setPresentation("density");
      }
      if (
        message.type === "visualization.mvs.request" &&
        message.target !== undefined &&
        "component" in message.target &&
        message.target?.component === structureComponent
      ) {
        const requestId = (message.payload as { readonly requestId?: string }).requestId;
        if (requestId?.startsWith("cryoet-density-")) setPresentation("density");
        if (requestId?.startsWith("cryoet-structure-")) setPresentation("structure");
      }
    }, []),
  );
  const show = (view: "density" | "structure", scrollToViewer = false) => {
    const id = crypto.randomUUID();
    setPresentation(view);
    harness.fabric.publish({
      id,
      type: "intent.cryoet.presentation.select",
      version: "0.1.0",
      source: { component: "cryoet-presentation-controls" },
      target: { plugin: "seqstar.cryoet-tomogram" },
      correlationId: id,
      timestamp: new Date().toISOString(),
      payload: { view },
    });
    if (scrollToViewer)
      requestAnimationFrame(() =>
        document
          .querySelector(`[data-testid="visualizer-panel-${structureComponent}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      );
  };
  return (
    <main
      className="cryoet-page mx-auto grid max-w-[1440px] gap-6 px-6 py-8"
      data-testid="case-cryoet-tomogram"
    >
      <PageIntro
        eyebrow="Live-data case study"
        title="Tomogram particle → density → molecular structure"
        description={
          <>
            Select a live PP7 particle from CryoET Data Portal run RN-34483, inspect the EMD-77085
            subtomogram average, then switch to representative PDB 1DWN chain A and its live UniProt
            P03630 annotations. The representative model is linked biologically through SIFTS; it is
            not claimed as a fitted model for the EM map.
          </>
        }
      />
      <section className="case-control-panel case-control-panel--dataset-only">
        <div className="case-control-panel__dataset case-control-panel__dataset--only">
          <label
            className="grid gap-1 font-medium text-slate-800 text-sm"
            htmlFor="cryoet-dataset-select"
          >
            Live dataset and particle class
            <span className="case-dataset-select-wrap">
              <select
                className="case-dataset-select"
                data-testid="cryoet-dataset-selector"
                id="cryoet-dataset-select"
                value={particleSetId}
                onChange={(event) =>
                  onParticleSetChange(event.currentTarget.value as CryoEtPp7ParticleSetId)
                }
              >
                {Object.values(CRYOET_PP7_PARTICLE_SETS).map((particleSet) => (
                  <option key={particleSet.id} value={particleSet.id}>
                    {particleSet.label}
                  </option>
                ))}
                <option disabled value="groel">
                  DS-10493 · GroEL · no class-linked average
                </option>
              </select>
              <ChevronDown aria-hidden="true" className="case-dataset-select-icon" size={16} />
            </span>
          </label>
          <p className="case-control-panel__status text-slate-600 text-sm">
            Switch between two live PP7 annotation sets. This run also contains GroEL, but its
            Portal record does not provide the class-linked deposited average required here.
          </p>
        </div>
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(20rem,0.75fr)]">
        <VisualizationCard
          className="visualization-card--flush"
          title="Tomogram + PP7 particle annotations"
          description="Live Portal key image and oriented-point projection; open the full Neuroglancer only when its detailed controls are needed."
          toolbar={<Microscope aria-hidden="true" size={17} />}
        >
          <section
            aria-label="Cryo-ET tomogram visualizer"
            className="tomogram-host"
            data-testid="cryoet-tomogram-host"
            ref={tomogramHost}
          />
        </VisualizationCard>
        <VisualizationCard
          title="Selected molecular object"
          description="Curated one-off join index; all scientific records and coordinates load live."
          toolbar={<Database aria-hidden="true" size={17} />}
        >
          <div className="cryoet-object" data-testid="cryoet-selected-object">
            <div className="cryoet-object__identity">
              <ScanSearch aria-hidden="true" size={22} />
              <div>
                <strong>{particle?.particleId ?? "Choose a PP7 particle"}</strong>
                <span>
                  {particle === undefined
                    ? metadata === undefined
                      ? "Loading live particle annotations"
                      : `${metadata.particleCount} live ${metadata.particleSet.shape === "point" ? "point" : "oriented-point"} annotations`
                    : `x ${particle.location[0].toFixed(1)} · y ${particle.location[1].toFixed(1)} · z ${particle.location[2].toFixed(1)}`}
                </span>
              </div>
            </div>
            <dl className="cryoet-object__facts">
              <div>
                <dt>Class</dt>
                <dd>PP7 virus-like particle</dd>
              </div>
              <div>
                <dt>Average</dt>
                <dd>
                  <button
                    className="cryoet-object__accession"
                    disabled={metadata === undefined}
                    onClick={() => show("density", true)}
                    type="button"
                  >
                    {metadata?.emdb.id ?? "EMD-77085"}
                  </button>
                  <a
                    aria-label="Open EMD-77085 source"
                    className="cryoet-object__external"
                    href={CRYOET_LIVE_INDEX.emdb.entryUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink aria-hidden="true" size={14} />
                  </a>
                  {metadata === undefined
                    ? ""
                    : ` · ${metadata.emdb.resolutionAngstrom.toFixed(1)} Å`}
                </dd>
              </div>
              <div>
                <dt>Atomic model</dt>
                <dd>
                  <button
                    className="cryoet-object__accession"
                    disabled={metadata === undefined}
                    onClick={() => show("structure", true)}
                    type="button"
                  >
                    1DWN
                  </button>
                  <a
                    aria-label="Open 1DWN source"
                    className="cryoet-object__external"
                    href={CRYOET_LIVE_INDEX.structure.entryUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink aria-hidden="true" size={14} />
                  </a>{" "}
                  · representative, not fitted
                </dd>
              </div>
              <div>
                <dt>Protein</dt>
                <dd>
                  <strong>P03630</strong>
                  <a
                    aria-label="Open P03630 source"
                    className="cryoet-object__external"
                    href={CRYOET_LIVE_INDEX.uniprot.entryUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink aria-hidden="true" size={14} />
                  </a>{" "}
                  · {metadata?.protein.name ?? "capsid protein"}
                </dd>
              </div>
              <div>
                <dt>Mapping</dt>
                <dd>
                  {metadata === undefined
                    ? "Loading live SIFTS…"
                    : `${metadata.structure.mappedChains.join(", ")} · ${(metadata.structure.coverage * 100).toFixed(1)}% coverage`}
                </dd>
              </div>
            </dl>
            <CompactToolbar label="Molecular presentation">
              <button
                aria-pressed={presentation === "density"}
                disabled={metadata === undefined}
                onClick={() => show("density")}
                type="button"
              >
                Average density
              </button>
              <button
                aria-pressed={presentation === "structure"}
                disabled={metadata === undefined}
                onClick={() => show("structure")}
                type="button"
              >
                Representative structure
              </button>
            </CompactToolbar>
            <p className="cryoet-object__source">
              Live sources: CryoET Data Portal, EMDB/PDBe Volume Server, PDBe/SIFTS, and UniProtKB.
            </p>
          </div>
        </VisualizationCard>
      </div>
      <CaseRendererChooser
        descriptor={{ caseId: "cryoet-tomogram", modes: rendererModes, initialMode }}
        modeComponents={rendererComponents}
        onModeChange={onModeChange}
      >
        {(_, rendererControl) => (
          <div className="grid gap-5 xl:grid-cols-2">
            <ViewerPanel
              description="Live P03630 sequence and UniProt features, plus an explicitly synthetic structure-fit quality track."
              hostRef={sequenceHost}
              id={sequenceComponent}
              title="PP7 capsid sequence annotations"
              toolbar={rendererControl}
            />
            <ViewerPanel
              description={
                presentation === "density"
                  ? "Live EMD-77085 BCIF isosurface from PDBe Volume Server."
                  : "Representative 1DWN chain A; residue interactions synchronize with P03630."
              }
              hostRef={structureHost}
              id={structureComponent}
              kind="structure"
              title={
                presentation === "density"
                  ? "EMD-77085 subtomogram average"
                  : "1DWN representative structure"
              }
            />
          </div>
        )}
      </CaseRendererChooser>
      <section data-testid="inspect-panel-container">
        <InspectPanel state={inspect} />
      </section>
    </main>
  );
}

function CryoEtHarnessPage({
  initialMode,
  particleSetId,
  onModeChange,
  onParticleSetChange,
}: {
  readonly initialMode: RendererMode;
  readonly particleSetId: CryoEtPp7ParticleSetId;
  readonly onModeChange: (mode: RendererMode) => void;
  readonly onParticleSetChange: (particleSetId: CryoEtPp7ParticleSetId) => void;
}) {
  const mountedMode = useRef(initialMode).current;
  const createHarness = useCallback(
    ({ hosts }: { readonly hosts: { readonly require: (id: string) => HTMLElement } }) =>
      createPageHarness(hosts, mountedMode as Exclude<RendererMode, "compare">, particleSetId),
    [mountedMode, particleSetId],
  );
  return (
    <HarnessProvider
      createHarness={createHarness}
      fallback={
        <main className="p-8">Connecting to live CryoET, EMDB, PDBe, and UniProt services…</main>
      }
    >
      <CryoEtContent
        initialMode={initialMode}
        particleSetId={particleSetId}
        onModeChange={onModeChange}
        onParticleSetChange={onParticleSetChange}
      />
    </HarnessProvider>
  );
}

function CryoEtPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const initialMode = rendererSearch(search.renderer, rendererModes, "reference");
  const particleSetId: CryoEtPp7ParticleSetId =
    search.particleSet === "points" ? "points" : "oriented";
  return (
    <CryoEtHarnessPage
      key={particleSetId}
      initialMode={initialMode}
      particleSetId={particleSetId}
      onModeChange={(renderer) =>
        void navigate({ search: { renderer, particleSet: particleSetId } })
      }
      onParticleSetChange={(particleSet) =>
        void navigate({ search: { renderer: initialMode, particleSet } })
      }
    />
  );
}

export const Route = createFileRoute("/cryoet-tomogram")({
  validateSearch: (search: Record<string, unknown>) => ({
    renderer: search.renderer,
    particleSet: search.particleSet,
  }),
  component: CryoEtPage,
});
