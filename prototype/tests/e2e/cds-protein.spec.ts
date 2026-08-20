import { expect, test } from "@playwright/test";

test("shows two local CDS/protein viewers without a runtime network dependency", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "data:" && !["127.0.0.1", "localhost"].includes(url.hostname))
      external.push(request.url());
  });
  await page.goto("/#/cds-protein");
  await expect(page).toHaveURL(/#\/cds-protein$/u);
  await expect(page.getByTestId("p70-harness-status")).toContainText("ready");
  await expect(page.getByTestId("cds-nucleotide-view-host").locator("canvas")).toBeVisible();
  await expect(page.getByTestId("cds-protein-view-host").locator("canvas")).toBeVisible();
  await expect(page.getByTestId("p70-coordinate-convention")).toContainText("[3, 21)");
  expect(external).toEqual([]);
});

test("switches one shared CDS chooser 20 times without duplicate harness telemetry", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/#/cds-protein?renderer=reference");
  await expect(page.getByTestId("p70-harness-status")).toContainText("ready");
  const chooser = page.getByLabel("Sequence renderer");
  const status = page.getByTestId("renderer-chooser-status");
  const modes = ["nightingale", "reference"] as const;
  for (let index = 0; index < 20; index += 1) {
    const mode = modes[index % modes.length];
    await chooser.selectOption(mode);
    await expect(status).toContainText(`${mode} renderer ready`);
    await expect(page.getByTestId("cds-nucleotide-view-host")).toBeVisible();
    await expect(page.getByTestId("cds-protein-view-host")).toBeVisible();
    if (mode === "reference") {
      await expect(
        page.getByTestId("cds-nucleotide-view-host").locator('[data-seq-viewer="canvas"]'),
      ).toHaveCount(1);
      await expect(
        page.getByTestId("cds-protein-view-host").locator('[data-seq-viewer="canvas"]'),
      ).toHaveCount(1);
    } else {
      await expect(
        page.getByTestId("cds-nucleotide-view-host").locator('[data-seqstar-nightingale="root"]'),
      ).toHaveCount(1);
      await expect(
        page.getByTestId("cds-protein-view-host").locator('[data-seqstar-nightingale="root"]'),
      ).toHaveCount(1);
    }
    await expect(page.locator("html")).toHaveAttribute(
      "data-seqstar-harness-telemetry-subscriptions",
      "1",
    );
  }
  const settledMessages = await page
    .locator("html")
    .getAttribute("data-seqstar-harness-message-count");
  await page.waitForTimeout(300);
  await expect(page.locator("html")).toHaveAttribute(
    "data-seqstar-harness-message-count",
    settledMessages ?? "0",
  );
});

test("switches to Nightingale offline after Reference is ready", async ({ context, page }) => {
  const failedRequests: string[] = [];
  page.on("requestfailed", (request) => failedRequests.push(request.url()));
  await page.goto("/#/cds-protein?renderer=reference");
  await expect(page.getByTestId("p70-harness-status")).toContainText("ready");
  await expect(page.getByTestId("renderer-chooser-status")).toContainText(
    "reference renderer ready",
  );
  await expect(
    page.getByTestId("cds-nucleotide-view-host").locator('[data-seq-viewer="canvas"]'),
  ).toHaveCount(1);
  await expect(
    page.getByTestId("cds-protein-view-host").locator('[data-seq-viewer="canvas"]'),
  ).toHaveCount(1);

  await page.waitForTimeout(250);
  await context.setOffline(true);
  await page.getByLabel("Sequence renderer").selectOption("nightingale");

  await expect(page.getByTestId("renderer-chooser-status")).toContainText(
    "nightingale renderer ready",
  );
  await expect(
    page.getByTestId("cds-nucleotide-view-host").locator('[data-seqstar-nightingale="root"]'),
  ).toHaveCount(1);
  await expect(
    page.getByTestId("cds-protein-view-host").locator('[data-seqstar-nightingale="root"]'),
  ).toHaveCount(1);
  await expect(page.locator("html")).toHaveAttribute(
    "data-seqstar-harness-telemetry-subscriptions",
    "1",
  );
  expect(failedRequests).toEqual([]);
});

test("keeps real CDS host and canvas geometry stable for 30 seconds in both renderers", async ({
  page,
}) => {
  test.setTimeout(75_000);
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto("/#/cds-protein?renderer=reference");
  await expect(page.getByTestId("p70-harness-status")).toContainText("ready");
  const sample = () =>
    page.evaluate(() => {
      const surface = (id: string) => {
        const host = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
        const canvas = host?.querySelector<HTMLElement>(
          '[data-seq-viewer="canvas"], [data-seqstar-nightingale="root"]',
        );
        return {
          host: Math.round(host?.getBoundingClientRect().height ?? 0),
          canvas: Math.round(canvas?.getBoundingClientRect().height ?? 0),
        };
      };
      return {
        document: document.documentElement.scrollHeight,
        nucleotide: surface("cds-nucleotide-view-host"),
        protein: surface("cds-protein-view-host"),
      };
    });
  const assertStable = async () => {
    const first = await sample();
    for (let index = 0; index < 6; index += 1) {
      await page.waitForTimeout(5_000);
      const current = await sample();
      expect(current.document).toBe(first.document);
      expect(current.nucleotide).toEqual(first.nucleotide);
      expect(current.protein).toEqual(first.protein);
    }
  };
  await assertStable();
  await page.getByLabel("Sequence renderer").selectOption("nightingale");
  await expect(page.getByTestId("renderer-chooser-status")).toContainText(
    "nightingale renderer ready",
  );
  await assertStable();
});

test("keeps bounded CDS canvases and document height stable across observer notifications", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto("/#/cds-protein");
  await expect(page.getByTestId("p70-harness-status")).toContainText("ready");
  const sample = () =>
    page.evaluate(() => {
      const metrics = (id: string) => {
        const host = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
        const root = host?.querySelector<HTMLElement>('[data-seq-viewer="root"]');
        const canvas = host?.querySelector<HTMLCanvasElement>('[data-seq-viewer="canvas"]');
        return {
          host: host?.getBoundingClientRect().height ?? 0,
          root: root?.getBoundingClientRect().height ?? 0,
          canvas: canvas?.getBoundingClientRect().height ?? 0,
          canvasWidth: canvas?.getBoundingClientRect().width ?? 0,
          scroll: host?.scrollHeight ?? 0,
        };
      };
      return {
        document: document.documentElement.scrollHeight,
        nucleotide: metrics("cds-nucleotide-view-host"),
        protein: metrics("cds-protein-view-host"),
      };
    });
  const first = await sample();
  await page.waitForTimeout(5_000);
  const afterFiveSeconds = await sample();
  expect(Math.abs(afterFiveSeconds.document - first.document)).toBeLessThanOrEqual(1);
  for (const surface of [afterFiveSeconds.nucleotide, afterFiveSeconds.protein]) {
    expect(surface.host).toBeGreaterThan(0);
    expect(surface.root).toBeGreaterThan(0);
    expect(surface.canvas).toBeGreaterThan(0);
    expect(surface.canvasWidth).toBeGreaterThan(156);
    // The host owns its 1px top/bottom border; the viewer fills its content box.
    expect(Math.abs(surface.host - surface.root)).toBeLessThanOrEqual(2);
    expect(Math.abs(surface.root - surface.canvas)).toBeLessThanOrEqual(1);
  }

  const notificationHeights: number[] = [];
  for (let index = 0; index < 20; index += 1) {
    await page.getByTestId("cds-nucleotide-view-host").evaluate(
      (host, height) => {
        host.style.height = `${height}px`;
      },
      352 + (index % 2),
    );
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    notificationHeights.push(await page.evaluate(() => document.documentElement.scrollHeight));
  }
  expect(Math.max(...notificationHeights) - Math.min(...notificationHeights)).toBeLessThanOrEqual(
    1,
  );
  const final = await sample();
  expect(Math.abs(final.document - first.document)).toBeLessThanOrEqual(1);
});

test("uses bounded CDS geometry at a 390px viewport with readable sequence cells", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/cds-protein");
  await expect(page.getByTestId("p70-harness-status")).toContainText("ready");
  const metrics = await page.evaluate(() =>
    ["cds-nucleotide-view-host", "cds-protein-view-host"].map((id) => {
      const canvas = document
        .querySelector<HTMLElement>(`[data-testid="${id}"]`)
        ?.querySelector<HTMLCanvasElement>('[data-seq-viewer="canvas"]');
      const box = canvas?.getBoundingClientRect();
      return {
        id,
        plotWidth: canvas?.clientWidth ?? 0,
        height: box?.height ?? 0,
        cell: ((canvas?.clientWidth ?? 0) - 156) / (id === "cds-nucleotide-view-host" ? 24 : 6),
      };
    }),
  );
  for (const surface of metrics) {
    expect(surface.plotWidth).toBeGreaterThan(156);
    expect(surface.height).toBeGreaterThan(0);
    expect(surface.cell).toBeGreaterThanOrEqual(7);
  }
});

test("uses production reference-viewer interactions for bidirectional codon mapping and clears on remount", async ({
  page,
}) => {
  await page.goto("/#/cds-protein");
  await expect(page.getByTestId("p70-harness-status")).toContainText("ready");
  const nucleotideCanvas = page
    .getByTestId("cds-nucleotide-view-host")
    .locator('[data-seq-viewer="canvas"]');
  const proteinCanvas = page
    .getByTestId("cds-protein-view-host")
    .locator('[data-seq-viewer="canvas"]');
  await expect(nucleotideCanvas).toBeVisible();
  await expect(proteinCanvas).toBeVisible();
  const pointer = async (
    canvas: typeof nucleotideCanvas,
    position: number,
    length: number,
    type: "pointermove" | "click",
  ) => {
    await canvas.evaluate(
      (element, value) => {
        const box = element.getBoundingClientRect();
        const header = 156;
        const x =
          box.left + header + ((value.position + 0.5) / value.length) * (box.width - header);
        element.dispatchEvent(
          new PointerEvent(value.type, {
            bubbles: true,
            clientX: x,
            clientY: box.top + 32,
          }),
        );
      },
      { position, length, type },
    );
  };
  await pointer(nucleotideCanvas, 4, 24, "pointermove");
  await expect(page.getByTestId("p70-mapping-status")).toContainText(
    "nucleotide-to-protein: exact; 1 target locus/loci.",
  );
  await pointer(proteinCanvas, 0, 6, "click");
  await expect(page.getByTestId("p70-mapping-status")).toContainText(
    "protein-to-nucleotide: exact; 1 target locus/loci.",
  );
  const selectionTransitions = await page.evaluate(() => {
    const source = document.querySelector<HTMLElement>('[data-testid="cds-protein-view-host"]');
    const peer = document.querySelector<HTMLElement>('[data-testid="cds-nucleotide-view-host"]');
    const sourceCanvas = source?.querySelector<HTMLCanvasElement>('[data-seq-viewer="canvas"]');
    if (!source || !peer || !sourceCanvas) throw new Error("CDS selection surfaces missing");
    const box = sourceCanvas.getBoundingClientRect();
    const x = box.left + 156 + (0.5 / 6) * (box.width - 156);
    const y = box.top + 32;
    const sample = () => {
      const context = sourceCanvas.getContext("2d");
      if (!context) throw new Error("CDS canvas context missing");
      return [
        ...context.getImageData(Math.floor(x - box.left), Math.floor(y - box.top), 1, 1).data,
      ];
    };
    const transitions: string[] = [];
    const observer = new MutationObserver(() => {
      transitions.push(peer.dataset.seqstarAppliedSelections ?? "0");
    });
    observer.observe(peer, {
      attributes: true,
      attributeFilter: ["data-seqstar-applied-selections"],
    });
    Object.assign(window, { __cdsSelectionTransitions: transitions });
    return { x, y, before: sample() };
  });
  await proteinCanvas.dispatchEvent("click", {
    clientX: selectionTransitions.x,
    clientY: selectionTransitions.y,
  });
  await expect
    .poll(() =>
      page.getByTestId("cds-nucleotide-view-host").getAttribute("data-seqstar-applied-selections"),
    )
    .toBe("0");
  const repeatSelection = await page.evaluate(() => {
    const source = document.querySelector<HTMLElement>('[data-testid="cds-protein-view-host"]');
    const peer = document.querySelector<HTMLElement>('[data-testid="cds-nucleotide-view-host"]');
    const canvas = source?.querySelector<HTMLCanvasElement>('[data-seq-viewer="canvas"]');
    if (!source || !peer || !canvas) throw new Error("CDS repeat-selection surfaces missing");
    const box = canvas.getBoundingClientRect();
    const x = Math.floor(156 + (0.5 / 6) * (box.width - 156));
    const y = 32;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("CDS canvas context missing");
    return {
      source: [...context.getImageData(x, y, 1, 1).data],
      peerSelections: peer.dataset.seqstarAppliedSelections ?? "0",
      transitions:
        (window as typeof window & { __cdsSelectionTransitions?: readonly string[] })
          .__cdsSelectionTransitions ?? [],
      sourceSelections: source.dataset.seqstarAppliedSelections,
    };
  });
  expect(repeatSelection.peerSelections).toBe("0");
  expect(repeatSelection.transitions).toEqual(["0"]);
  expect(repeatSelection.sourceSelections).toBeUndefined();
  expect(repeatSelection.source).not.toEqual(selectionTransitions.before);
  await expect(page.getByTestId("p70-mapping-status")).toContainText(
    "protein-to-nucleotide: unmapped",
  );
  await nucleotideCanvas.evaluate((element) =>
    element.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true })),
  );
  await expect(page.getByTestId("p70-mapping-status")).toContainText(
    "nucleotide-to-protein: unmapped",
  );
  await page.goto("/#/renderer-portability");
  await page.goto("/#/cds-protein");
  await expect(page.getByTestId("p70-harness-status")).toContainText("ready");
  await expect(page.getByTestId("p70-mapping-status")).not.toContainText("exact; 1 target locus");
});
