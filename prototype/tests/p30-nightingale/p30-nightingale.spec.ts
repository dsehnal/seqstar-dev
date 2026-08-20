import { expect, test } from "@playwright/test";

type Probe = {
  retainFailure(): Promise<unknown>;
  clickFeature(): unknown;
  clickSequence(): unknown;
  clearFailure(): Promise<unknown>;
  declaredFallback(): Promise<unknown>;
  clickLinegraph(): Promise<unknown>;
};
const run = <T>(page: import("@playwright/test").Page, key: keyof Probe): Promise<T> =>
  page.evaluate(async (name) => (window as unknown as { p30Probe: Probe }).p30Probe[name](), key);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("p30-status")).toHaveAttribute("data-status", "ready");
});

test("retains the actual prior tree on strict replacement failure and keeps its interactions live", async ({
  page,
}) => {
  const retained = await run<{
    lifecycle: { status: string; previousView?: string; diagnostics: { code: string }[] };
    rootCount: number;
    hasA: boolean;
    stagingCount: number;
  }>(page, "retainFailure");
  expect(retained).toMatchObject({
    lifecycle: {
      status: "failed",
      previousView: "retained",
      diagnostics: [{ code: "wrapper.nightingale.layer.unsupported" }],
    },
    rootCount: 1,
    hasA: true,
    stagingCount: 0,
  });
  const feature = await run<
    Array<{ interaction: string; phase: string; origin: { documentId: string }; loci: unknown[] }>
  >(page, "clickFeature");
  expect(feature).toEqual([
    {
      interaction: "select",
      phase: "set",
      origin: expect.objectContaining({ documentId: "document-a" }),
      loci: [
        { kind: "interval", space: { id: "space", kind: "sequence", length: 5 }, start: 1, end: 4 },
      ],
      interactionId: expect.any(String),
      semanticTarget: expect.any(Object),
    },
  ]);
});

test("clears the actual prior tree under clear policy and honors a declared heatmap fallback", async ({
  page,
}) => {
  await expect(run(page, "clearFailure")).resolves.toMatchObject({
    lifecycle: { status: "failed", previousView: "cleared" },
    rootCount: 0,
    stagingCount: 0,
  });
  await expect(run(page, "declaredFallback")).resolves.toMatchObject({
    lifecycle: {
      status: "degraded",
      diagnostics: [{ code: "wrapper.nightingale.fallback.bars-heatmap" }],
    },
    trackCount: 1,
    linegraphCount: 0,
  });
});

test("normalizes actual sequence and linegraph D3 click paths to exact non-empty loci", async ({
  page,
}) => {
  const sequence = await run<Array<{ interaction: string; loci: unknown[] }>>(
    page,
    "clickSequence",
  );
  expect(sequence).toEqual([
    expect.objectContaining({
      interaction: "select",
      loci: [
        {
          kind: "point",
          space: { id: "space", kind: "sequence", length: 5 },
          position: { kind: "index", value: 0 },
        },
      ],
    }),
  ]);
  const linegraph = await run<Array<{ interaction: string; loci: unknown[] }>>(
    page,
    "clickLinegraph",
  );
  expect(linegraph).toEqual([
    expect.objectContaining({
      interaction: "select",
      loci: [
        {
          kind: "point",
          space: { id: "space", kind: "sequence", length: 5 },
          position: { kind: "index", value: 2 },
        },
      ],
    }),
  ]);
});

test("keeps native tracks in one pixel-aligned viewport with fixed compact headers", async ({
  page,
}) => {
  const result = await run<{
    viewport: { start?: string; end?: string };
    wrapperViewport?: { start: number; end: number; length: number };
    headerBefore: number;
    headerAfter: number;
    headerPosition: string;
    action: { radius: string; hasSvg: boolean };
    navigationWidth: number;
    rootWidth: number;
    lettersVisible: boolean;
    trackActivations: number;
    absentActionDiagnostic: boolean;
    positions: number[];
  }>(page, "viewportStress");
  expect(Number(result.viewport.start)).toBeGreaterThan(1);
  expect(Number(result.viewport.end)).toBeGreaterThan(Number(result.viewport.start));
  expect(result.wrapperViewport).toEqual({ start: 239, end: 240, length: 240 });
  expect(result.headerAfter).toBeCloseTo(result.headerBefore, 1);
  expect(result.headerPosition).toBe("sticky");
  expect(result.action).toEqual({ radius: "0px", hasSvg: true });
  expect(result.navigationWidth).toBeLessThanOrEqual(result.rootWidth + 0.5);
  expect(result.lettersVisible).toBe(true);
  expect(result.trackActivations).toBe(2);
  expect(result.absentActionDiagnostic).toBe(true);
  expect(Math.max(...result.positions) - Math.min(...result.positions)).toBeLessThanOrEqual(1);
});

test("resolves complete semantic loci and toggle leases from native Nightingale identities", async ({
  page,
}) => {
  const events = await run<
    Array<{
      interaction: string;
      phase: string;
      semanticTarget?: {
        annotationId?: string;
        itemId?: string;
        endpointRole?: string;
        locusIndex?: number;
      };
      loci: unknown[];
      interactionId: string;
    }>
  >(page, "semanticLoci");
  const hoverSets = events.filter(
    (event) => event.interaction === "hover" && event.phase === "set",
  );
  expect(hoverSets[0]).toMatchObject({
    semanticTarget: { annotationId: "features", itemId: "shared" },
    loci: [
      { kind: "interval", space: { id: "space", kind: "sequence", length: 5 }, start: 1, end: 4 },
    ],
  });
  expect(hoverSets[1]).toMatchObject({
    semanticTarget: {
      annotationId: "relationships",
      itemId: "paired",
      endpointRole: "source",
      locusIndex: 0,
    },
    loci: [
      { kind: "interval", space: { id: "space", kind: "sequence", length: 5 }, start: 0, end: 1 },
      {
        kind: "point",
        space: { id: "space", kind: "sequence", length: 5 },
        position: { kind: "index", value: 4 },
      },
    ],
  });
  const selection = events.filter((event) => event.interaction === "select");
  expect(selection.map((event) => event.phase)).toEqual(["set", "clear"]);
  expect(selection[0]).toMatchObject({
    semanticTarget: {
      annotationId: "relationships",
      itemId: "paired",
      endpointRole: "source",
      locusIndex: 0,
    },
    loci: [
      { kind: "interval", space: { id: "space", kind: "sequence", length: 5 }, start: 0, end: 1 },
      {
        kind: "point",
        space: { id: "space", kind: "sequence", length: 5 },
        position: { kind: "index", value: 4 },
      },
    ],
  });
  expect(selection[1]?.interactionId).toBe(selection[0]?.interactionId);
});
