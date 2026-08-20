import { expect, test } from "@playwright/test";

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
