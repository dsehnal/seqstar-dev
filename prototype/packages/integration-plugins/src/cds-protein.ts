import {
  type HarnessMessage,
  type HarnessPluginSpec,
  type InteractionEvent,
  VisualizationRequestSchema,
} from "@seq-star/harness-core";
import {
  type CdsTranslatorConfig,
  type CoordinateSpace,
  createCdsTranslators,
} from "@seq-star/seq-coords";
import { type SeqViewSpec, validateSeqViewSpec } from "@seq-star/seq-view-spec";

/** Deliberately synthetic, deterministic Case 5 fixture: no external source or fetch. */
export const cdsNucleotideSpace: CoordinateSpace = Object.freeze({
  id: "case5.synthetic-transcript.nucleotide",
  kind: "sequence",
  length: 24,
});
export const cdsProteinSpace: CoordinateSpace = Object.freeze({
  id: "case5.synthetic-protein.sequence",
  kind: "sequence",
  length: 6,
});
export const cdsProteinConfig = Object.freeze({
  id: "p70.case5-cds",
  nucleotideSpace: cdsNucleotideSpace,
  proteinSpace: cdsProteinSpace,
  cds: Object.freeze({ start: 3, end: 21, strand: "+", phase: 0, proteinOffset: 0 }),
} satisfies CdsTranslatorConfig);

const nucleotideResidues = "TTTATGGCTGAATTTCCAGGGTAA";
const proteinResidues = "MAEFPG";
const document = (kind: "nucleotide" | "protein"): SeqViewSpec => {
  const nucleotide = kind === "nucleotide";
  const space = nucleotide ? cdsNucleotideSpace : cdsProteinSpace;
  const sequenceId = nucleotide ? "case5-nucleotide" : "case5-protein";
  const annotationId = nucleotide ? "case5-variant" : "case5-cds-product";
  const spec: SeqViewSpec = {
    kind: "seq-view-spec",
    version: "0.1.0",
    id: `case5-${kind}-document`,
    metadata: {
      label: nucleotide ? "Synthetic CDS nucleotide sequence" : "Synthetic CDS protein product",
      description:
        "Deterministic, clearly synthetic P70 fixture. Coordinates are zero-based and half-open.",
    },
    sequences: [
      {
        id: sequenceId,
        coordinateSpace: space.id,
        alphabet: nucleotide ? "dna" : "protein",
        residues: nucleotide ? nucleotideResidues : proteinResidues,
        provenance: { label: "Synthetic P70 CDS fixture", generatedBy: "P70" },
      },
    ],
    annotations: [
      {
        id: annotationId,
        kind: "loci",
        semanticType: nucleotide ? "seqstar.synthetic.variant" : "seqstar.cds.product",
        items: nucleotide
          ? [
              {
                id: "case5-variant-c.8A-G",
                label: "Synthetic nucleotide variant",
                value: "A>G",
                loci: [{ kind: "point", space: space.id, position: 8 }],
              },
            ]
          : [
              {
                id: "case5-protein-coding-region",
                label: "Translated CDS product",
                value: "protein",
                loci: [{ kind: "interval", space: space.id, start: 0, end: 6 }],
              },
            ],
        provenance: { label: "Synthetic P70 annotation", generatedBy: "P70" },
      },
    ],
    views: [
      {
        id: `case5-${kind}-main`,
        axis: {
          segments: [
            { id: `case5-${kind}-axis`, space: space.id, start: 0, end: space.length ?? 0 },
          ],
          ruler: { visible: true, numbering: "one-based" },
        },
        sections: [
          {
            id: `case5-${kind}-section`,
            tracks: [
              {
                id: `${kind}-residues`,
                label: nucleotide ? "Nucleotide sequence" : "Protein sequence",
                layers: [
                  {
                    id: `${kind}-letters`,
                    representation: "sequence",
                    sequence: sequenceId,
                    showLetters: true,
                  },
                ],
              },
              {
                id: `${kind}-annotation-track`,
                label: nucleotide ? "Synthetic variant" : "CDS product",
                layers: [
                  {
                    id: `${kind}-annotation-layer`,
                    representation: nucleotide ? "markers" : "blocks",
                    annotation: annotationId,
                    ...(nucleotide ? { shape: "diamond" as const } : {}),
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    provenance: {
      label: "P70 optional CDS/protein stretch",
      generatedBy: "@seq-star/integration-plugins",
    },
  };
  const checked = validateSeqViewSpec(spec);
  if (!checked.ok)
    throw new Error(
      `P70 invalid ${kind} document: ${checked.diagnostics.map((item) => item.message).join("; ")}`,
    );
  return checked.value;
};
export const cdsNucleotideDocument = document("nucleotide");
export const cdsProteinDocument = document("protein");

export interface CdsProteinPluginOptions {
  readonly nucleotideComponent: string;
  readonly proteinComponent: string;
}
type CdsStatus = {
  readonly direction: "nucleotide-to-protein" | "protein-to-nucleotide";
  readonly status: "exact" | "partial" | "ambiguous" | "unmapped";
  readonly targetCount: number;
  readonly config: {
    readonly strand: "+" | "-";
    readonly phase: 0 | 1 | 2;
    readonly proteinOffset: number;
    readonly start: number;
    readonly end: number;
  };
  readonly diagnostics: readonly { readonly code: string; readonly message: string }[];
};
const customSchema = <T>(check: (value: unknown) => value is T) => ({
  schema: VisualizationRequestSchema,
  check,
});
const statusSchema = customSchema<CdsStatus>(
  (value): value is CdsStatus =>
    typeof value === "object" && value !== null && "direction" in value && "status" in value,
);
const message = (
  type: string,
  payload: unknown,
  correlationId: string,
  causationId?: string,
): HarnessMessage => ({
  id: crypto.randomUUID(),
  type,
  version: "0.1.0",
  source: { plugin: "seqstar.cds-protein" },
  correlationId,
  ...(causationId === undefined ? {} : { causationId }),
  timestamp: new Date().toISOString(),
  payload: payload as never,
});

/** The plugin contributes only documents, coordinate edges, and serializable diagnostics.
 * Viewer-to-viewer effects are produced by the harness synchronization policy. */
export const createCdsProteinPlugin = (options: CdsProteinPluginOptions): HarnessPluginSpec => ({
  id: "seqstar.cds-protein",
  requires: ["seqstar:format/seqviewspec"],
  provides: ["seqstar:case/cds-protein", "seqstar:translator/cds-nucleotide-protein"],
  setup(context) {
    const config = cdsProteinConfig;
    const [forward, reverse] = createCdsTranslators(config);
    context.translators.register(forward);
    context.translators.register(reverse);
    context.messageSchemas.register("cds-protein.mapping", "0.1.0", statusSchema);
    context.addProcessor({
      id: "p70.cds-diagnostics",
      types: ["interaction.native"],
      async process(incoming, processorContext, signal) {
        const event = incoming.payload as unknown as InteractionEvent;
        if (event.interaction !== "hover" && event.interaction !== "select") return;
        const fromNucleotide = event.origin.componentId === options.nucleotideComponent;
        const fromProtein = event.origin.componentId === options.proteinComponent;
        if (!fromNucleotide && !fromProtein) return;
        const target = fromNucleotide ? config.proteinSpace : config.nucleotideSpace;
        if (event.phase === "clear") {
          const status: CdsStatus = {
            direction: fromNucleotide ? "nucleotide-to-protein" : "protein-to-nucleotide",
            status: "unmapped",
            targetCount: 0,
            config: { ...config.cds },
            diagnostics: [],
          };
          processorContext.fabric.publish(
            message("cds-protein.mapping", status, incoming.correlationId, incoming.id),
          );
          return;
        }
        const mapped = await processorContext.translators.map(
          {
            loci: event.loci,
            target,
            policy: {
              preferredTranslatorIds: [fromNucleotide ? forward.id : reverse.id],
              maxSteps: 1,
            },
          },
          signal,
        );
        if (signal.aborted) return;
        const association = mapped.associations[0];
        const status: CdsStatus = {
          direction: fromNucleotide ? "nucleotide-to-protein" : "protein-to-nucleotide",
          status: association?.status ?? "unmapped",
          targetCount: mapped.associations.flatMap((item) => item.targets).length,
          config: { ...config.cds },
          diagnostics: mapped.diagnostics.map((item) => ({
            code: item.code,
            message: item.message,
          })),
        };
        processorContext.fabric.publish(
          message("cds-protein.mapping", status, incoming.correlationId, incoming.id),
        );
      },
    });
    const correlationId = crypto.randomUUID();
    context.fabric.publish({
      ...message(
        "visualization.seqviewspec.request",
        {
          format: "seqviewspec",
          requestId: "P70-nucleotide-initial",
          mode: "replace",
          document: cdsNucleotideDocument,
          viewId: "case5-nucleotide-main",
        },
        correlationId,
      ),
      target: { component: options.nucleotideComponent },
    });
    context.fabric.publish({
      ...message(
        "visualization.seqviewspec.request",
        {
          format: "seqviewspec",
          requestId: "P70-protein-initial",
          mode: "replace",
          document: cdsProteinDocument,
          viewId: "case5-protein-main",
        },
        correlationId,
      ),
      target: { component: options.proteinComponent },
    });
    return undefined;
  },
});
