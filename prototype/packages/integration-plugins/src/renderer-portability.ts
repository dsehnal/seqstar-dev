import type { HarnessPluginSpec } from "@seq-star/harness-core";
import { type CoordinateSpace, createIdentityTranslator } from "@seq-star/seq-coords";
import { digestSeqViewSpec, type SeqViewSpec, validateSeqViewSpec } from "@seq-star/seq-view-spec";

export const rendererPortabilitySequenceSpace: CoordinateSpace = Object.freeze({
  id: "uniprot-P04637-sequence",
  kind: "sequence",
  length: 393,
});

const tp53 =
  "MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGP" +
  "DEAPRMPEAAPPVAPAPAAPTPAAPAPAPSWPLSSSVPSQKTYQGSYGFRLGFLHSGTAK" +
  "SVTCTYSPALNKMFCQLAKTCPVQLWVDSTPPPGTRVRAMAIYKQSQHMTEVVRRCPHHE" +
  "RCSDSDGLAPPQHLIRVEGNLRVEYLDDRNTFRHSVVVPYEPPEVGSDCTTIHYNYMCNS" +
  "SCMGGMNRRPILTIITLEDSSGNLLGRNSFEVRVCACPGRDRRTEEENLRKKGEPHHELP" +
  "PGSTKRALPNNTSSSPQPKKKPLDGEYFTLQIRGRERFEMFRELNEALELKDAQAGKEPG" +
  "GSRAHSSHLKSKKGQSTSRHKKLMFKTEGPDSD";

// This is the exact checked-in `expected/variant-density.tsv` transform, copied
// into the offline plugin rather than fetched at runtime.
const variantDensity = [
  0, 0, 0, 0, 1, 1, 1, 1, 0, 1, 2, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1, 0, 1,
  1, 1, 1, 2, 0, 2, 0, 0, 1, 1, 3, 1, 2, 2, 1, 3, 0, 0, 1, 2, 2, 0, 2, 0, 2, 3, 3, 2, 1, 2, 0, 1, 2,
  3, 2, 4, 1, 1, 5, 3, 1, 3, 2, 1, 1, 3, 2, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 1, 3, 2, 2, 2, 3, 3, 2, 2,
  1, 2, 1, 0, 2, 5, 2, 3, 2, 3, 6, 4, 2, 6, 0, 1, 3, 2, 3, 2, 4, 1, 1, 2, 5, 5, 7, 5, 4, 4, 6, 7, 9,
  7, 5, 7, 5, 4, 5, 5, 5, 7, 7, 5, 5, 5, 5, 6, 6, 3, 6, 6, 6, 7, 6, 6, 6, 6, 9, 7, 7, 10, 6, 6, 6,
  5, 5, 6, 11, 6, 6, 6, 5, 6, 6, 7, 7, 9, 9, 8, 6, 6, 3, 2, 5, 6, 6, 6, 2, 6, 6, 5, 7, 9, 6, 7, 5,
  4, 5, 4, 6, 4, 7, 6, 7, 6, 2, 7, 8, 4, 7, 5, 5, 5, 5, 7, 6, 6, 5, 6, 6, 5, 6, 6, 4, 6, 5, 4, 8, 5,
  5, 4, 6, 6, 8, 7, 6, 6, 7, 7, 7, 6, 6, 8, 9, 11, 6, 9, 8, 10, 10, 7, 5, 5, 8, 6, 4, 4, 7, 9, 6, 5,
  6, 6, 5, 4, 4, 5, 6, 6, 6, 8, 5, 9, 6, 6, 6, 6, 7, 4, 6, 9, 7, 6, 4, 6, 7, 5, 5, 5, 3, 6, 7, 4, 6,
  4, 8, 5, 5, 4, 4, 5, 4, 4, 4, 5, 2, 3, 2, 2, 2, 4, 2, 4, 1, 3, 2, 5, 1, 3, 1, 2, 2, 5, 3, 3, 1, 2,
  3, 2, 3, 3, 1, 0, 2, 3, 0, 4, 2, 2, 0, 1, 3, 1, 2, 0, 1, 2, 2, 1, 0, 0, 1, 1, 3, 0, 2, 0, 2, 0, 2,
  0, 0, 1, 3, 2, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0,
] as const;

const rendererPortabilityDocumentValue: SeqViewSpec = {
  kind: "seq-view-spec",
  version: "0.1.0",
  id: "uniprot-P04637-renderer-portability",
  metadata: {
    label: "UniProt TP53 / P04637 renderer portability",
    description:
      "Offline deterministic P04637 case derived from approved checked-in fixture transforms.",
  },
  sequences: [
    {
      id: "P04637",
      coordinateSpace: rendererPortabilitySequenceSpace.id,
      alphabet: "protein",
      residues: tp53,
      metadata: { label: "Cellular tumor antigen p53" },
      identifiers: [{ namespace: "uniprot", value: "P04637", version: "4" }],
      provenance: {
        label: "UniProtKB P04637",
        uri: "https://www.uniprot.org/uniprotkb/P04637/entry",
        description: "CC BY 4.0; checked in for offline prototype use.",
      },
    },
  ],
  annotations: [
    {
      id: "p53-overlapping-regions",
      kind: "loci",
      semanticType: "uniprot.feature.region",
      provenance: {
        label: "UniProt P04637 feature subset",
        generatedBy: "renderer-portability plugin",
      },
      items: [
        {
          id: "transactivation",
          label: "Transactivation region",
          loci: [
            { kind: "interval", space: rendererPortabilitySequenceSpace.id, start: 0, end: 80 },
          ],
          value: "region",
        },
        {
          id: "proline-rich",
          label: "Proline-rich overlapping region",
          loci: [
            { kind: "interval", space: rendererPortabilitySequenceSpace.id, start: 55, end: 100 },
          ],
          value: "composition",
        },
        {
          id: "dna-binding",
          label: "DNA-binding region",
          loci: [
            { kind: "interval", space: rendererPortabilitySequenceSpace.id, start: 94, end: 293 },
          ],
          value: "domain",
        },
      ],
    },
    {
      id: "p53-categorical-sites",
      kind: "loci",
      semanticType: "uniprot.feature.site",
      provenance: {
        label: "UniProt P04637 categorical feature subset",
        generatedBy: "renderer-portability plugin",
      },
      items: [
        {
          id: "phosphosite-S15",
          label: "Modified residue S15",
          loci: [{ kind: "point", space: rendererPortabilitySequenceSpace.id, position: 14 }],
          value: "modified",
        },
        {
          id: "binding-K120",
          label: "Binding site K120",
          loci: [{ kind: "point", space: rendererPortabilitySequenceSpace.id, position: 119 }],
          value: "binding",
        },
        {
          id: "site-R248",
          label: "Functional site R248",
          loci: [{ kind: "point", space: rendererPortabilitySequenceSpace.id, position: 247 }],
          value: "site",
        },
      ],
    },
    {
      id: "p53-variant-density",
      kind: "values",
      semanticType: "uniprot.natural-variant-density",
      space: rendererPortabilitySequenceSpace.id,
      valueType: "number",
      values: { encoding: "dense", data: variantDensity },
      provenance: {
        label: "P04637 Natural variant density",
        description:
          "Exact deterministic count transform from checked-in expected/variant-density.tsv; no imputation.",
        generatedBy: "P01 fixture normalization",
      },
    },
    {
      id: "p53-residue-classes",
      kind: "values",
      semanticType: "uniprot.feature.residue-class",
      space: rendererPortabilitySequenceSpace.id,
      valueType: "category",
      values: {
        encoding: "sparse",
        data: [
          { position: 14, value: "modified" },
          { position: 119, value: "binding" },
          { position: 247, value: "site" },
        ],
      },
      provenance: {
        label: "P04637 categorical residue features",
        generatedBy: "renderer-portability plugin",
      },
    },
  ],
  views: [
    {
      id: "P04637-main",
      axis: {
        segments: [
          {
            id: "P04637-axis",
            space: rendererPortabilitySequenceSpace.id,
            start: 0,
            end: 393,
            label: "P04637",
          },
        ],
        ruler: { visible: true, numbering: "one-based" },
      },
      sections: [
        {
          id: "P04637-section",
          tracks: [
            {
              id: "sequence",
              label: "Residues / navigation",
              layers: [
                {
                  id: "letters",
                  representation: "sequence",
                  sequence: "P04637",
                  showLetters: true,
                },
              ],
            },
            {
              id: "regions",
              label: "Overlapping regions",
              layers: [
                {
                  id: "region-blocks",
                  representation: "blocks",
                  annotation: "p53-overlapping-regions",
                  laneMode: "stack",
                  color: {
                    kind: "categorical",
                    field: "value",
                    colors: {
                      '"region"': "#2563EB",
                      '"composition"': "#7C3AED",
                      '"domain"': "#059669",
                    },
                    fallback: "#64748B",
                  },
                },
              ],
            },
            {
              id: "sites",
              label: "Categorical sites",
              layers: [
                {
                  id: "site-markers",
                  representation: "markers",
                  annotation: "p53-categorical-sites",
                  shape: "diamond",
                  color: {
                    kind: "categorical",
                    field: "value",
                    colors: {
                      '"modified"': "#DC2626",
                      '"binding"': "#D97706",
                      '"site"': "#7C3AED",
                    },
                    fallback: "#64748B",
                  },
                },
              ],
            },
            {
              id: "variant-bars",
              label: "Natural variant density",
              layers: [
                {
                  id: "variant-density-bars",
                  representation: "bars",
                  annotation: "p53-variant-density",
                  scale: { domain: [0, 11], baseline: 0, clamp: true },
                  color: {
                    kind: "continuous",
                    field: "value",
                    domain: [0, 11],
                    range: ["#DBEAFE", "#1D4ED8"],
                    missing: "#CBD5E1",
                  },
                  fallback: {
                    representation: "heatmap",
                    color: {
                      kind: "continuous",
                      field: "value",
                      domain: [0, 11],
                      range: ["#DBEAFE", "#1D4ED8"],
                      missing: "#CBD5E1",
                    },
                  },
                },
              ],
            },
            {
              id: "variant-swatch",
              label: "Variant density swatch",
              layers: [
                {
                  id: "categorical-residue-swatch",
                  representation: "swatch",
                  annotation: "p53-residue-classes",
                  color: {
                    kind: "categorical",
                    field: "value",
                    colors: {
                      '"modified"': "#DC2626",
                      '"binding"': "#D97706",
                      '"site"': "#7C3AED",
                    },
                    fallback: "#E2E8F0",
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const checked = validateSeqViewSpec(rendererPortabilityDocumentValue);
if (!checked.ok)
  throw new Error(
    `Renderer portability document is invalid: ${checked.diagnostics.map((entry) => entry.code).join(", ")}`,
  );

/** One static JSON document is shared by target-specific request envelopes. */
const freezeJsonTree = <Value>(value: Value): Value => {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) freezeJsonTree(child);
  return Object.freeze(value);
};

export const rendererPortabilityDocument = freezeJsonTree(rendererPortabilityDocumentValue);

export const rendererPortabilityDocumentDigest = (): Promise<string> =>
  digestSeqViewSpec(rendererPortabilityDocument);

export interface RendererPortabilityPluginOptions {
  readonly referenceComponent: string;
  readonly nightingaleComponent: string;
}

/** Publishes one frozen SeqViewSpec payload to both independent renderer components. */
export const createRendererPortabilityPlugin = (
  options: RendererPortabilityPluginOptions,
): HarnessPluginSpec => ({
  id: "seqstar.renderer-portability",
  provides: ["seqstar:prototype/renderer-portability"],
  setup(context) {
    const registration = context.translators.register(
      createIdentityTranslator("seqstar.identity.uniprot-P04637", rendererPortabilitySequenceSpace),
    );
    const correlationId = "cc339356-aedf-4da6-a686-23ff3fa6853d";
    for (const [target, requestId] of [
      [options.referenceComponent, "P04637-reference-initial"],
      [options.nightingaleComponent, "P04637-nightingale-initial"],
    ] as const)
      context.fabric.publish({
        id:
          target === options.referenceComponent
            ? "ad977d44-609f-4da8-a6a6-cc52b795708e"
            : "318b4831-3ec5-4da6-b7e6-0fad8097372f",
        type: "visualization.seqviewspec.request",
        version: "0.1.0",
        source: { plugin: "seqstar.renderer-portability" },
        target: { component: target },
        correlationId,
        timestamp: "2026-08-20T00:00:00.000Z",
        payload: {
          format: "seqviewspec",
          requestId,
          mode: "replace",
          document: rendererPortabilityDocument,
          viewId: "P04637-main",
        },
      } as never);
    return registration;
  },
});
