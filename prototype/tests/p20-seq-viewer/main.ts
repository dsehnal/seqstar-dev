import type { SeqViewSpec } from "../../packages/seq-view-spec/src/index.js";
import {
  createSeqViewer,
  type RepresentationName,
  type RepresentationProvider,
  type SeqViewer,
} from "../../packages/seq-viewer/src/index.js";

const fixtureDocument: SeqViewSpec = {
  kind: "seq-view-spec",
  version: "0.1.0",
  id: "viewer-document",
  sequences: [
    { id: "sequence", coordinateSpace: "sequence-space", alphabet: "protein", residues: "ACDE" },
  ],
  alignments: [
    {
      id: "alignment",
      coordinateSpace: "alignment-space",
      length: 4,
      members: [{ id: "member", sequence: "sequence", positions: [0, null, 1, 2] }],
    },
  ],
  annotations: [
    {
      id: "loci",
      kind: "loci",
      semanticType: "test:loci",
      items: [
        {
          id: "block",
          loci: [
            { kind: "interval", space: "sequence-space", start: 0, end: 2 },
            { kind: "point", space: "sequence-space", position: 3 },
          ],
        },
        { id: "overlap", loci: [{ kind: "interval", space: "sequence-space", start: 1, end: 3 }] },
        { id: "point-overlap", loci: [{ kind: "point", space: "sequence-space", position: 1 }] },
      ],
    },
    {
      id: "marker",
      kind: "loci",
      semanticType: "test:marker",
      items: [
        { id: "boundary-zero", loci: [{ kind: "boundary", space: "sequence-space", position: 0 }] },
        {
          id: "boundary-middle",
          loci: [{ kind: "boundary", space: "sequence-space", position: 2 }],
        },
        { id: "boundary-end", loci: [{ kind: "boundary", space: "sequence-space", position: 4 }] },
      ],
    },
    {
      id: "numbers",
      kind: "values",
      semanticType: "test:number",
      space: "sequence-space",
      valueType: "number",
      values: { encoding: "dense", data: [0, 0.5, 1, null] },
    },
    {
      id: "category",
      kind: "values",
      semanticType: "test:category",
      space: "sequence-space",
      valueType: "category",
      values: { encoding: "dense", data: ["a", "b", "a", null] },
    },
    {
      id: "relationships",
      kind: "relationships",
      semanticType: "test:relationship",
      items: [
        {
          id: "edge",
          endpoints: [
            {
              role: "from",
              loci: [
                { kind: "point", space: "sequence-space", position: 0 },
                { kind: "point", space: "sequence-space", position: 1 },
                { kind: "boundary", space: "sequence-space", position: 0 },
              ],
            },
            {
              role: "to",
              loci: [
                { kind: "point", space: "sequence-space", position: 3 },
                { kind: "boundary", space: "sequence-space", position: 2 },
                { kind: "boundary", space: "sequence-space", position: 4 },
              ],
            },
          ],
        },
      ],
    },
  ],
  views: [
    {
      id: "view",
      axis: {
        segments: [
          { id: "sequence-axis", space: "sequence-space", start: 0, end: 4 },
          { id: "alignment-axis", space: "alignment-space", start: 0, end: 4 },
        ],
        gap: 32,
      },
      sections: [
        {
          id: "section",
          tracks: [
            {
              id: "track",
              label: "Core track",
              height: 30,
              layers: [
                { id: "sequence-layer", representation: "sequence", sequence: "sequence" },
                { id: "alignment-layer", representation: "alignment", alignment: "alignment" },
                {
                  id: "blocks-layer",
                  representation: "blocks",
                  annotation: "loci",
                  laneMode: "stack",
                  opacity: 0.7,
                },
                {
                  id: "markers-layer",
                  representation: "markers",
                  annotation: "marker",
                  shape: "diamond",
                },
                {
                  id: "bars-layer",
                  representation: "bars",
                  annotation: "numbers",
                  scale: { domain: [0, 1], baseline: 0.5, clamp: true },
                },
                {
                  id: "heatmap-layer",
                  representation: "heatmap",
                  annotation: "numbers",
                  color: {
                    kind: "continuous",
                    field: "value",
                    domain: [0, 1],
                    range: ["#000000", "#ffffff"],
                    missing: "#ff0000",
                  },
                },
                {
                  id: "swatch-layer",
                  representation: "swatch",
                  annotation: "category",
                  color: {
                    kind: "categorical",
                    field: "value",
                    colors: { '"a"': "#00ff00", '"b"': "#0000ff" },
                    fallback: "#ff0000",
                  },
                },
                { id: "links-layer", representation: "links", annotation: "relationships" },
              ],
            },
            {
              id: "boundary-track",
              label: "Boundary track",
              height: 30,
              layers: [
                {
                  id: "boundary-layer",
                  representation: "markers",
                  annotation: "marker",
                  shape: "line",
                },
              ],
            },
            {
              id: "lane-track",
              label: "Lane track",
              height: 30,
              layers: [
                {
                  id: "lane-layer",
                  representation: "blocks",
                  annotation: "loci",
                  laneMode: "stack",
                },
              ],
            },
          ],
        },
        {
          id: "collapsed",
          initiallyCollapsed: true,
          tracks: [
            {
              id: "collapsed-track",
              layers: [
                {
                  id: "collapsed-layer",
                  representation: "sequence",
                  sequence: "sequence",
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
const target = document.querySelector<HTMLElement>("#viewer");
const status = document.querySelector<HTMLOutputElement>("#status");
if (!target || !status) throw new Error("P20 fixture is missing its host");
let viewer: SeqViewer;
const events: unknown[] = [];
const mount = async (): Promise<void> => {
  viewer?.dispose();
  viewer = createSeqViewer({
    target,
    presentation: {
      tracks: [
        {
          trackId: "track",
          action: {
            kind: "structure-profile",
            accessibleName: "Show Core track in 3D",
            tooltip: "Show Core track in 3D",
            icon: "box",
          },
        },
      ],
    },
  });
  viewer.interactions.subscribe((event) => events.push({ ...event, nativeEvent: undefined }));
  const result = await viewer.load(fixtureDocument, "view");
  status.dataset.status = result.status;
  status.textContent = JSON.stringify({ result, events });
};
await mount();

const alignmentActionHost = document.querySelector<HTMLElement>("#alignment-actions");
if (!alignmentActionHost) throw new Error("P20 fixture is missing its alignment action host");
const alignmentActionDocument: SeqViewSpec = {
  kind: "seq-view-spec",
  version: "0.1.0",
  id: "alignment-action-document",
  sequences: [
    {
      id: "alignment-sequence",
      coordinateSpace: "alignment-sequence-space",
      alphabet: "protein",
      residues: "A".repeat(118),
    },
  ],
  alignments: [
    {
      id: "PF00042.29",
      coordinateSpace: "alignment-action-space",
      length: 118,
      members: Array.from({ length: 32 }, (_, index) => ({
        id: `member-${index}`,
        sequence: "alignment-sequence",
        positions: Array.from({ length: 118 }, (_unused, position) => position),
      })),
    },
  ],
  views: [
    {
      id: "alignment-actions",
      axis: {
        segments: [{ id: "alignment-axis", space: "alignment-action-space", start: 0, end: 118 }],
      },
      sections: [
        {
          id: "alignment-section",
          tracks: [
            {
              id: "alignment-track",
              label: "Alignment member",
              layers: [
                {
                  id: "alignment-layer",
                  representation: "alignment",
                  alignment: "PF00042.29",
                },
                {
                  id: "alignment-layer-last",
                  representation: "alignment",
                  alignment: "PF00042.29",
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
let alignmentActionViewer: SeqViewer | undefined;
const alignmentActionEvents: unknown[] = [];
const mountAlignmentActions = async (): Promise<void> => {
  alignmentActionViewer?.dispose();
  alignmentActionEvents.length = 0;
  alignmentActionViewer = createSeqViewer({
    target: alignmentActionHost,
    presentation: {
      alignmentMemberActions: [
        {
          alignmentId: "PF00042.29",
          memberId: "member-5",
          label: "Show member 5 in 3D",
          kind: "structure",
        },
      ],
    },
  });
  alignmentActionViewer.interactions.subscribe((event) =>
    alignmentActionEvents.push({ ...event, nativeEvent: undefined }),
  );
  await alignmentActionViewer.load(alignmentActionDocument, "alignment-actions");
};
const testProvider = (representation: RepresentationName): RepresentationProvider => ({
  id: `test.${representation}`,
  representation,
  create: () => ({ representation, rendered: "exact" }),
});
const customProviderEvidence = async () => {
  const limitedHost = document.createElement("div");
  const limited = createSeqViewer({
    target: limitedHost,
    spec: { representations: [testProvider("sequence")] },
  });
  const result = await limited.load(fixtureDocument, "view");
  const capabilities = limited.capabilities;
  limited.dispose();
  const numeric = fixtureDocument.annotations?.find((item) => item.id === "numbers");
  if (!numeric) throw new Error("numeric annotation missing");
  const fallbackDocument: SeqViewSpec = {
    kind: "seq-view-spec",
    version: "0.1.0",
    id: "fallback-document",
    sequences: fixtureDocument.sequences,
    annotations: [numeric],
    views: [
      {
        id: "fallback-view",
        axis: { segments: [{ id: "fallback-axis", space: "sequence-space", start: 0, end: 4 }] },
        sections: [
          {
            id: "fallback-section",
            tracks: [
              {
                id: "fallback-track",
                layers: [
                  {
                    id: "fallback-layer",
                    representation: "heatmap",
                    annotation: "numbers",
                    color: {
                      kind: "continuous",
                      field: "value",
                      domain: [0, 1],
                      range: ["#000000", "#ffffff"],
                      missing: "#ff0000",
                    },
                    fallback: {
                      representation: "bars",
                      color: { kind: "fixed", color: "#ff0000" },
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
  const fallbackHost = document.createElement("div");
  const fallbackViewer = createSeqViewer({
    target: fallbackHost,
    spec: { representations: [testProvider("bars")] },
  });
  fallbackHost.style.width = "400px";
  fallbackHost.style.height = "100px";
  document.body.append(fallbackHost);
  fallbackViewer.resize();
  const fallback = await fallbackViewer.load(fallbackDocument, "fallback-view");
  const fallbackCanvas = fallbackHost.querySelector<HTMLCanvasElement>("canvas");
  const pixel = fallbackCanvas?.getContext("2d")?.getImageData(309, 25, 1, 1).data;
  fallbackViewer.dispose();
  fallbackHost.remove();
  const relationships = fixtureDocument.annotations?.find((item) => item.id === "relationships");
  if (!relationships) throw new Error("relationship annotation missing");
  const relationshipFallbackDocument: SeqViewSpec = {
    kind: "seq-view-spec",
    version: "0.1.0",
    id: "relationship-fallback-document",
    sequences: fixtureDocument.sequences,
    annotations: [relationships],
    views: [
      {
        id: "relationship-fallback-view",
        axis: {
          segments: [{ id: "relationship-axis", space: "sequence-space", start: 0, end: 4 }],
        },
        sections: [
          {
            id: "relationship-section",
            tracks: [
              {
                id: "relationship-track",
                layers: [
                  {
                    id: "relationship-layer",
                    representation: "links",
                    annotation: "relationships",
                    fallback: { representation: "markers" },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const relationshipHost = document.createElement("div");
  relationshipHost.style.width = "640px";
  relationshipHost.style.height = "100px";
  document.body.append(relationshipHost);
  const relationshipViewer = createSeqViewer({
    target: relationshipHost,
    spec: { representations: [testProvider("markers")] },
  });
  relationshipViewer.resize();
  const relationshipFallback = await relationshipViewer.load(
    relationshipFallbackDocument,
    "relationship-fallback-view",
  );
  const relationshipBox = relationshipHost.querySelector("canvas")?.getBoundingClientRect();
  const relationshipHits = relationshipBox
    ? [156, 398, 640].map((x) =>
        relationshipViewer.hitTest(relationshipBox.left + x, relationshipBox.top + 35),
      )
    : [];
  relationshipViewer.dispose();
  relationshipHost.remove();
  return {
    capabilities,
    result,
    fallback,
    fallbackPixel: pixel ? [...pixel] : [],
    relationshipFallback,
    relationshipHits,
  };
};
const throwingProviderEvidence = async () => {
  const baseView = fixtureDocument.views[0];
  if (!baseView) throw new Error("view missing");
  const documentWithTwoLayers: SeqViewSpec = {
    kind: "seq-view-spec",
    version: "0.1.0",
    id: "cleanup-document",
    sequences: fixtureDocument.sequences,
    views: [
      {
        id: "cleanup-view",
        axis: {
          segments: [
            baseView.axis.segments[0] ?? { id: "axis", space: "sequence-space", start: 0, end: 4 },
          ],
        },
        sections: [
          {
            id: "cleanup-section",
            tracks: [
              {
                id: "cleanup-track",
                layers: [
                  { id: "cleanup-one", representation: "sequence", sequence: "sequence" },
                  { id: "cleanup-two", representation: "sequence", sequence: "sequence" },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  let createIndex = 0;
  let successfulDisposals = 0;
  const disposingProvider: RepresentationProvider = {
    id: "test.disposing",
    representation: "sequence",
    create: () => {
      const index = createIndex++;
      return {
        representation: "sequence",
        rendered: "exact",
        dispose: () => {
          if (index === 0) throw new Error("expected disposer failure");
          successfulDisposals += 1;
        },
      };
    },
  };
  const host = document.createElement("div");
  const disposingViewer = createSeqViewer({
    target: host,
    spec: { representations: [disposingProvider] },
  });
  await disposingViewer.load(documentWithTwoLayers, "cleanup-view");
  const replacement = await disposingViewer.load(documentWithTwoLayers, "cleanup-view");
  disposingViewer.dispose();
  const throwingViewer = createSeqViewer({
    target: document.createElement("div"),
    spec: {
      representations: [
        {
          id: "test.throwing-create",
          representation: "sequence",
          create: () => {
            throw new Error("expected create failure");
          },
        },
      ],
    },
  });
  const createFailure = await throwingViewer.load(documentWithTwoLayers, "cleanup-view");
  throwingViewer.dispose();
  let behaviorCleanup = 0;
  const behaviorHost = document.createElement("div");
  const behaviorViewer = createSeqViewer({
    target: behaviorHost,
    spec: {
      representations: [testProvider("sequence")],
      behaviors: [
        {
          id: "throwing",
          install: () => () => {
            throw new Error("expected behavior failure");
          },
        },
        {
          id: "survivor",
          install: () => () => {
            behaviorCleanup += 1;
          },
        },
      ],
    },
  });
  behaviorViewer.dispose();
  behaviorViewer.dispose();
  return {
    replacement,
    successfulDisposals,
    createFailure,
    behaviorCleanup,
    behaviorDom: behaviorHost.children.length,
  };
};
const loadTall = async () => {
  const baseView = fixtureDocument.views[0];
  if (!baseView) throw new Error("tall view missing");
  const tall: SeqViewSpec = {
    ...fixtureDocument,
    id: "tall-document",
    views: [
      {
        ...baseView,
        axis: { ...baseView.axis, ruler: { visible: false } },
        sections: [
          {
            id: "tall-section",
            tracks: Array.from({ length: 40 }, (_, index) => ({
              id: `tall-track-${index}`,
              height: 25,
              label: `Tall ${index}`,
              layers: [
                {
                  id: `tall-layer-${index}`,
                  representation: "sequence" as const,
                  sequence: "sequence",
                },
              ],
            })),
          },
        ],
      },
    ],
  };
  await viewer.load(tall, "view");
  const root = target.querySelector<HTMLElement>("[data-seq-viewer=root]");
  if (!root) throw new Error("tall viewer missing");
  root.scrollTop = 500;
  root.dispatchEvent(new Event("scroll"));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  return root.scrollTop;
};
const delayedSizeEvidence = async () => {
  const host = document.createElement("div");
  host.style.width = "0";
  host.style.height = "0";
  document.body.append(host);
  const delayed = createSeqViewer({ target: host });
  await delayed.load(fixtureDocument, "view");
  const canvas = host.querySelector<HTMLCanvasElement>("canvas");
  const root = host.querySelector<HTMLElement>("[data-seq-viewer=root]");
  if (!canvas || !root) throw new Error("delayed viewer missing");
  const snapshot = () => ({
    width: canvas.width,
    height: canvas.height,
    canvasWidth: canvas.style.width,
    canvasHeight: canvas.style.height,
    rootHeight: root.style.height,
  });
  const frame = () =>
    new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  const hidden = snapshot();
  host.style.width = "640px";
  host.style.height = "280px";
  await frame();
  const initialized = snapshot();
  host.style.width = "0";
  host.style.height = "0";
  await frame();
  const preserved = snapshot();
  host.style.width = "480px";
  host.style.height = "240px";
  await frame();
  const resized = snapshot();
  delayed.dispose();
  host.remove();
  return { hidden, initialized, preserved, resized };
};
Object.assign(window, {
  __p20: {
    events,
    mount,
    viewer: () => viewer,
    apply: () =>
      viewer.setHighlight({
        owner: { id: "external" },
        loci: [
          {
            kind: "point",
            space: { id: "sequence-space", kind: "sequence", length: 4 },
            position: { kind: "index", value: 1 },
          },
        ],
      }),
    applyKinds: () => {
      const space = { id: "sequence-space", kind: "sequence", length: 4 } as const;
      viewer.setHighlight({
        owner: { id: "same-owner" },
        trackId: "boundary-track",
        loci: [{ kind: "interval", space, start: 0, end: 2 }],
      });
      viewer.setSelection({
        owner: { id: "same-owner" },
        trackId: "lane-track",
        loci: [{ kind: "boundary", space, position: 2 }],
      });
    },
    dispose: () => viewer.dispose(),
    customProviderEvidence,
    mountAlignmentActions,
    get alignmentActionEvents() {
      return alignmentActionEvents;
    },
    throwingProviderEvidence,
    loadTall,
    delayedSizeEvidence,
  },
});
