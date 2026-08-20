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

test("publishes a real pointer event for a non-first track", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator('[data-seq-viewer="canvas"]');
  const markerHeader = page.locator("[data-seq-viewer-track]").nth(1);
  const box = await canvas.boundingBox();
  const marker = await markerHeader.boundingBox();
  if (box === null || marker === null) throw new Error("Expected the marker track geometry.");
  await page.mouse.move(box.x + 156, marker.y + marker.height / 2);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as typeof window & {
            __p20: { events: readonly { readonly layerId?: string; readonly itemId?: string }[] };
          }
        ).__p20.events.at(-1),
      ),
    )
    .toMatchObject({ layerId: "boundary-layer", itemId: "boundary-zero" });
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
  const pointLocus = (value: number) =>
    expect.objectContaining({
      kind: "point",
      space: expect.objectContaining({ id: "sequence-space" }),
      position: expect.objectContaining({ value }),
    });
  const boundaryLocus = (position: number) =>
    expect.objectContaining({
      kind: "boundary",
      space: expect.objectContaining({ id: "sequence-space" }),
      position,
    });
  const allEndpointLoci = [
    pointLocus(0),
    pointLocus(1),
    boundaryLocus(0),
    pointLocus(3),
    boundaryLocus(2),
    boundaryLocus(4),
  ];
  const targets = [
    { endpointRole: "from", locusIndex: 2 },
    { endpointRole: "to", locusIndex: 1 },
    { endpointRole: "to", locusIndex: 2 },
  ];
  for (const [index, target] of targets.entries()) {
    expect(hits[index]).toMatchObject({ layerId: "links-layer", itemId: "edge", ...target });
    expect((hits[index] as { loci: unknown[] }).loci).toHaveLength(6);
    expect((hits[index] as { loci: unknown[] }).loci).toEqual(
      expect.arrayContaining(allEndpointLoci),
    );
  }
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
        loci: expect.any(Array),
      },
      {
        itemId: "edge",
        endpointRole: "to",
        locusIndex: 1,
        loci: expect.any(Array),
      },
      {
        itemId: "edge",
        endpointRole: "to",
        locusIndex: 2,
        loci: expect.any(Array),
      },
    ],
  });
  expect((evidence as { relationshipHits: Array<{ loci: unknown[] }> }).relationshipHits).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        loci: expect.arrayContaining([
          expect.objectContaining({ position: expect.objectContaining({ value: 0 }) }),
        ]),
      }),
      expect.objectContaining({
        loci: expect.arrayContaining([
          expect.objectContaining({ position: expect.objectContaining({ value: 3 }) }),
        ]),
      }),
    ]),
  );
  expect(
    (evidence as { relationshipHits: Array<{ loci: unknown[] }> }).relationshipHits.every(
      (hit) => hit.loci.length === 6,
    ),
  ).toBe(true);
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

test("navigates with bounded viewport descriptors and keeps gap hits empty", async ({ page }) => {
  await page.goto("/");
  const navigation = page.locator("[data-seq-viewer-navigation=root]");
  await expect(navigation).toBeVisible();
  await expect(page.locator("[data-seq-viewer-navigation-segment]")).toHaveCount(2);
  const viewportEvents = async () =>
    page.evaluate(() =>
      (
        window as typeof window & {
          __p20: { events: Array<{ kind: string; viewport?: unknown }> };
        }
      ).__p20.events.filter((event) => event.kind === "viewport-change"),
    );
  await expect.poll(viewportEvents).toHaveLength(1);
  expect((await viewportEvents())[0]).toMatchObject({
    viewport: {
      offsetStart: 0,
      offsetEnd: 8,
      totalColumns: 8,
      segments: [
        { segmentId: "sequence-axis", spaceId: "sequence-space", start: 0, end: 4 },
        { segmentId: "alignment-axis", spaceId: "alignment-space", start: 0, end: 4 },
      ],
    },
  });
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Pan right" }).click();
  await page.getByRole("button", { name: "Pan right" }).click();
  const window = page.locator("[data-seq-viewer-navigation=window]");
  await window.focus();
  await page.keyboard.press("ArrowRight");
  const afterPan = (await viewportEvents()).at(-1) as {
    viewport: { offsetStart: number; offsetEnd: number; totalColumns: number };
  };
  expect(afterPan.viewport).toMatchObject({ offsetStart: 2, offsetEnd: 8, totalColumns: 8 });
  const hit = await page.evaluate(() =>
    (
      window as typeof window & {
        __p20: { viewer: () => { hitTest(x: number, y: number): unknown } };
      }
    ).__p20
      .viewer()
      .hitTest(260, 35),
  );
  const gap = await page.evaluate(() =>
    (
      window as typeof window & {
        __p20: { viewer: () => { hitTest(x: number, y: number): unknown } };
      }
    ).__p20
      .viewer()
      .hitTest(320, 35),
  );
  expect(hit).toMatchObject({ itemId: "edge", endpointRole: "to" });
  expect(gap).toBeUndefined();
  await page.getByRole("button", { name: "Reset navigation" }).click();
  const reset = (await viewportEvents()).at(-1) as {
    viewport: { offsetStart: number; offsetEnd: number; totalColumns: number };
  };
  expect(reset.viewport).toMatchObject({ offsetStart: 0, offsetEnd: 8, totalColumns: 8 });
  await page.getByRole("button", { name: "Zoom in" }).click();
  const rightHandle = page.locator('[data-seq-viewer-navigation-handle="right"]');
  const rightBox = await rightHandle.boundingBox();
  if (!rightBox) throw new Error("right navigation handle missing");
  await page.mouse.move(rightBox.x + rightBox.width / 2, rightBox.y + rightBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(rightBox.x - 90, rightBox.y + rightBox.height / 2);
  await page.mouse.up();
  const afterHandle = (await viewportEvents()).at(-1) as {
    viewport: { offsetStart: number; offsetEnd: number; totalColumns: number };
  };
  expect(afterHandle.viewport.offsetEnd - afterHandle.viewport.offsetStart).toBeLessThan(6);
  const windowBox = await window.boundingBox();
  if (!windowBox) throw new Error("navigation window missing");
  await page.mouse.move(windowBox.x + windowBox.width / 2, windowBox.y + windowBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(windowBox.x + 220, windowBox.y + windowBox.height / 2);
  await page.mouse.up();
  const afterDrag = (await viewportEvents()).at(-1) as {
    viewport: { offsetStart: number; offsetEnd: number; totalColumns: number };
  };
  expect(afterDrag.viewport.offsetEnd).toBe(8);
  await page.getByRole("button", { name: "Reset navigation" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.mouse.move(200, 35);
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, 100);
  await page.keyboard.up("Shift");
  const afterWheel = (await viewportEvents()).at(-1) as {
    viewport: { offsetStart: number; offsetEnd: number };
  };
  expect(afterWheel.viewport).toMatchObject({ offsetStart: 2, offsetEnd: 8 });
});

test("cancels an old navigation drag before replacement installs its viewport", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Zoom in" }).click();
  const window = page.locator("[data-seq-viewer-navigation=window]");
  const box = await window.boundingBox();
  if (!box) throw new Error("navigation window missing");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.evaluate(() =>
    (window as typeof window & { __p20: { loadTall(): Promise<number> } }).__p20.loadTall(),
  );
  await page.mouse.move(box.x + 180, box.y + box.height / 2);
  await page.mouse.up();
  const viewportEvents = await page.evaluate(() =>
    (
      window as typeof window & {
        __p20: {
          events: Array<{
            kind: string;
            documentId?: string;
            viewport?: { offsetStart: number; offsetEnd: number; totalColumns: number };
          }>;
        };
      }
    ).__p20.events.filter((event) => event.kind === "viewport-change"),
  );
  expect(viewportEvents).toHaveLength(3);
  expect(viewportEvents.at(-1)).toMatchObject({
    documentId: "tall-document",
    viewport: { offsetStart: 0, offsetEnd: 8, totalColumns: 8 },
  });
});

test("retires native hover on scroll so row re-entry publishes a new set", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() =>
    (window as typeof window & { __p20: { loadTall(): Promise<number> } }).__p20.loadTall(),
  );
  const root = page.locator('[data-seq-viewer="root"]');
  await root.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll"));
  });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await page.mouse.move(184, 12);
  await root.evaluate((element) => {
    element.scrollTop = 500;
    element.dispatchEvent(new Event("scroll"));
  });
  await root.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll"));
  });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await page.mouse.move(184, 12);
  const hover = await page.evaluate(() =>
    (
      window as typeof window & {
        __p20: { events: Array<{ kind: string; phase?: string; documentId?: string }> };
      }
    ).__p20.events.filter(
      (event) => event.kind === "hover" && event.documentId === "tall-document",
    ),
  );
  expect(hover.map((event) => event.phase)).toEqual(["set", "clear", "set"]);
});

test("renders and leases complete relationship state locally with replace semantics", async ({
  page,
}) => {
  await page.goto("/");
  await page.mouse.move(184, 35);
  const hoverPixels = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-seq-viewer=canvas]");
    const context = canvas?.getContext("2d");
    if (!context) throw new Error("canvas missing");
    return [184, 350, 269, 382].map((x) => [...context.getImageData(x, 35, 1, 1).data]);
  });
  await page.mouse.move(350, 35);
  await page.mouse.move(390, 35);
  const hover = await page.evaluate(() =>
    (
      window as typeof window & {
        __p20: {
          events: Array<{ kind: string; phase?: string; endpointRole?: string; loci: unknown[] }>;
        };
      }
    ).__p20.events.filter((event) => event.kind === "hover"),
  );
  await page.mouse.click(184, 35);
  await page.mouse.click(350, 35);
  await page.mouse.click(390, 35);
  const events = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __p20: {
            events: Array<{
              kind: string;
              phase?: string;
              endpointRole?: string;
              loci: unknown[];
            }>;
          };
        }
      ).__p20.events,
  );
  const selection = events.filter((event) => event.kind === "select");
  expect(hover.map((event) => event.phase)).toEqual(["set", "clear", "set", "clear"]);
  expect(hover.map((event) => event.endpointRole)).toEqual(["from", "from", "to", "to"]);
  expect(selection.map((event) => event.phase)).toEqual(["set", "clear", "set", "clear"]);
  expect(selection.map((event) => event.endpointRole)).toEqual(["from", "from", "to", "to"]);
  expect([...hover, ...selection].every((event) => event.loci.length === 6)).toBe(true);
  expect(hoverPixels.every((pixel) => pixel[0] > pixel[2])).toBe(true);
});

test("clears native hover and selection during replacement and disposal", async ({ page }) => {
  await page.goto("/");
  await page.mouse.move(184, 35);
  await page.mouse.click(184, 35);
  await page.evaluate(() =>
    (window as typeof window & { __p20: { loadTall(): Promise<number> } }).__p20.loadTall(),
  );
  await page.mouse.move(184, 12);
  await page.mouse.click(184, 12);
  const events = await page.evaluate(() => {
    const fixture = window as typeof window & {
      __p20: { dispose(): void; events: Array<{ kind: string; phase?: string }> };
    };
    fixture.__p20.dispose();
    return fixture.__p20.events;
  });
  expect(events.filter((event) => event.kind === "hover").map((event) => event.phase)).toEqual([
    "set",
    "clear",
    "set",
    "clear",
  ]);
  expect(events.filter((event) => event.kind === "select").map((event) => event.phase)).toEqual([
    "set",
    "clear",
    "set",
    "clear",
  ]);
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

test("defers zero-sized hosts and preserves the last valid canvas through hidden observations", async ({
  page,
}) => {
  await page.goto("/");
  const evidence = await page.evaluate(() =>
    (
      window as typeof window & {
        __p20: {
          delayedSizeEvidence(): Promise<{
            hidden: Record<string, string | number>;
            initialized: Record<string, string | number>;
            preserved: Record<string, string | number>;
            resized: Record<string, string | number>;
          }>;
        };
      }
    ).__p20.delayedSizeEvidence(),
  );
  expect(evidence.hidden).toMatchObject({
    canvasWidth: "100%",
    canvasHeight: "100%",
    rootHeight: "",
  });
  expect(evidence.hidden.width).not.toBe(1);
  expect(evidence.hidden.height).not.toBe(1);
  expect(evidence.initialized).toMatchObject({
    width: 640,
    height: 280,
    canvasWidth: "640px",
    canvasHeight: "280px",
    rootHeight: "280px",
  });
  expect(evidence.preserved).toEqual(evidence.initialized);
  expect(evidence.resized).toMatchObject({
    width: 480,
    height: 240,
    canvasWidth: "480px",
    canvasHeight: "240px",
    rootHeight: "240px",
  });
});
