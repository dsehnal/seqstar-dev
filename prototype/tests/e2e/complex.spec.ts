import { expect, test } from "@playwright/test";

test("runs the offline 1BRS multi-polymer interface flow through native reference-viewer activation", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "data:" && !["127.0.0.1", "localhost"].includes(url.hostname))
      external.push(request.url());
  });
  await page.goto("/#/complex");
  await expect(page).toHaveURL(/#\/complex$/u);
  await expect(page.getByTestId("p50-harness-status")).toContainText("ready");
  await expect(page.getByTestId("p50-synthetic-label")).toContainText(
    "not a biological prediction",
  );
  const sequence = page.getByTestId("complex-sequence-host");
  await expect(sequence.locator("[data-seq-viewer-track]")).toHaveCount(5);
  await expect(sequence.locator('[data-seq-viewer-track="polymer-regions"]')).toBeVisible();
  await sequence.locator('[data-seq-viewer-track="interface"]').click();
  await expect(page.getByTestId("p50-request-id")).toContainText("P50-interface-");
  await expect(page.getByTestId("p50-role-summary")).toContainText("barnase: 19");
  await expect(page.getByTestId("p50-role-summary")).toContainText("barstar: 16");
  await expect(page.getByTestId("p50-mvs-json")).toContainText('"label_asym_id": "A"');
  await expect(page.getByTestId("p50-mvs-json")).toContainText('"label_asym_id": "D"');
  await expect(page.getByTestId("p50-lifecycle")).toHaveText(/rendered|degraded/u, {
    timeout: 20_000,
  });
  expect(external).toEqual([]);
});

test("replaces a complex request with the latest native track activation", async ({ page }) => {
  await page.goto("/#/complex");
  await expect(page.getByTestId("p50-harness-status")).toContainText("ready");
  const sequence = page.getByTestId("complex-sequence-host");
  await sequence.locator('[data-seq-viewer-track="interface"]').click();
  await sequence.locator('[data-seq-viewer-track="contacts"]').click();
  await expect(page.getByTestId("p50-request-id")).toContainText("P50-interface-");
  await expect(page.getByTestId("p50-role-summary")).toContainText("43 contacts");
});
