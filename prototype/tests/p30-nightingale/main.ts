import {
  createEventFabric,
  createMessageSchemaRegistry,
  createTranslatorRegistry,
  type HarnessMessage,
  installCoreMessageSchemas,
} from "@seq-star/harness-core";
import type { SeqViewSpec } from "@seq-star/seq-view-spec";
import { NightingaleWrapper } from "@seq-star/wrapper-nightingale";

const base = {
  kind: "seq-view-spec",
  version: "0.1.0",
  sequences: [{ id: "sequence", coordinateSpace: "space", alphabet: "protein", residues: "MKTAY" }],
} as const;
const axis = { segments: [{ id: "axis", space: "space", start: 0, end: 5 }] } as const;
const documentA: SeqViewSpec = {
  ...base,
  id: "document-a",
  annotations: [
    {
      id: "features",
      kind: "loci",
      semanticType: "test.feature",
      items: [{ id: "shared", loci: [{ kind: "interval", space: "space", start: 1, end: 4 }] }],
    },
  ],
  views: [
    {
      id: "main",
      axis,
      sections: [
        {
          id: "section",
          tracks: [
            {
              id: "sequence-track",
              layers: [{ id: "sequence-layer", representation: "sequence", sequence: "sequence" }],
            },
            {
              id: "feature-track",
              layers: [{ id: "feature-layer", representation: "blocks", annotation: "features" }],
            },
          ],
        },
      ],
    },
  ],
};
const unsupportedDocument: SeqViewSpec = {
  ...base,
  id: "document-unsupported",
  annotations: [
    {
      id: "relationships",
      kind: "relationships",
      semanticType: "test.relationship",
      items: [
        {
          id: "link",
          endpoints: [
            { role: "source", loci: [{ kind: "point", space: "space", position: 0 }] },
            { role: "target", loci: [{ kind: "point", space: "space", position: 3 }] },
          ],
        },
      ],
    },
  ],
  views: [
    {
      id: "main",
      axis,
      sections: [
        {
          id: "section",
          tracks: [
            {
              id: "sequence-track",
              layers: [{ id: "sequence-layer", representation: "sequence", sequence: "sequence" }],
            },
            {
              id: "links-track",
              layers: [{ id: "links-layer", representation: "links", annotation: "relationships" }],
            },
          ],
        },
      ],
    },
  ],
};
const fallbackDocument: SeqViewSpec = {
  ...base,
  id: "document-fallback",
  annotations: [
    {
      id: "values",
      kind: "values",
      semanticType: "test.values",
      space: "space",
      valueType: "number",
      values: { encoding: "dense", data: [0, 1, 2, 3, 4] },
    },
  ],
  views: [
    {
      id: "main",
      axis,
      sections: [
        {
          id: "section",
          tracks: [
            {
              id: "values-track",
              layers: [
                {
                  id: "values-layer",
                  representation: "bars",
                  annotation: "values",
                  color: {
                    kind: "continuous",
                    field: "value",
                    domain: [0, 4],
                    range: ["#ffffff", "#000000"],
                    missing: "#cccccc",
                  },
                  fallback: {
                    representation: "heatmap",
                    color: {
                      kind: "continuous",
                      field: "value",
                      domain: [0, 4],
                      range: ["#ffffff", "#000000"],
                      missing: "#cccccc",
                    },
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
const linegraphDocument: SeqViewSpec = {
  ...fallbackDocument,
  id: "document-linegraph",
  views: [
    {
      id: "main",
      axis,
      sections: [
        {
          id: "section",
          tracks: [
            {
              id: "values-track",
              layers: [
                {
                  id: "values-layer",
                  representation: "bars",
                  annotation: "values",
                  color: { kind: "fixed", color: "#2563eb" },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const uuid = (): string => crypto.randomUUID();
const setup = async (id: string, target: HTMLElement, failureViewPolicy: "retain" | "clear") => {
  const schemas = createMessageSchemaRegistry();
  installCoreMessageSchemas(schemas);
  const fabric = createEventFabric({ schemas });
  const messages: HarnessMessage[] = [];
  fabric.observe().subscribe((message) => messages.push(message));
  const wrapper = new NightingaleWrapper({ id, target, config: { failureViewPolicy } });
  await wrapper.start({
    fabric,
    translators: createTranslatorRegistry(),
    signal: new AbortController().signal,
    reportCapabilities() {},
    reportCoordinateSpaces() {},
  });
  const load = async (document: SeqViewSpec, requestId: string) => {
    fabric.publish({
      id: uuid(),
      type: "visualization.seqviewspec.request",
      version: "0.1.0",
      source: { plugin: "p30-browser" },
      target: { component: id },
      correlationId: uuid(),
      timestamp: new Date().toISOString(),
      payload: { format: "seqviewspec", requestId, mode: "replace", document, viewId: "main" },
    });
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline) {
      const lifecycle = messages.findLast((message) => {
        const payload = message.payload as { requestId?: string; status?: string };
        return (
          message.type === "lifecycle.visualization" &&
          payload.requestId === requestId &&
          payload.status !== "accepted"
        );
      });
      if (lifecycle !== undefined) return lifecycle.payload;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Timed out waiting for ${requestId}`);
  };
  return { fabric, load, messages, wrapper };
};

const retainTarget = document.querySelector<HTMLElement>("#retain");
const clearTarget = document.querySelector<HTMLElement>("#clear");
const status = document.querySelector<HTMLElement>("#status");
if (retainTarget === null || clearTarget === null || status === null)
  throw new Error("Missing P30 fixture host.");
const retain = await setup("retain", retainTarget, "retain");
const clear = await setup("clear", clearTarget, "clear");
await retain.load(documentA, "retain-a");
await clear.load(documentA, "clear-a");

const nativeMessages = (probe: typeof retain) =>
  probe.messages.filter((message) => message.type === "interaction.native");
const dispatchClick = (target: Element, clientX = 1): void =>
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX, clientY: 1 }));

Object.assign(window, {
  p30Probe: {
    async retainFailure() {
      const lifecycle = await retain.load(unsupportedDocument, "retain-b");
      return {
        lifecycle,
        rootCount: retainTarget.querySelectorAll('[data-seqstar-nightingale="root"]').length,
        hasA: Boolean(
          retainTarget.querySelector('[data-seqstar-native-id*="document:10:document-a"]'),
        ),
        stagingCount: retainTarget.querySelectorAll("[data-seqstar-nightingale-staging]").length,
      };
    },
    clickFeature() {
      const before = nativeMessages(retain).length;
      const feature = retainTarget.querySelector("rect.outer-rectangle.feature");
      if (feature === null) throw new Error("Missing actual Nightingale feature node.");
      dispatchClick(feature);
      return nativeMessages(retain)
        .slice(before)
        .map((message) => message.payload);
    },
    clickSequence() {
      const before = nativeMessages(retain).length;
      const residue = retainTarget.querySelector("nightingale-sequence rect.base_bg.feature");
      if (residue === null) throw new Error("Missing actual Nightingale residue node.");
      dispatchClick(residue);
      return nativeMessages(retain)
        .slice(before)
        .map((message) => message.payload);
    },
    async clearFailure() {
      const lifecycle = await clear.load(unsupportedDocument, "clear-b");
      return {
        lifecycle,
        rootCount: clearTarget.querySelectorAll('[data-seqstar-nightingale="root"]').length,
        stagingCount: clearTarget.querySelectorAll("[data-seqstar-nightingale-staging]").length,
      };
    },
    async declaredFallback() {
      const lifecycle = await retain.load(fallbackDocument, "fallback");
      return {
        lifecycle,
        trackCount: retainTarget.querySelectorAll("nightingale-track").length,
        linegraphCount: retainTarget.querySelectorAll("nightingale-linegraph-track").length,
      };
    },
    async clickLinegraph() {
      await retain.load(linegraphDocument, "linegraph");
      const before = nativeMessages(retain).length;
      const element = retainTarget.querySelector("nightingale-linegraph-track") as
        | (HTMLElement & { getXFromSeqPosition(position: number): number })
        | null;
      const overlay = element?.querySelector("g.mouse-over-effects > rect");
      if (element === null || overlay === null || overlay === undefined)
        throw new Error("Missing actual Nightingale linegraph overlay.");
      const x = overlay.getBoundingClientRect().left + element.getXFromSeqPosition(4);
      dispatchClick(overlay, x);
      return nativeMessages(retain)
        .slice(before)
        .map((message) => message.payload);
    },
  },
});
status.dataset.status = "ready";
status.textContent = "ready";
