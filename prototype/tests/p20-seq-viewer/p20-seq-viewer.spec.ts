import { expect, test } from "@playwright/test";

test("uses tracks as rows, defaults the ruler, and hit-tests topmost layers and gaps", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#status")).toHaveAttribute("data-status", "rendered");
  await expect(page.locator("[data-seq-viewer-track]")).toHaveCount(3);
  const headers = page.locator("[data-seq-viewer-track]");
  await expect(headers.nth(0)).toHaveText("Core track · member");
  await expect(headers.nth(0)).toHaveCSS("height", "29px");
  const result = await page.evaluate(() => {
    const viewer = (
      window as typeof window & {
        __p20: { viewer: () => { hitTest(x: number, y: number): unknown } };
      }
    ).__p20.viewer();
    return {
      relationship: viewer.hitTest(184, 35),
      gap: viewer.hitTest(390, 35),
      alignmentGap: viewer.hitTest(500, 35),
    };
  });
  expect(result.relationship).toMatchObject({
    trackId: "track",
    layerId: "links-layer",
    itemId: "edge",
  });
  expect(result.gap).toBeUndefined();
  expect(result.alignmentGap).toMatchObject({
    layerId: "alignment-layer",
    loci: [{ space: { id: "alignment-space" }, position: { value: 1 } }],
  });
  expect((result.alignmentGap as { loci: unknown[] }).loci).toHaveLength(1);
  const resultJson = JSON.parse((await page.locator("#status").textContent()) ?? "{}") as {
    result: { layers: Array<{ status: string }> };
  };
  expect(resultJson.result.layers).toHaveLength(11);
  expect(resultJson.result.layers.every((layer) => layer.status === "exact")).toBe(true);
});

test("places boundary markers exactly at 0, internal, and length boundaries", async ({ page }) => {
  await page.goto("/");
  const hits = await page.evaluate(() => {
    const viewer = (
      window as typeof window & {
        __p20: { viewer: () => { hitTest(x: number, y: number): unknown } };
      }
    ).__p20.viewer();
    return [156, 269, 382, 184].map((x) => viewer.hitTest(x, 65));
  });
  expect(hits[0]).toMatchObject({
    layerId: "boundary-layer",
    itemId: "boundary-zero",
    loci: [{ kind: "boundary", position: 0 }],
  });
  expect(hits[1]).toMatchObject({
    layerId: "boundary-layer",
    itemId: "boundary-middle",
    loci: [{ kind: "boundary", position: 2 }],
  });
  expect(hits[2]).toMatchObject({
    layerId: "boundary-layer",
    itemId: "boundary-end",
    loci: [{ kind: "boundary", position: 4 }],
  });
  expect(hits[3]).toBeUndefined();
});

test("preserves relationship endpoint and locus identity for boundary links", async ({ page }) => {
  await page.goto("/");
  const hits = await page.evaluate(() => {
    const viewer = (
      window as typeof window & {
        __p20: { viewer: () => { hitTest(x: number, y: number): unknown } };
      }
    ).__p20.viewer();
    return [156, 269, 382].map((x) => viewer.hitTest(x, 35));
  });
  expect(hits[0]).toMatchObject({
    layerId: "links-layer",
    itemId: "edge",
    endpointRole: "from",
    locusIndex: 2,
    loci: [{ kind: "boundary", position: 0 }],
  });
  expect(hits[1]).toMatchObject({
    layerId: "links-layer",
    itemId: "edge",
    endpointRole: "to",
    locusIndex: 1,
    loci: [{ kind: "boundary", position: 2 }],
  });
  expect(hits[2]).toMatchObject({
    layerId: "links-layer",
    itemId: "edge",
    endpointRole: "to",
    locusIndex: 2,
    loci: [{ kind: "boundary", position: 4 }],
  });
});

test("keeps stacked block lanes stable over whole intervals", async ({ page }) => {
  await page.goto("/");
  const pixels = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-seq-viewer=canvas]");
    if (!canvas) throw new Error("canvas missing");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("context missing");
    const sample = (x: number, y: number) => [...context.getImageData(x, y, 1, 1).data];
    return {
      lane0Only: sample(184, 83),
      overlapLane0: sample(241, 83),
      overlapLane1: sample(241, 93),
      pointLane2: sample(241, 103),
    };
  });
  expect(pixels.lane0Only).not.toEqual([248, 250, 252, 255]);
  expect(pixels.overlapLane0).not.toEqual([248, 250, 252, 255]);
  expect(pixels.overlapLane1).not.toEqual([248, 250, 252, 255]);
  expect(pixels.pointLane2).not.toEqual([248, 250, 252, 255]);
});

test("adapts numeric heatmap data to declared bars fallback and rejects omissions", async ({
  page,
}) => {
  await page.goto("/");
  const evidence = await page.evaluate(() =>
    (
      window as typeof window & { __p20: { customProviderEvidence(): Promise<unknown> } }
    ).__p20.customProviderEvidence(),
  );
  expect(evidence).toMatchObject({
    capabilities: { representations: ["sequence"] },
    result: {
      status: "failed",
      layers: expect.arrayContaining([expect.objectContaining({ status: "rejected" })]),
    },
    fallback: {
      status: "rendered",
      layers: [
        {
          requested: "heatmap",
          rendered: "bars",
          status: "degraded",
          diagnosticCode: "seqviewer.representation.fallback",
        },
      ],
    },
    fallbackPixel: [255, 0, 0, 255],
    relationshipFallback: {
      status: "rendered",
      layers: [{ requested: "links", rendered: "markers", status: "degraded" }],
    },
    relationshipHits: [
      {
        itemId: "edge",
        endpointRole: "from",
        locusIndex: 2,
        loci: [{ kind: "boundary", position: 0 }],
      },
      {
        itemId: "edge",
        endpointRole: "to",
        locusIndex: 1,
        loci: [{ kind: "boundary", position: 2 }],
      },
      {
        itemId: "edge",
        endpointRole: "to",
        locusIndex: 2,
        loci: [{ kind: "boundary", position: 4 }],
      },
    ],
  });
});

test("emits one attributed native hover clear when entering a display gap", async ({ page }) => {
  await page.goto("/");
  await page.mouse.move(184, 35);
  await page.mouse.move(390, 35);
  await page.mouse.move(395, 35);
  await page.mouse.move(184, 35);
  await page.mouse.move(700, 35);
  const events = await page.evaluate(() =>
    (
      window as typeof window & {
        __p20: {
          events: Array<{
            kind: string;
            phase?: string;
            itemId?: string;
            loci: unknown[];
          }>;
        };
      }
    ).__p20.events.filter((event) => event.kind === "hover"),
  );
  expect(events.map((event) => event.phase)).toEqual(["set", "clear", "set", "clear"]);
  expect(events[1]).toMatchObject({ itemId: "edge", loci: expect.any(Array) });
  expect(events[3]).toMatchObject({ itemId: "edge", loci: expect.any(Array) });
});

test("external point, interval, boundary and scoped commands do not echo", async ({ page }) => {
  await page.goto("/");
  const evidence = await page.evaluate(async () => {
    const fixture = window as typeof window & {
      __p20: { events: unknown[]; apply(): void; applyKinds(): void };
    };
    const before = fixture.__p20.events.length;
    fixture.__p20.apply();
    fixture.__p20.applyKinds();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const canvas = document.querySelector<HTMLCanvasElement>("canvas");
    const context = canvas?.getContext("2d");
    if (!context) throw new Error("context missing");
    return {
      before,
      after: fixture.__p20.events.length,
      core: [...context.getImageData(184, 35, 1, 1).data],
      highlightedTrack: [...context.getImageData(184, 65, 1, 1).data],
      selectedBoundary: [...context.getImageData(269, 95, 1, 1).data],
    };
  });
  expect(evidence.after).toBe(evidence.before);
  expect(evidence.highlightedTrack).not.toEqual(evidence.core);
  expect(evidence.selectedBoundary).not.toEqual(evidence.core);
});

test("continues cleanup after throwing creates, disposers, and behaviors", async ({ page }) => {
  await page.goto("/");
  const evidence = await page.evaluate(() =>
    (
      window as typeof window & { __p20: { throwingProviderEvidence(): Promise<unknown> } }
    ).__p20.throwingProviderEvidence(),
  );
  expect(evidence).toMatchObject({
    replacement: {
      status: "rendered",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "seqviewer.provider.dispose-failed" }),
      ]),
    },
    createFailure: {
      status: "failed",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "seqviewer.provider.create-failed" }),
      ]),
    },
    behaviorCleanup: 1,
    behaviorDom: 0,
  });
  expect((evidence as { successfulDisposals: number }).successfulDisposals).toBeGreaterThan(0);
});

test("keeps tall canvas, headers, row clipping, and hit testing aligned", async ({ page }) => {
  await page.goto("/");
  const evidence = await page.evaluate(async () => {
    const fixture = window as typeof window & {
      __p20: {
        loadTall(): Promise<number>;
        viewer: () => { hitTest(x: number, y: number): unknown };
      };
    };
    const scrollTop = await fixture.__p20.loadTall();
    const canvas = document.querySelector<HTMLCanvasElement>("[data-seq-viewer=canvas]");
    const header = Array.from(
      document.querySelectorAll<HTMLElement>("[data-seq-viewer-track]"),
    ).find((item) => item.textContent === "Tall 20");
    if (!canvas || !header) throw new Error("tall evidence missing");
    const box = canvas.getBoundingClientRect();
    return {
      scrollTop,
      hit: fixture.__p20.viewer().hitTest(box.left + 184, box.top + 12),
      headerTop: header.getBoundingClientRect().top,
      canvasTop: box.top,
    };
  });
  expect(evidence.scrollTop).toBe(500);
  expect(evidence.hit).toMatchObject({ trackId: "tall-track-20", layerId: "tall-layer-20" });
  expect(Math.abs(evidence.headerTop - evidence.canvasTop)).toBeLessThan(1);
});

test("is DPR-aware and repeated disposal leaves no duplicate DOM", async ({ page }) => {
  await page.goto("/");
  const evidence = await page.evaluate(async () => {
    const fixture = window as typeof window & {
      __p20: { mount(): Promise<void>; dispose(): void };
    };
    const canvas = document.querySelector<HTMLCanvasElement>("canvas");
    const dpr = canvas ? canvas.width / canvas.clientWidth : 0;
    await fixture.__p20.mount();
    await fixture.__p20.mount();
    fixture.__p20.dispose();
    fixture.__p20.dispose();
    return { dpr, roots: document.querySelectorAll("[data-seq-viewer=root]").length };
  });
  expect(evidence.dpr).toBeGreaterThanOrEqual(1);
  expect(evidence.roots).toBe(0);
});
