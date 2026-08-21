import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

const inspectedMvsProfile = async (page: Page) =>
  page.getByTestId("inspect-mvs-json").evaluate((element) => {
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
  await expect(page.getByTestId("inspect-harness-status")).toContainText("ready");
  const controls = page.locator(".case-control-panel");
  await expect(controls).toBeVisible();
  await expect(controls.locator(".case-renderer-controls")).toHaveCount(1);
  await expect(controls.getByTestId("dataset-selector")).toHaveCount(1);
  await expect(page.locator("p:visible").filter({ hasText: /^Harness:/u })).toHaveCount(0);
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
  const variantFeatures = tracksHost.locator(
    '[data-seqstar-layer="variant-markers"] [data-seqstar-feature-id]',
  );
  const variantHeader = tracksHost.locator('[data-seqstar-track="variants"]');
  await expect(variantHeader.getByRole("button", { name: "Show this track in 3D" })).toBeVisible();
  await expect(variantHeader.locator(".seqstar-nightingale-track-action svg")).toHaveCount(1);
  await expect(variantFeatures).toHaveCount(3);
  const variantBounds = await variantFeatures.first().boundingBox();
  expect(variantBounds?.width).toBeGreaterThanOrEqual(6);
  expect(variantBounds?.height).toBeGreaterThanOrEqual(6);

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
  await expect(longHeader).toHaveAttribute("aria-pressed", "true");
  await expect(longHeader.locator("..")).toHaveAttribute("data-seqstar-track-active", "true");
  await expect(page.getByTestId("inspect-mvs-request-id")).toContainText(
    "dataset-1-P04637-1TUP-missense-score-",
  );
  await expect(page.getByTestId("inspect-mvs-lifecycle")).toHaveText(/rendered|degraded/u, {
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
  await expect(longHeader).toHaveAttribute("aria-pressed", "false");
  await expect(tracksHost.locator('[data-seqstar-track-activate="regions"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("inspect-mvs-request-id")).toContainText(
    "dataset-1-P04637-1TUP-regions-",
  );
  await expect(page.getByTestId("inspect-mapping-counts")).toContainText("partial 1");
  await expect(page.getByTestId("inspect-mapping-items")).toContainText("dna-binding: partial");
  await expect(page.getByTestId("inspect-mapping-items")).toContainText(
    "tetramerization: unmapped",
  );
  await expect(page.getByTestId("inspect-message-order")).toContainText(
    "document.generated.mvs → visualization.mvs.request",
  );
  await expect(page.getByTestId("inspect-mvs-lifecycle")).toHaveText(/rendered|degraded/u, {
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
  const document = JSON.parse(
    (await page.getByTestId("inspect-mvs-json").textContent()) ?? "null",
  ) as {
    metadata?: { title?: string };
  };
  expect(document.metadata?.title).toContain("Regions and domains");
  expect(external).toEqual([]);
});

test("makes Reference track labels readable and their 3D action state explicit", async ({
  page,
}) => {
  await page.goto("/#/uniprot-structure?renderer=reference");
  await expect(page.getByTestId("renderer-chooser-status")).toContainText(
    "reference renderer ready",
    { timeout: 20_000 },
  );
  const host = page.getByTestId("uniprot-tracks-host");
  const variants = host.getByRole("button", { name: "Activate track Natural variants" });
  const regions = host.getByRole("button", { name: "Activate track Regions and domains" });
  await expect(variants).toHaveAttribute("title", "Natural variants");
  const variantsHeader = variants.locator("..");
  await expect(variantsHeader.getByRole("button", { name: "Show this track in 3D" })).toBeVisible();
  await variants.click();
  await expect(variants).toHaveAttribute("aria-pressed", "true");
  await expect(variantsHeader).toHaveAttribute("data-seq-viewer-track-active", "true");
  await regions.click();
  await expect(regions).toHaveAttribute("aria-pressed", "true");
  await expect(variants).toHaveAttribute("aria-pressed", "false");

  const navigation = host.locator('[data-seq-viewer-navigation="root"]');
  await expect(navigation.getByRole("button", { name: "Reset navigation" })).toBeVisible();
  await expect(navigation.locator("button")).toHaveCount(1);
  const viewportWindow = navigation.getByRole("slider", {
    name: "Viewport window; drag to pan",
  });
  for (let index = 0; index < 10; index += 1) await viewportWindow.press("ArrowUp");
  await viewportWindow.press("End");
  const geometry = await navigation.evaluate((root) => {
    const axis = root.querySelector<HTMLElement>('[data-seq-viewer-navigation="axis"]');
    const window = root.querySelector<HTMLElement>('[data-seq-viewer-navigation="window"]');
    if (axis === null || window === null) throw new Error("Missing reference navigation geometry.");
    const rootBox = root.getBoundingClientRect();
    const axisBox = axis.getBoundingClientRect();
    const windowBox = window.getBoundingClientRect();
    return {
      rootRight: rootBox.right,
      axisLeft: axisBox.left,
      axisRight: axisBox.right,
      windowLeft: windowBox.left,
      windowRight: windowBox.right,
    };
  });
  expect(geometry.windowLeft).toBeGreaterThanOrEqual(geometry.axisLeft - 0.5);
  expect(geometry.windowRight).toBeLessThanOrEqual(geometry.axisRight + 0.5);
  expect(geometry.axisRight).toBeLessThanOrEqual(geometry.rootRight + 0.5);
});

test("rapid normalized activations leave the latest complete request inspected", async ({
  page,
}) => {
  await page.goto("/#/uniprot-structure");
  await expect(page.getByTestId("inspect-harness-status")).toContainText("ready");
  const tracks = page.getByTestId("uniprot-tracks-host");
  await tracks.locator('[data-seqstar-track-activate="regions"]').click();
  await tracks.locator('[data-seqstar-track-activate="variants"]').click();
  await expect(page.getByTestId("inspect-mvs-request-id")).toContainText(
    "dataset-1-P04637-1TUP-variants-",
  );
  await expect(page.getByTestId("inspect-mapping-items")).toContainText("variant-R337H: unmapped");
  await expect(page.getByTestId("inspect-mapping-items")).not.toContainText("dna-binding");
  await expect(page.getByTestId("inspect-mvs-lifecycle")).toHaveText(/rendered|degraded/u, {
    timeout: 20_000,
  });
});

test("switches three audited datasets and inspects the latest validated documents", async ({
  page,
}) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.protocol !== "data:" &&
      url.protocol !== "blob:" &&
      !["127.0.0.1", "localhost", "::1"].includes(url.hostname)
    )
      external.push(url.href);
  });
  await page.goto("/#/uniprot-structure");
  await expect(page.getByTestId("inspect-harness-status")).toContainText("ready");
  const selector = page.getByTestId("dataset-selector");
  await expect(selector).toHaveValue("P04637-1TUP");
  await expect(selector.locator("option")).toHaveCount(3);
  await expect(page.getByTestId("uniprot-tracks-host")).toContainText("Regions and domains");
  await expect(
    page.getByTestId("uniprot-tracks-host").locator("[data-seqstar-track-activate]"),
  ).toHaveCount(6);
  await expect(page.getByTestId("inspect-seqviewspec-json")).toContainText(
    '"id": "P04637-1TUP-uniprot-structure"',
  );

  await page.evaluate(() => {
    const states: Array<{ status: string; disabled: boolean; headings: string[] }> = [];
    const capture = () =>
      states.push({
        status:
          document.querySelector<HTMLElement>('[data-testid="dataset-status"]')?.innerText ?? "",
        disabled:
          document.querySelector<HTMLSelectElement>('[data-testid="dataset-selector"]')?.disabled ??
          false,
        headings: [
          ...document.querySelectorAll<HTMLElement>('[data-testid="case-uniprot-structure"] h2'),
        ].map((element) => element.innerText),
      });
    capture();
    new MutationObserver(capture).observe(
      document.querySelector('[data-testid="case-uniprot-structure"]') ?? document.body,
      { attributes: true, childList: true, subtree: true },
    );
    (
      window as unknown as { h40DatasetTransitionStates: typeof states }
    ).h40DatasetTransitionStates = states;
  });
  await selector.selectOption("P69905-1A3N");
  await expect(page.getByTestId("dataset-status")).toContainText("P69905");
  await expect(page.getByTestId("dataset-status")).toContainText("active");
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            h40DatasetTransitionStates: Array<{
              status: string;
              disabled: boolean;
              headings: string[];
            }>;
          }
        ).h40DatasetTransitionStates,
    ),
  ).toContainEqual({
    status:
      "Hemoglobin alpha (P69905) / 1A3N · switching · previous Human p53 (P04637) / 1TUP remains until both viewers confirm the switch",
    disabled: true,
    headings: expect.arrayContaining([
      "Sequence tracks — transition pending",
      "Mol* / MolViewSpec — transition pending",
    ]),
  });
  await expect(selector).toBeEnabled();
  await expect(page.getByRole("heading", { name: /Hemoglobin alpha.*tracks/u })).toBeVisible();
  await expect(page.getByRole("heading", { name: "1A3N / MolViewSpec" })).toBeVisible();
  await expect(page.getByTestId("uniprot-tracks-host")).toContainText("PF00042.29 conservation");
  await expect(
    page.getByTestId("uniprot-tracks-host").locator("[data-seqstar-track-activate]"),
  ).toHaveCount(4);
  await expect(page.getByTestId("inspect-seqviewspec-json")).toContainText(
    '"id": "P69905-1A3N-sequence-structure"',
  );
  await page
    .getByTestId("uniprot-tracks-host")
    .locator('[data-seqstar-track-activate="alignment-conservation"]')
    .click();
  await expect(page.getByTestId("inspect-mvs-request-id")).toContainText(
    "P69905-1A3N-alignment-conservation",
  );
  await expect(page.getByTestId("inspect-mvs-lifecycle")).toHaveText(/rendered|degraded/u, {
    timeout: 20_000,
  });
  await expect(page.getByTestId("inspect-mvs-json")).toContainText("PF00042.29 conservation");

  await selector.selectOption("P00648-1BRS-A");
  await expect(page.getByTestId("dataset-status")).toContainText("P00648");
  await expect(page.getByTestId("dataset-status")).toContainText("active");
  await expect(selector).toBeEnabled();
  await expect(page.getByRole("heading", { name: /Barnase.*tracks/u })).toBeVisible();
  await expect(page.getByRole("heading", { name: "1BRS / MolViewSpec" })).toBeVisible();
  await expect(page.getByTestId("uniprot-tracks-host")).toContainText("Signal peptide");
  await expect(
    page.getByTestId("uniprot-tracks-host").locator("[data-seqstar-track-activate]"),
  ).toHaveCount(5);
  await expect(page.getByTestId("inspect-seqviewspec-json")).toContainText(
    '"id": "P00648-1BRS-chain-A-sequence-structure"',
  );
  await page
    .getByTestId("uniprot-tracks-host")
    .locator('[data-seqstar-track-activate="interface-residues"]')
    .click();
  await expect(page.getByTestId("inspect-mvs-request-id")).toContainText(
    "P00648-1BRS-A-interface-residues",
  );
  await expect(page.getByTestId("inspect-mvs-lifecycle")).toHaveText(/rendered|degraded/u, {
    timeout: 20_000,
  });
  await expect(page.getByTestId("inspect-mapping-counts")).toContainText("mapped 19");

  await selector.evaluate((element) => {
    const select = element as HTMLSelectElement;
    select.value = "P69905-1A3N";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    select.value = "P00648-1BRS-A";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.getByTestId("dataset-status")).toContainText("P00648");
  await expect(page.getByTestId("dataset-status")).toContainText("active");
  await expect(page.getByTestId("inspect-seqviewspec-json")).toContainText(
    '"id": "P00648-1BRS-chain-A-sequence-structure"',
  );
  await expect(page.getByTestId("inspect-seq-request-id")).toContainText(
    "dataset-5-P00648-1BRS-A-sequence",
  );
  await expect(page.getByTestId("inspect-mvs-request-id")).toContainText(
    "dataset-5-P00648-1BRS-A-neutral",
  );
  await expect(page.getByTestId("inspect-mvs-lifecycle")).toHaveText(/rendered|degraded/u, {
    timeout: 20_000,
  });
  await page.getByTestId("inspect-tab-mvs").click();
  await expect(page.getByTestId("inspect-mvs-json")).toContainText("1BRS barnase chain A");
  await page.getByTestId("inspect-tab-summary").click();
  await page
    .getByTestId("uniprot-tracks-host")
    .locator('[data-seqstar-track-activate="interface-residues"]')
    .click();
  await expect(page.getByTestId("inspect-mvs-request-id")).toContainText(
    "P00648-1BRS-A-interface-residues",
  );
  await expect(page.getByTestId("inspect-mvs-lifecycle")).toHaveText(/rendered|degraded/u, {
    timeout: 20_000,
  });
  await expect(page.getByTestId("inspect-mapping-counts")).toContainText("mapped 19");
  await expect(page.getByTestId("inspect-seq-request-id")).toContainText(
    "dataset-5-P00648-1BRS-A-sequence",
  );

  const inspector = page.getByTestId("inspect-panel");
  await expect(inspector).toHaveCSS("overflow-y", "auto");
  expect(await inspector.evaluate((element) => getComputedStyle(element).maxHeight)).toBe("576px");

  await page.getByTestId("inspect-tab-seqviewspec").click();
  const seqDownloadButton = page.getByTestId("inspect-download-seqviewspec");
  await expect(seqDownloadButton).toBeEnabled();
  const [seqDownload] = await Promise.all([
    page.waitForEvent("download"),
    seqDownloadButton.click(),
  ]);
  const seqPath = await seqDownload.path();
  expect(seqPath).not.toBeNull();
  expect(JSON.parse(await readFile(seqPath as string, "utf8"))).toMatchObject({
    kind: "seq-view-spec",
    id: "P00648-1BRS-chain-A-sequence-structure",
  });
  await page.getByTestId("inspect-copy-seqviewspec").click();
  await expect(page.getByTestId("inspect-copy-status-seqviewspec")).toHaveText("Copied");

  await page.getByTestId("inspect-tab-mvs").click();
  const mvsDownloadButton = page.getByTestId("inspect-download-mvs");
  await expect(mvsDownloadButton).toBeEnabled();
  const [mvsDownload] = await Promise.all([
    page.waitForEvent("download"),
    mvsDownloadButton.click(),
  ]);
  const mvsPath = await mvsDownload.path();
  expect(mvsPath).not.toBeNull();
  expect(JSON.parse(await readFile(mvsPath as string, "utf8"))).toMatchObject({
    root: { kind: "root" },
    metadata: { version: "1" },
  });
  await page.getByTestId("inspect-copy-mvs").click();
  await expect(page.getByTestId("inspect-copy-status-mvs")).toHaveText("Copied");
  await page.getByTestId("inspect-tab-messages").click();
  const visibleMessages = page.getByTestId("inspect-message-list").getByRole("listitem");
  expect(await visibleMessages.count()).toBeLessThanOrEqual(100);
  await page.goto("/#/");
  await page.goto("/#/uniprot-structure");
  await expect(page.getByTestId("inspect-harness-status")).toContainText("ready");
  await expect(page.getByTestId("dataset-selector")).toHaveValue("P04637-1TUP");
  await expect
    .poll(() =>
      page.evaluate(() =>
        Number(document.documentElement.dataset.seqstarHarnessTelemetrySubscriptions),
      ),
    )
    .toBe(1);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
