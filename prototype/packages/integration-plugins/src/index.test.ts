import {
  createEventFabric,
  createMessageSchemaRegistry,
  createTranslatorRegistry,
  type HarnessPluginContext,
  installCoreMessageSchemas,
} from "@seq-star/harness-core";
import { describe, expect, it } from "vitest";
import {
  createCheckedFixtureProvider,
  createCheckedFixtureProviderPlugin,
  createIdentityTranslatorPlugin,
  createRendererPortabilityPlugin,
  referenceViewerDiagnosticFixture,
  rendererPortabilityDocument,
  rendererPortabilityDocumentDigest,
  rendererPortabilitySequenceSpace,
} from "./index.js";

const context = (): {
  readonly context: HarnessPluginContext;
  readonly messages: unknown[];
  readonly translators: ReturnType<typeof createTranslatorRegistry>;
} => {
  const schemas = createMessageSchemaRegistry();
  installCoreMessageSchemas(schemas);
  const fabric = createEventFabric({ schemas });
  const messages: unknown[] = [];
  fabric.observe().subscribe((message) => messages.push(message));
  const translators = createTranslatorRegistry();
  return {
    messages,
    translators,
    context: {
      fabric,
      translators,
      components: {
        get: () => undefined,
        findByCapability: () => [],
        changes: fabric.observe() as never,
      },
      messageSchemas: schemas,
      addProcessor: () => ({ dispose: () => undefined }),
      addRoute: () => ({ dispose: () => undefined }),
    },
  };
};

describe("checked fixture and translator plugins", () => {
  it("publishes byte-equivalent P04637 documents to both renderer instances", async () => {
    expect(rendererPortabilityDocument.sequences[0]?.residues).toHaveLength(393);
    expect(rendererPortabilityDocument.id).toBe("uniprot-P04637-renderer-portability");
    expect(rendererPortabilityDocumentDigest()).resolves.toMatch(/^sha256-[a-f0-9]{64}$/u);
    const harness = context();
    const plugin = createRendererPortabilityPlugin({
      referenceComponent: "base-sequence",
      nightingaleComponent: "nightingale-sequence",
    });
    const cleanup = plugin.setup(harness.context, {});
    const requests = harness.messages.filter(
      (
        entry,
      ): entry is {
        readonly payload: { readonly document: unknown };
        readonly target: { readonly component: string };
      } =>
        typeof entry === "object" &&
        entry !== null &&
        "type" in entry &&
        entry.type === "visualization.seqviewspec.request",
    );
    expect(requests.map((entry) => entry.target.component)).toEqual([
      "base-sequence",
      "nightingale-sequence",
    ]);
    expect(requests[0]?.payload.document).toEqual(requests[1]?.payload.document);
    expect(
      harness.translators.findPaths(
        rendererPortabilitySequenceSpace,
        rendererPortabilitySequenceSpace,
      ),
    ).toEqual([{ translatorIds: [], cost: 0 }]);
    cleanup && "dispose" in cleanup && cleanup.dispose();
  });

  it("returns sorted detached immutable fixture values", () => {
    const provider = createCheckedFixtureProvider([
      { ...referenceViewerDiagnosticFixture, id: "z-fixture" },
      referenceViewerDiagnosticFixture,
    ]);
    expect(provider.capabilities).toEqual(["seqstar:prototype/fixture-provider"]);
    expect(provider.list().map((item) => item.id)).toEqual([
      "reference-viewer-diagnostic",
      "z-fixture",
    ]);
    const first = provider.require("reference-viewer-diagnostic");
    expect(Object.isFrozen(first.value.document)).toBe(true);
    expect(() => ((first.value.document as { id: string }).id = "mutation")).toThrow();
  });

  it("publishes one deterministic checked request during plugin setup and nothing after cleanup", () => {
    const provider = createCheckedFixtureProvider([referenceViewerDiagnosticFixture]);
    const harness = context();
    const plugin = createCheckedFixtureProviderPlugin(provider, {
      fixtureId: "reference-viewer-diagnostic",
      targetComponent: "viewer",
      messageId: "e56f6535-ca7d-4d1d-8d30-64b3429ce5e7",
      correlationId: "a9567c3f-0557-4a5c-ae78-cb606eb8d4c1",
      timestamp: "2026-08-20T00:00:00.000Z",
    });
    const cleanup = plugin.setup(harness.context, {});
    expect(harness.messages).toContainEqual(
      expect.objectContaining({
        id: "e56f6535-ca7d-4d1d-8d30-64b3429ce5e7",
        type: "visualization.seqviewspec.request",
        payload: referenceViewerDiagnosticFixture.value,
      }),
    );
    cleanup && "dispose" in cleanup && cleanup.dispose();
    expect(harness.messages).toHaveLength(1);
  });

  it("rejects invalid and unsafe fixture requests before publication", () => {
    const invalid = (document: unknown) =>
      ({
        ...referenceViewerDiagnosticFixture,
        value: { ...referenceViewerDiagnosticFixture.value, document },
      }) as never;
    expect(() => createCheckedFixtureProvider([invalid({})])).toThrow();
    expect(() => createCheckedFixtureProvider([invalid({ value: Number.NaN })])).toThrow();
    expect(() => createCheckedFixtureProvider([invalid({ value: () => undefined })])).toThrow();
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    expect(() => createCheckedFixtureProvider([invalid(cycle)])).toThrow();
  });

  it("registers and unregisters exact identity through the public translator registry", () => {
    const harness = context();
    const plugin = createIdentityTranslatorPlugin({ id: "same", kind: "sequence", length: 3 });
    const cleanup = plugin.setup(harness.context, {});
    expect(
      harness.translators.findPaths(
        { id: "same", kind: "sequence" },
        { id: "same", kind: "sequence" },
      ),
    ).toEqual([{ translatorIds: [], cost: 0 }]);
    expect(() =>
      harness.translators.register({
        id: "seqstar.identity.same",
        source: { kind: "sequence" },
        target: { kind: "sequence" },
        map: async () => ({ translatorIds: [], associations: [], diagnostics: [] }),
      }),
    ).toThrow();
    cleanup && "dispose" in cleanup && cleanup.dispose();
    expect(() =>
      harness.translators.register({
        id: "seqstar.identity.same",
        source: { kind: "sequence" },
        target: { kind: "sequence" },
        map: async () => ({ translatorIds: [], associations: [], diagnostics: [] }),
      }),
    ).not.toThrow();
  });
});
