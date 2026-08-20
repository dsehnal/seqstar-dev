import {
  type HarnessPluginSpec,
  payloadSchema,
  VisualizationRequestSchema,
} from "@seq-star/harness-core";
import { type CoordinateSpace, createIdentityTranslator } from "@seq-star/seq-coords";
import { type SeqViewSpec, validateSeqViewSpec } from "@seq-star/seq-view-spec";

type FixtureValue =
  | string
  | number
  | boolean
  | null
  | readonly FixtureValue[]
  | { readonly [key: string]: FixtureValue };

type FixtureVisualizationRequest = {
  readonly format: "seqviewspec";
  readonly requestId: string;
  readonly mode: "replace";
  readonly document: FixtureValue;
  readonly viewId?: string;
};

export interface CheckedFixture {
  readonly id: string;
  readonly mediaType: string;
  readonly sha256: string;
  readonly value: FixtureVisualizationRequest;
}

export interface CheckedFixtureProvider {
  readonly capabilities: readonly ["seqstar:prototype/fixture-provider"];
  list(): readonly Pick<CheckedFixture, "id" | "mediaType" | "sha256">[];
  get(id: string): CheckedFixture | undefined;
  require(id: string): CheckedFixture;
}

const copyValue = (value: FixtureValue): FixtureValue => {
  if (Array.isArray(value)) return Object.freeze(value.map(copyValue));
  if (value !== null && typeof value === "object") {
    const record = value as { readonly [key: string]: FixtureValue };
    return Object.freeze(
      Object.fromEntries(
        Object.keys(record)
          .sort((left, right) => left.localeCompare(right))
          .map((key) => [key, copyValue(record[key] as FixtureValue)]),
      ),
    );
  }
  return value;
};

const detachedFixture = (fixture: CheckedFixture): CheckedFixture =>
  Object.freeze({
    id: fixture.id,
    mediaType: fixture.mediaType,
    sha256: fixture.sha256,
    value: copyValue(fixture.value) as FixtureVisualizationRequest,
  });
const requestShape = payloadSchema(VisualizationRequestSchema);
const validFixtureRequest = (request: FixtureVisualizationRequest): boolean => {
  if (!requestShape.check(request) || request.format !== "seqviewspec") return false;
  const document = validateSeqViewSpec(request.document);
  return (
    document.ok &&
    (request.viewId === undefined ||
      document.value.views.some((view) => view.id === request.viewId))
  );
};

/** Local-only, deterministic fixture access. Reads are detached and immutable. */
export const createCheckedFixtureProvider = (
  fixtures: readonly CheckedFixture[],
): CheckedFixtureProvider => {
  const byId = new Map<string, CheckedFixture>();
  for (const fixture of fixtures) {
    if (!/^[a-zA-Z0-9._-]+$/u.test(fixture.id))
      throw new Error(`Fixture ID '${fixture.id}' is not stable.`);
    if (!/^sha256:[a-f0-9]{64}$/u.test(fixture.sha256))
      throw new Error(`Fixture '${fixture.id}' must include a sha256 digest.`);
    if (byId.has(fixture.id)) throw new Error(`Duplicate fixture '${fixture.id}'.`);
    if (!validFixtureRequest(fixture.value))
      throw new Error(
        `Fixture '${fixture.id}' must contain a JSON-safe valid SeqViewSpec request.`,
      );
    byId.set(fixture.id, detachedFixture(fixture));
  }
  const summaries = Object.freeze(
    [...byId.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(({ id, mediaType, sha256 }) => Object.freeze({ id, mediaType, sha256 })),
  );
  return Object.freeze({
    capabilities: ["seqstar:prototype/fixture-provider"] as const,
    list: () => summaries.map((item) => Object.freeze({ ...item })),
    get: (fixtureId: string) => {
      const fixture = byId.get(fixtureId);
      return fixture === undefined ? undefined : detachedFixture(fixture);
    },
    require: (fixtureId: string) => {
      const fixture = byId.get(fixtureId);
      if (fixture === undefined) throw new Error(`Unknown checked fixture '${fixtureId}'.`);
      return detachedFixture(fixture);
    },
  });
};

export interface FixtureInitialRequest {
  readonly fixtureId: string;
  readonly targetComponent: string;
  readonly messageId: string;
  readonly correlationId: string;
  readonly timestamp: string;
}

/** Publishes one checked fixture request after all application components are ready. */
export const createCheckedFixtureProviderPlugin = (
  provider: CheckedFixtureProvider,
  initial?: FixtureInitialRequest,
): HarnessPluginSpec => ({
  id: "seqstar.fixture-provider",
  provides: ["seqstar:prototype/fixture-provider"],
  setup(context) {
    if (initial === undefined) return undefined;
    const fixture = provider.require(initial.fixtureId);
    context.fabric.publish({
      id: initial.messageId,
      type: "visualization.seqviewspec.request",
      version: "0.1.0",
      source: { plugin: "seqstar.fixture-provider" },
      target: { component: initial.targetComponent },
      correlationId: initial.correlationId,
      timestamp: initial.timestamp,
      payload: fixture.value,
    } as never);
    return { dispose: () => undefined };
  },
});

export const createIdentityTranslatorPlugin = (
  space: CoordinateSpace,
  id = `seqstar.identity.${space.id}`,
): HarnessPluginSpec => ({
  id,
  provides: ["seqstar:translator/identity"],
  setup(context) {
    return context.translators.register(createIdentityTranslator(id, space));
  },
});

const referenceDocument: SeqViewSpec = {
  kind: "seq-view-spec",
  version: "0.1.0",
  id: "reference-viewer-diagnostic",
  sequences: [
    {
      id: "diagnostic-protein",
      coordinateSpace: "diagnostic-protein-space",
      alphabet: "protein",
      residues: "MKTAYIAKQRQISFVKSHFSRQDILDLWIYHTQGYFP",
    },
  ],
  annotations: [
    {
      id: "diagnostic-sites",
      kind: "loci",
      semanticType: "seqstar:diagnostic-site",
      items: [
        {
          id: "site-1",
          loci: [{ kind: "interval", space: "diagnostic-protein-space", start: 5, end: 12 }],
          value: "demo feature",
        },
      ],
    },
  ],
  views: [
    {
      id: "reference-main",
      axis: {
        segments: [{ id: "diagnostic-axis", space: "diagnostic-protein-space", start: 0, end: 37 }],
      },
      sections: [
        {
          id: "sequence-section",
          tracks: [
            {
              id: "residues",
              label: "Diagnostic sequence",
              layers: [
                { id: "letters", representation: "sequence", sequence: "diagnostic-protein" },
              ],
            },
            {
              id: "features",
              label: "Checked fixture annotation",
              layers: [
                { id: "feature-blocks", representation: "blocks", annotation: "diagnostic-sites" },
              ],
            },
          ],
        },
      ],
    },
  ],
};

export const referenceViewerDiagnosticFixture: CheckedFixture = {
  id: "reference-viewer-diagnostic",
  mediaType: "application/vnd.seqstar.seqviewspec+json",
  sha256: "sha256:e68ef46a83db0aa65b277c2c6cdd56c623a0c6b68b34a00bcf2798b9209add1e",
  value: {
    format: "seqviewspec",
    requestId: "reference-diagnostic-initial",
    mode: "replace",
    document: referenceDocument as unknown as FixtureValue,
    viewId: "reference-main",
  },
};

export interface IntegrationPluginsPackageBoundary {
  readonly packageName: "@seq-star/integration-plugins";
}

export {
  type AlignmentStructureColumnRow,
  type AlignmentStructureData,
  type AlignmentStructurePluginOptions,
  type AlignmentStructureTranslators,
  alignmentColumnSpace,
  createAlignmentStructurePlugin,
  createAlignmentStructureSeqViewSpec,
  createAlignmentStructureTranslators,
  createNeutral1A3nMvs,
  type P69905StructureRow,
  p69905SequenceSpace,
  p69905StructureSpace,
  parseAlignmentStructureMappingTsv,
  parseP69905StructureMappingTsv,
} from "./alignment-structure.js";
export {
  barnaseSequenceSpace,
  barnaseStructureSpace,
  barstarSequenceSpace,
  barstarStructureSpace,
  type ComplexContact,
  type ComplexMappingRow,
  type ComplexMvsGeneration,
  type ComplexPluginOptions,
  createComplexMappingTranslators,
  createComplexPlugin,
  createComplexSeqViewSpec,
  generateComplexMvs,
  parseComplexContactsTsv,
  parseComplexMappingTsv,
  parseSyntheticConfidenceTsv,
  type SyntheticConfidenceRow,
} from "./complex.js";
export {
  createRendererPortabilityPlugin,
  type RendererPortabilityPluginOptions,
  rendererPortabilityDocument,
  rendererPortabilityDocumentDigest,
  rendererPortabilitySequenceSpace,
} from "./renderer-portability.js";
export {
  createNeutral1TupMvs,
  createP04637MappingTranslators,
  createUniProtStructurePlugin,
  createUniProtStructureSeqViewSpec,
  generateUniProtAnnotationMvs,
  type P04637MappingRow,
  p53StructureSpace,
  parseP04637MappingTsv,
  type UniProtMvsGeneration,
  type UniProtStructurePluginOptions,
  uniprotSequenceSpace,
} from "./uniprot-structure.js";
