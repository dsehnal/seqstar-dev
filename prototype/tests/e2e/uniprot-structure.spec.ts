import { expect, type Page, test } from "@playwright/test";

const inspectedMvsProfile = async (page: Page) =>
  page.getByTestId("p41-mvs-json").evaluate((element) => {
    const document = JSON.parse(element.textContent ?? "null") as {
      root?: unknown;
      snapshots?: Array<{ root?: unknown }>;
    };
    const counts: Record<string, number> = {};
    const representations: Record<string, number> = {};
    const colors: Array<{ color?: unknown; selector?: unknown }> = [];
    const visit = (value: unknown): void => {
      if (typeof value !== "object" || value === null) return;
      const node = value as {
        kind?: unknown;
        params?: { type?: unknown; color?: unknown; selector?: unknown };
        children?: unknown[];
      };
      if (typeof node.kind === "string") counts[node.kind] = (counts[node.kind] ?? 0) + 1;
      if (node.kind === "representation" && typeof node.params?.type === "string")
        representations[node.params.type] = (representations[node.params.type] ?? 0) + 1;
      if (node.kind === "color") colors.push(node.params ?? {});
      node.children?.forEach(visit);
    };
    if (document.root !== undefined) visit(document.root);
    document.snapshots?.forEach((snapshot) => {
      visit(snapshot.root);
    });
    return {
      counts,
      representations,
      colors,
      selectorEntityIds: colors.flatMap((color) =>
        Array.isArray(color.selector)
          ? color.selector.map((selector) =>
              typeof selector === "object" && selector !== null
                ? (selector as { label_entity_id?: unknown }).label_entity_id
                : undefined,
            )
          : [],
      ),
      selectorCount: colors.reduce(
        (total, color) => total + (Array.isArray(color.selector) ? color.selector.length : 0),
        0,
      ),
    };
  });

test("runs the offline P04637 / 1TUP annotation-to-MVS vertical slice", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "data:" && !["127.0.0.1", "localhost"].includes(url.hostname))
      external.push(request.url());
  });
  await page.goto("/#/uniprot-structure");
  await expect(page).toHaveURL(/#\/uniprot-structure$/u);
  await expect(page.getByTestId("p41-harness-status")).toContainText("ready");
  await expect(
    page.getByTestId("uniprot-tracks-host").locator('[data-seqstar-nightingale="root"]'),
  ).toBeVisible();
  const tracksHost = page.getByTestId("uniprot-tracks-host");
  const nightingaleRoot = tracksHost.locator('[data-seqstar-nightingale="root"]');
  const longHeader = tracksHost.locator('[data-seqstar-track-activate="missense-score"]');
  await expect(longHeader).toHaveAttribute("title", "Synthetic AlphaMissense-like score");
  await expect(longHeader).toHaveCSS("cursor", "pointer");
  await expect(longHeader).toHaveCSS("white-space", "nowrap");
  await expect(longHeader).toHaveCSS("overflow", "hidden");
  await expect(longHeader).toHaveCSS("text-overflow", "ellipsis");
  expect(await longHeader.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
    true,
  );

  await page.evaluate(() => {
    const interactions: unknown[] = [];
    document.addEventListener("nightingale-interaction", (event) => {
      interactions.push((event as CustomEvent).detail);
    });
    (window as unknown as { p41NightingaleInteractions: unknown[] }).p41NightingaleInteractions =
      interactions;
  });
  const regionFeature = tracksHost
    .locator('[data-seqstar-layer="region-blocks"] [data-seqstar-feature-id]')
    .nth(1);
  const featureBounds = await regionFeature.boundingBox();
  if (featureBounds === null) throw new Error("Expected a rendered Nightingale region feature.");
  await regionFeature.hover({
    position: { x: featureBounds.width * 0.67, y: featureBounds.height / 2 },
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const values = (
          window as unknown as {
            p41NightingaleInteractions: Array<{
              kind?: string;
              phase?: string;
              regions?: Array<{ start: number; end: number }>;
            }>;
          }
        ).p41NightingaleInteractions;
        return values.findLast((value) => value.kind === "hover" && value.phase === "set")?.regions;
      }),
    )
    .toEqual([expect.objectContaining({ start: expect.any(Number), end: expect.any(Number) })]);
  const hoveredRegion = await page.evaluate(() => {
    const values = (
      window as unknown as {
        p41NightingaleInteractions: Array<{
          kind?: string;
          phase?: string;
          regions?: Array<{ start: number; end: number }>;
        }>;
      }
    ).p41NightingaleInteractions;
    return values.findLast((value) => value.kind === "hover" && value.phase === "set")
      ?.regions?.[0];
  });
  expect(hoveredRegion?.start).toBe(hoveredRegion?.end);
  const hoverColumn = nightingaleRoot.locator('[data-seqstar-hover-column="true"]');
  await expect(hoverColumn).toBeVisible();
  const [rootBounds, columnBounds] = await Promise.all([
    nightingaleRoot.boundingBox(),
    hoverColumn.boundingBox(),
  ]);
  expect(columnBounds?.height).toBeCloseTo(rootBounds?.height ?? 0, 0);
  expect(await nightingaleRoot.locator('[data-seqstar-hover-column="true"]').count()).toBe(1);
  await page.mouse.move(0, 0);
  await expect(hoverColumn).toBeHidden();

  await expect(page.getByTestId("structure-view-host")).toHaveCSS("height", "384px");
  await page
    .getByTestId("uniprot-tracks-host")
    .locator('[data-seqstar-track-activate="missense-score"]')
    .click();
  await expect(page.getByTestId("p41-request-id")).toContainText("P41-missense-score-");
  await expect(page.getByTestId("p41-generated-lifecycle")).toHaveText(/rendered|degraded/u, {
    timeout: 20_000,
  });
  const scoreProfile = await inspectedMvsProfile(page);
  expect(scoreProfile.counts).toMatchObject({
    download: 1,
    parse: 1,
    structure: 1,
    component: 1,
    representation: 1,
  });
  expect(scoreProfile.representations).toEqual({ cartoon: 1 });
  expect(scoreProfile.selectorCount).toBe(196);
  expect(new Set(scoreProfile.selectorEntityIds)).toEqual(new Set(["3"]));
  expect(scoreProfile.colors[0]).toEqual({ color: "#CBD5E1" });
  await page
    .getByTestId("uniprot-tracks-host")
    .locator('[data-seqstar-track-activate="regions"]')
    .click();
  await expect(page.getByTestId("p41-request-id")).toContainText("P41-regions-");
  await expect(page.getByTestId("p41-mapping-counts")).toContainText("partial 1");
  await expect(page.getByTestId("p41-item-summary")).toContainText("dna-binding: partial");
  await expect(page.getByTestId("p41-item-summary")).toContainText("tetramerization: unmapped");
  await expect(page.getByTestId("p41-message-order")).toContainText(
    "document.generated.mvs → visualization.mvs.request",
  );
  await expect(page.getByTestId("p41-generated-lifecycle")).toHaveText(/rendered|degraded/u, {
    timeout: 20_000,
  });
  const regionProfile = await inspectedMvsProfile(page);
  // Replacement is a complete MVS document, not a residue-detail append onto the score view.
  expect(regionProfile.counts).toMatchObject({ component: 1, representation: 1 });
  expect(regionProfile.representations).toEqual({ cartoon: 1 });
  expect(regionProfile.selectorCount).toBe(196);
  expect(new Set(regionProfile.selectorEntityIds)).toEqual(new Set(["3"]));
  expect(regionProfile.colors).toEqual([
    { color: "#CBD5E1" },
    expect.objectContaining({ color: "#2563EB" }),
  ]);
  const molstarCanvas = page.getByTestId("structure-view-host").locator("canvas").first();
  await expect(molstarCanvas).toBeVisible();
  expect((await molstarCanvas.boundingBox())?.height).toBeGreaterThan(0);
  const document = JSON.parse((await page.getByTestId("p41-mvs-json").textContent()) ?? "null") as {
    metadata?: { title?: string };
  };
  expect(document.metadata?.title).toContain("Regions and domains");
  expect(external).toEqual([]);
});

test("rapid normalized activations leave the latest complete request inspected", async ({
  page,
}) => {
  await page.goto("/#/uniprot-structure");
  await expect(page.getByTestId("p41-harness-status")).toContainText("ready");
  const tracks = page.getByTestId("uniprot-tracks-host");
  await tracks.locator('[data-seqstar-track-activate="regions"]').click();
  await tracks.locator('[data-seqstar-track-activate="variants"]').click();
  await expect(page.getByTestId("p41-request-id")).toContainText("P41-variants-");
  await expect(page.getByTestId("p41-item-summary")).toContainText("variant-R337H: unmapped");
  await expect(page.getByTestId("p41-item-summary")).not.toContainText("dna-binding");
  await expect(page.getByTestId("p41-generated-lifecycle")).toHaveText(/rendered|degraded/u, {
    timeout: 20_000,
  });
});
