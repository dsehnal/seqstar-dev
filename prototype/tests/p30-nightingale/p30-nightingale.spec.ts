import { expect, test } from "@playwright/test";

type Probe = {
  retainFailure(): Promise<unknown>;
  clickFeature(): unknown;
  clickSequence(): unknown;
  clearFailure(): Promise<unknown>;
  declaredFallback(): Promise<unknown>;
  clickLinegraph(): Promise<unknown>;
  alignmentAdapter(): Promise<unknown>;
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
    action: { radius: string; hasSvg: boolean; pressed: string | null };
    labelTitle: string;
    labelPressed: string | null;
    headerActive?: string;
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
  expect(result.action).toEqual({ radius: "0px", hasSvg: true, pressed: "true" });
  expect(result.labelTitle).toBe("An intentionally long feature label that must truncate");
  expect(result.labelPressed).toBe("true");
  expect(result.headerActive).toBe("true");
  expect(result.navigationWidth).toBeLessThanOrEqual(result.rootWidth + 0.5);
  expect(result.lettersVisible).toBe(true);
  expect(result.trackActivations).toBe(2);
  expect(result.absentActionDiagnostic).toBe(true);
  expect(Math.max(...result.positions) - Math.min(...result.positions)).toBeLessThanOrEqual(1);

  const overview = page.locator('#viewport [data-seqstar-nightingale-viewport="overview"]');
  const viewportWindow = page.locator('#viewport [data-seqstar-nightingale-viewport="window"]');
  const overviewBox = await overview.boundingBox();
  const windowBefore = await viewportWindow.boundingBox();
  if (overviewBox === null || windowBefore === null)
    throw new Error("Missing Nightingale overview geometry.");
  const dragDistance = Math.min(120, overviewBox.width / 4);
  await page.mouse.move(
    windowBefore.x + windowBefore.width / 2,
    windowBefore.y + windowBefore.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    windowBefore.x + windowBefore.width / 2 - dragDistance,
    windowBefore.y + windowBefore.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  const windowAfter = await viewportWindow.boundingBox();
  if (windowAfter === null) throw new Error("Nightingale overview window disappeared.");
  // The biological viewport is integer-valued, so the visual window may round
  // by at most one residue while otherwise tracking the pointer pixel-for-pixel.
  expect(Math.abs(windowAfter.x - windowBefore.x + dragDistance)).toBeLessThanOrEqual(2);

  const spacing = await page.locator("#viewport").evaluate((host) => {
    const rows = [...host.querySelectorAll<HTMLElement>(".seqstar-nightingale-row")];
    const navigation = host.querySelector<HTMLElement>(
      '[data-seqstar-nightingale-viewport="root"]',
    );
    const rowGaps = rows.slice(1).map((row, index) => {
      const previous = rows[index]?.getBoundingClientRect();
      return previous === undefined
        ? Number.POSITIVE_INFINITY
        : row.getBoundingClientRect().top - previous.bottom;
    });
    const finalRow = rows.at(-1)?.getBoundingClientRect();
    return {
      maximumRowGap: Math.max(0, ...rowGaps),
      navigationGap:
        finalRow === undefined || navigation === null
          ? Number.POSITIVE_INFINITY
          : navigation.getBoundingClientRect().top - finalRow.bottom,
    };
  });
  expect(spacing.maximumRowGap).toBeLessThanOrEqual(3);
  expect(spacing.navigationGap).toBeLessThanOrEqual(3);
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

test("renders the 32×118 alignment as exact member rows with mapped non-gap loci", async ({
  page,
}) => {
  const result = await run<{
    rowCount: number;
    sequenceRows: number;
    structureActionCount: number;
    annotationTracks: number;
    viewport: { length: number } | undefined;
    rowsScrollTop: number;
    actionEvents: Array<{ origin: { alignmentId?: string; alignmentMemberId?: string } }>;
    loci: Array<{ origin: { alignmentMemberId?: string }; loci: unknown[] }>;
    replacementRows: number;
  }>(page, "alignmentAdapter");
  expect(result.rowCount).toBe(32);
  expect(result.sequenceRows).toBe(32);
  expect(result.structureActionCount).toBe(1);
  expect(result.annotationTracks).toBe(3);
  expect(result.viewport).toMatchObject({ length: 118 });
  expect(result.rowsScrollTop).toBeGreaterThanOrEqual(0);
  expect(result.actionEvents).toEqual([
    expect.objectContaining({
      origin: expect.objectContaining({
        alignmentId: "alignment-32",
        alignmentMemberId: "member-0",
      }),
    }),
  ]);
  // Query non-gap column 2 maps to its member sequence. The following gap at
  // column 3 retains only the alignment column. Member-1's explicit column-6
  // gap also remains unmapped despite being a non-query row.
  expect(result.loci[0]).toMatchObject({
    origin: { alignmentMemberId: "member-0" },
    loci: [
      { kind: "point", space: { id: "alignment-columns", kind: "alignment", length: 118 } },
      { kind: "point", space: { id: "member-space-0", kind: "sequence", length: 117 } },
    ],
  });
  expect(result.loci[1]).toMatchObject({
    origin: { alignmentMemberId: "member-1" },
    loci: [{ kind: "point", space: { id: "alignment-columns", kind: "alignment", length: 118 } }],
  });
  expect(result.loci[2]).toMatchObject({
    origin: { alignmentMemberId: "member-1" },
    loci: [{ kind: "point", space: { id: "alignment-columns", kind: "alignment", length: 118 } }],
  });
  expect(result.replacementRows).toBe(32);
});
