import { expect, test } from "@playwright/test";

type Box = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

const requiredBox = async (value: Promise<Box | null>): Promise<Box> => {
  const box = await value;
  if (box === null) throw new Error("Expected a visible audit target.");
  return box;
};

/**
 * These are diagnostic snapshots of the M01 starting point. They are kept in
 * a standalone config so that implementing the frozen behavior can invert the
 * expectations without making the ordinary product suite encode known bugs.
 */
test("records the CDS ResizeObserver growth baseline over five seconds", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
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
          document: document.documentElement.scrollHeight,
        };
      };
      return {
        nucleotide: metrics("cds-nucleotide-view-host"),
        protein: metrics("cds-protein-view-host"),
      };
    });
  const first = await sample();
  await page.waitForTimeout(5_250);
  const last = await sample();
  console.log("M01 CDS height baseline", JSON.stringify({ first, last, consoleErrors }));
  expect(last.nucleotide.host).toBeGreaterThan(first.nucleotide.host);
  expect(last.protein.host).toBeGreaterThan(first.protein.host);
  expect(last.nucleotide.document).toBeGreaterThan(first.nucleotide.document);
});

test("records renderer comparison navigation collision at a narrow width", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto("/#/renderer-portability");
  const host = page.getByTestId("base-sequence-host");
  const navigation = host.locator('[data-seq-viewer-navigation="root"]');
  await expect(navigation).toBeVisible();
  const results: Array<{
    readonly viewport: number;
    readonly root: Box;
    readonly axis: Box;
    readonly controls: Box;
    readonly window: Box;
    readonly overflow: boolean;
  }> = [];
  for (const viewport of [1280, 768, 480, 390]) {
    await page.setViewportSize({ width: viewport, height: 844 });
    await expect(navigation).toBeVisible();
    const [root, axis, controls, window] = await Promise.all([
      requiredBox(navigation.boundingBox()),
      requiredBox(navigation.locator('[data-seq-viewer-navigation="axis"]').boundingBox()),
      requiredBox(navigation.getByRole("button", { name: "Pan left" }).locator("..").boundingBox()),
      requiredBox(
        navigation.getByRole("slider", { name: "Viewport window; drag to pan" }).boundingBox(),
      ),
    ]);
    const axisRight = axis.x + axis.width;
    const windowRight = window.x + window.width;
    const overflow =
      axis.width <= 0 ||
      axisRight > controls.x + 0.5 ||
      window.x < axis.x - 0.5 ||
      windowRight > axisRight + 0.5 ||
      windowRight > controls.x + 0.5 ||
      windowRight > root.x + root.width + 0.5;
    for (const value of [root, axis, controls, window])
      expect([value.x, value.y, value.width, value.height].every(Number.isFinite)).toBe(true);
    results.push({ viewport, root, axis, controls, window, overflow });
  }
  console.log("M01 navigation baseline", JSON.stringify(results));
  expect(results.find((result) => result.viewport === 390)?.overflow).toBe(true);
  expect(results.some((result) => result.overflow)).toBe(true);
});

test("records feature payload, Nightingale viewport, letters, headers, and repeat selection", async ({
  page,
}) => {
  await page.goto("/#/uniprot-structure");
  await expect(page.getByTestId("inspect-harness-status")).toContainText("ready");
  const host = page.getByTestId("uniprot-tracks-host");
  const native = host.locator("nightingale-sequence").first();
  const root = host.locator('[data-seqstar-nightingale="root"]');
  const firstLabel = host.locator("[data-seqstar-track-activate]").first();
  const region = host
    .locator('[data-seqstar-layer="region-blocks"] [data-seqstar-feature-id]')
    .nth(1);
  await expect(region).toBeVisible();
  await page.evaluate(() => {
    const values: unknown[] = [];
    document.addEventListener("nightingale-interaction", (event) =>
      values.push((event as CustomEvent).detail),
    );
    (window as unknown as { m01NightingaleEvents: unknown[] }).m01NightingaleEvents = values;
  });
  const regionBox = await requiredBox(region.boundingBox());
  await page.mouse.move(regionBox.x + regionBox.width * 0.67, regionBox.y + regionBox.height / 2);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { m01NightingaleEvents: unknown[] }).m01NightingaleEvents.length,
      ),
    )
    .toBeGreaterThan(0);
  const nightingale = await page.evaluate(() => {
    const event = (
      window as unknown as { m01NightingaleEvents: Array<Record<string, unknown>> }
    ).m01NightingaleEvents.findLast((value) => value.kind === "hover" && value.phase === "set");
    const sequence = document.querySelector<HTMLElement>("nightingale-sequence");
    const renderedText = sequence?.textContent ?? "";
    const labels = [...document.querySelectorAll<HTMLElement>("[data-seqstar-track-activate]")];
    return {
      event,
      lettersVisible: /[ACDEFGHIKLMNPQRSTVWY]{6}/u.test(renderedText),
      sequenceWidth: sequence?.getBoundingClientRect().width ?? 0,
      sequenceScrollWidth: sequence?.scrollWidth ?? 0,
      rootOverflowX: getComputedStyle(
        document.querySelector<HTMLElement>('[data-seqstar-nightingale="root"]') ?? document.body,
      ).overflowX,
      stickyHeaders: labels.map((label) => getComputedStyle(label).position),
    };
  });
  console.log("M01 Nightingale baseline", JSON.stringify(nightingale));
  expect((nightingale.event as { regions?: unknown[] } | undefined)?.regions).toHaveLength(1);
  expect(nightingale.lettersVisible).toBe(false);
  expect(nightingale.stickyHeaders.every((position) => position !== "sticky")).toBe(true);
  expect(await root.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await native.getAttribute("width")).not.toBeNull();
  expect(await firstLabel.evaluate((element) => getComputedStyle(element).borderRadius)).not.toBe(
    "0px",
  );

  await page.goto("/#/reference-viewer");
  const canvas = page.getByTestId("reference-viewer-host").locator('[data-seq-viewer="canvas"]');
  const bounds = await requiredBox(canvas.boundingBox());
  const cell = (bounds.width - 156) / 37;
  const x = bounds.x + 156 + 5.5 * cell;
  const y = bounds.y + 20 + 2 * 25 + 12.5;
  await page.mouse.move(x, y);
  await expect(page.getByTestId("reference-viewer-hover")).toContainText("site-1");
  const intervalHover = JSON.parse(
    (await page.getByTestId("reference-viewer-hover").textContent()) ?? "{}",
  ) as { readonly semanticTarget: string; readonly loci: string };
  expect(JSON.parse(intervalHover.semanticTarget)).toMatchObject({
    annotationId: "diagnostic-sites",
    itemId: "site-1",
    trackId: "features",
  });
  expect(JSON.parse(intervalHover.loci)).toEqual([
    {
      kind: "interval",
      space: { id: "diagnostic-protein-space", kind: "sequence", length: 37 },
      start: 5,
      end: 12,
    },
  ]);
  await page.mouse.move(bounds.x + 156 + 10.5 * cell, y);
  const sameIntervalHover = JSON.parse(
    (await page.getByTestId("reference-viewer-hover").textContent()) ?? "{}",
  ) as { readonly loci: string };
  expect(JSON.parse(sameIntervalHover.loci)).toEqual(JSON.parse(intervalHover.loci));

  await page.mouse.click(x, y);
  await expect(page.getByTestId("reference-viewer-selection")).toContainText('"phase":"set"');
  const afterFirst = await page.getByTestId("reference-viewer-native-events").textContent();
  await page.mouse.click(x, y);
  const afterSecond = await page.getByTestId("reference-viewer-native-events").textContent();
  console.log("M01 repeat selection baseline", JSON.stringify({ afterFirst, afterSecond }));
  expect(afterSecond).toBe(afterFirst);
});
