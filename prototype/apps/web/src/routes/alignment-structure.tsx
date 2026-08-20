import { createApplicationHarness, type HarnessMessage } from "@seq-star/harness-core";
import {
  HarnessProvider,
  useHarness,
  useHarnessHost,
  useHarnessMessages,
} from "@seq-star/harness-react";
import { createAlignmentStructurePlugin } from "@seq-star/integration-plugins";
import { createMolstarWrapperFactory } from "@seq-star/wrapper-molstar";
import { createNightingaleWrapperFactory } from "@seq-star/wrapper-nightingale";
import { createReferenceViewerWrapperFactory } from "@seq-star/wrapper-seq-viewer";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import alignmentAfa from "../../../../fixtures/alignment-structure/expected/PF00042.29-32rows.query-centric.afa?raw";
import structureUrl from "../../../../fixtures/alignment-structure/input/1A3N.cif?url";
import a0a2y9dez0Url from "../../../../fixtures/alignment-structure/input/AF-A0A2Y9DEZ0-F1-model_v6.cif?url";
import a0a5e4c8d4Url from "../../../../fixtures/alignment-structure/input/AF-A0A5E4C8D4-F1-model_v6.cif?url";
import p02197Url from "../../../../fixtures/alignment-structure/input/AF-P02197-F1-model_v6.cif?url";
import p69905Fasta from "../../../../fixtures/alignment-structure/input/P69905.fasta?raw";
import structureMappingTsv from "../../../../fixtures/alignment-structure/mappings/P69905-1A3N-chain-A.tsv?raw";
import alignmentMappingTsv from "../../../../fixtures/alignment-structure/mappings/P69905-PF00042-1A3N-chain-A.tsv?raw";
import a0a2y9dez0Mapping from "../../../../fixtures/alignment-structure/mappings/PF00042.29-A0A2Y9DEZ0-AF-A0A2Y9DEZ0-F1-model_v6.tsv?raw";
import a0a5e4c8d4Mapping from "../../../../fixtures/alignment-structure/mappings/PF00042.29-A0A5E4C8D4-AF-A0A5E4C8D4-F1-model_v6.tsv?raw";
import p02197Mapping from "../../../../fixtures/alignment-structure/mappings/PF00042.29-P02197-AF-P02197-F1-model_v6.tsv?raw";
import a0a2y9dez0Transform from "../../../../fixtures/alignment-structure/transforms/A0A2Y9DEZ0-AF-A0A2Y9DEZ0-F1-to-P69905-1A3N-chain-A.transform.json?raw";
import a0a5e4c8d4Transform from "../../../../fixtures/alignment-structure/transforms/A0A5E4C8D4-AF-A0A5E4C8D4-F1-to-P69905-1A3N-chain-A.transform.json?raw";
import p02197Transform from "../../../../fixtures/alignment-structure/transforms/P02197-AF-P02197-F1-to-P69905-1A3N-chain-A.transform.json?raw";
import {
  CaseRendererChooser,
  type RendererMode,
  rendererSearch,
} from "../components/case-renderer-chooser";

const alignmentComponent = "pf00042-alignment";
const structureComponent = "p69905-structure";

const rendererModes = ["reference", "nightingale"] as const satisfies readonly RendererMode[];
const ensembleId = "PF00042.29-P69905-1A3N-plus-AFDB-v6-3";
const transformMatrix = (source: string): readonly number[] => {
  const parsed = JSON.parse(source) as { readonly matrix?: { readonly values?: unknown } };
  const values = parsed.matrix?.values;
  if (
    !Array.isArray(values) ||
    values.length !== 16 ||
    values.some((value) => typeof value !== "number")
  )
    throw new Error("Checked alignment transform must be a 16-value matrix.");
  return Object.freeze([...values]);
};
const ensemble = [
  {
    id: "P69905-1A3N",
    memberId: "HBA_HUMAN-27-137:member",
    label: "P69905 / 1A3N chain A",
    provenanceLabel: "Experimental PDB 1A3N chain A",
    url: structureUrl,
    color: "#2563EB",
    predicted: false,
    mappingTsv: alignmentMappingTsv,
  },
  {
    id: "P02197-AFDB-v6",
    memberId: "MYG_CHICK-27-143:member",
    label: "P02197 AlphaFold DB v6",
    provenanceLabel: "AlphaFold DB v6 predicted model — theoretical; not experimental",
    url: p02197Url,
    color: "#F97316",
    predicted: true,
    mappingTsv: p02197Mapping,
    transform: transformMatrix(p02197Transform),
  },
  {
    id: "A0A5E4C8D4-AFDB-v6",
    memberId: "A0A5E4C8D4_MARMO-27-137:member",
    label: "A0A5E4C8D4 AlphaFold DB v6",
    provenanceLabel: "AlphaFold DB v6 predicted model — theoretical; not experimental",
    url: a0a5e4c8d4Url,
    color: "#10B981",
    predicted: true,
    mappingTsv: a0a5e4c8d4Mapping,
    transform: transformMatrix(a0a5e4c8d4Transform),
  },
  {
    id: "A0A2Y9DEZ0-AFDB-v6",
    memberId: "A0A2Y9DEZ0_TRIMA-27-137:member",
    label: "A0A2Y9DEZ0 AlphaFold DB v6",
    provenanceLabel: "AlphaFold DB v6 predicted model — theoretical; not experimental",
    url: a0a2y9dez0Url,
    color: "#A855F7",
    predicted: true,
    mappingTsv: a0a2y9dez0Mapping,
    transform: transformMatrix(a0a2y9dez0Transform),
  },
] as const;
const profileTracks = [
  {
    trackId: "consensus",
    action: {
      kind: "structure-profile",
      icon: "box",
      accessibleName: "Show consensus in 3D",
      tooltip: "Show consensus identity and mismatch colors in 3D",
    },
  },
  {
    trackId: "conservation",
    action: {
      kind: "structure-profile",
      icon: "box",
      accessibleName: "Show conservation in 3D",
      tooltip: "Show deterministic conservation colors in 3D",
    },
  },
  {
    trackId: "subgroups",
    action: {
      kind: "structure-profile",
      icon: "box",
      accessibleName: "Show subgroup annotations in 3D",
      tooltip: "Show frozen subgroup categories in 3D",
    },
  },
] as const;
const alignmentMemberActions = ensemble.map((member) => ({
  alignmentId: "PF00042.29",
  memberId: member.memberId,
  label: `Show ${member.label} in 3D`,
  kind: "structure" as const,
}));
const rendererComponents = {
  reference: [
    {
      id: alignmentComponent,
      type: "seqstar.reference-viewer",
      config: { presentation: { tracks: profileTracks, alignmentMemberActions } },
    },
  ],
  nightingale: [
    {
      id: alignmentComponent,
      type: "seqstar.nightingale",
      // This is a frozen presentation affordance only.  The wrapper publishes
      // member identity; it neither contains nor derives a structure mapping.
      config: {
        presentation: {
          trackActions: profileTracks.map(({ trackId, action }) => ({
            trackId,
            label: action.accessibleName,
            kind: "structure",
          })),
          alignmentMemberActions,
        },
      },
    },
  ],
} as const;
const createPageHarness = (
  hosts: { readonly require: (id: string) => HTMLElement },
  mode: Exclude<RendererMode, "compare">,
) =>
  createApplicationHarness(
    {
      id: "alignment-structure",
      components: [
        ...rendererComponents[mode],
        { id: structureComponent, type: "seqstar.molstar-mvs" },
      ],
      plugins: [{ id: "alignment-structure", plugin: "seqstar.alignment-structure" }],
    },
    {
      componentFactories: [
        createReferenceViewerWrapperFactory({ getHost: (id) => hosts.require(id) }),
        createNightingaleWrapperFactory({ getHost: (id) => hosts.require(id) }),
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
              ensemble,
              ensembleId,
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
        className="relative mt-3 h-96 overflow-auto rounded border border-slate-200"
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
type ActionSummary =
  | { readonly kind: "profile"; readonly profile: string; readonly requestId: string }
  | { readonly kind: "member"; readonly memberId: string; readonly requestId: string }
  | { readonly kind: "show-all"; readonly ensembleId: string; readonly requestId: string };

function AlignmentStructureContent({
  initialMode,
  onModeChange,
}: {
  readonly initialMode: RendererMode;
  readonly onModeChange: (mode: RendererMode) => void;
}) {
  const { harness, status } = useHarness();
  const [ready, setReady] = useState<ReadySummary>();
  const [paths, setPaths] = useState<readonly string[]>([]);
  const [action, setAction] = useState<ActionSummary>();
  const [renderedRequest, setRenderedRequest] = useState<string>();
  const showAll = useCallback(() => {
    const requestId = crypto.randomUUID();
    harness.fabric.publish({
      id: requestId,
      type: "alignment.structure.show-all",
      version: "0.1.0",
      source: { component: alignmentComponent },
      correlationId: requestId,
      timestamp: new Date().toISOString(),
      payload: { ensembleId } as never,
    });
  }, [harness]);
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
      if (message.type === "alignment-structure.action")
        setAction(message.payload as unknown as ActionSummary);
      if (
        message.type === "lifecycle.visualization" &&
        message.source.component === structureComponent
      ) {
        const lifecycle = message.payload as unknown as { status?: string; requestId?: string };
        if (lifecycle.status === "rendered" && lifecycle.requestId?.startsWith("M50-"))
          setRenderedRequest(lifecycle.requestId);
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
          The checked PF00042.29 alignment has one experimental 1A3N structure and three clearly
          labeled AlphaFold DB v6 predictions. This is a comparative display, not a biological
          ensemble; all models and transforms are local checked fixtures.
        </p>
        <p className="mt-2 text-slate-500 text-sm" data-testid="p60-harness-status">
          Harness: {status} · local checked fixture only
        </p>
      </section>
      <CaseRendererChooser
        descriptor={{ caseId: "alignment-structure", modes: rendererModes, initialMode }}
        modeComponents={rendererComponents}
        onModeChange={onModeChange}
      >
        {() => null}
      </CaseRendererChooser>
      <section
        className="flex flex-wrap items-center gap-2"
        aria-label="Alignment structure actions"
      >
        <button className="toolbar-button" onClick={showAll} type="button">
          Show all checked structures
        </button>
        <span className="text-slate-600 text-sm">
          Click Consensus, Conservation, or Subgroup annotations to color every mapped checked
          structure. A member cube shows that member alone.
        </span>
      </section>
      <div className="grid gap-5 xl:grid-cols-2">
        <ViewerPanel
          id={alignmentComponent}
          title="PF00042.29 virtualized alignment"
          detail="32 stable rows · 118 columns · query P69905 positions 27–137"
        />
        <ViewerPanel
          id={structureComponent}
          title="Mol* comparative structure view"
          detail="Experimental 1A3N plus clearly labeled local AlphaFold DB v6 predictions"
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
          Hover or select a non-gap structured-member cell to inspect its explicit mapping path. Gap
          columns retain their alignment locus and never invent a sequence or structure position.
        </p>
        <p className="mt-2 text-emerald-200 text-sm" data-testid="m50-action-summary">
          {action === undefined
            ? "Neutral experimental structure"
            : action.kind === "profile"
              ? `Profile: ${action.profile}`
              : action.kind === "member"
                ? `Member: ${action.memberId}`
                : "All four checked structures"}
        </p>
        <p className="sr-only" data-testid="m50-structure-state">
          {renderedRequest ?? "waiting for structure frame"}
        </p>
        <pre className="sr-only" data-testid="m50-action-payload">
          {action === undefined ? "{}" : JSON.stringify(action)}
        </pre>
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
      fallback={<main className="p-8">Starting offline PF00042.29 / 1A3N case…</main>}
    >
      <AlignmentStructureContent
        initialMode={initialMode}
        onModeChange={(renderer) => void navigate({ search: { renderer } })}
      />
    </HarnessProvider>
  );
}

export const Route = createFileRoute("/alignment-structure")({
  validateSearch: (search: Record<string, unknown>) => ({ renderer: search.renderer }),
  component: AlignmentStructurePage,
});
