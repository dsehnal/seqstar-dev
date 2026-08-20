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
