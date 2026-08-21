import { expect, test } from "@playwright/test";

test("shows native local events, relationship endpoints, external owner commands, and navigation", async ({
  page,
}) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "data:" && !["127.0.0.1", "localhost"].includes(url.hostname))
      external.push(request.url());
  });
  await page.goto("/#/reference-viewer");
  await expect(page).toHaveURL(/#\/reference-viewer$/u);
  const host = page.getByTestId("reference-viewer-host");
  const canvas = host.locator('[data-seq-viewer="canvas"]');
  await expect(canvas).toBeVisible();
  await expect(page.getByTestId("reference-viewer-lifecycle")).toContainText(
    "reference-diagnostic-initial: rendered",
  );
  await expect(host.locator("[data-seq-viewer-track]")).toHaveCount(3);
  const bounds = await canvas.boundingBox();
  if (bounds === null) throw new Error("Expected the reference viewer canvas.");
  const cell = (bounds.width - 156) / 37;

  await page.mouse.move(bounds.x + 156 + 5.5 * cell, bounds.y + 20 + 25 + 12.5);
  await expect(page.getByTestId("reference-viewer-hover")).toContainText('"value\\":5');

  // This dedicated native canvas track keeps the endpoint hit target unambiguous.
  const relationshipY = bounds.y + 20 + 12.5;
  const relationshipX = bounds.x + 156 + 18.5 * cell;
  await page.mouse.move(relationshipX, relationshipY);
  expect(errors).toEqual([]);
  await expect(page.getByTestId("reference-viewer-native-events")).toContainText("diagnostic-pair");
  await expect(page.getByTestId("reference-viewer-hover")).toContainText("diagnostic-pair");
  await expect(page.getByTestId("reference-viewer-hover")).toContainText("upstream");
  await expect(page.getByTestId("reference-viewer-hover")).toContainText('"value\\":18');
  await expect(page.getByTestId("reference-viewer-hover")).toContainText('"value\\":29');
  await page.mouse.click(relationshipX, relationshipY);
  await expect(page.getByTestId("reference-viewer-selection")).toContainText(
    '"interaction":"select"',
  );
  await expect(page.getByTestId("reference-viewer-selection")).toContainText(
    '"itemId\\":\\"diagnostic-pair',
  );
  await expect(page.getByTestId("reference-viewer-selection")).toContainText(
    '"endpointRole\\":\\"upstream',
  );
  await expect(page.getByTestId("reference-viewer-selection")).toContainText('"value\\":18');
  await expect(page.getByTestId("reference-viewer-selection")).toContainText('"value\\":29');

  await page.getByTestId("reference-viewer-apply-external").click();
  await expect(page.getByTestId("reference-viewer-external")).toHaveText("external owner active");
  await expect(host).toHaveAttribute("data-seqstar-applied-highlights", "1");
  await page.getByTestId("reference-viewer-clear-external").click();
  await expect(page.getByTestId("reference-viewer-external")).toHaveText(
    "no external owner active",
  );
  await expect(host).toHaveAttribute("data-seqstar-applied-highlights", "0");

  const navigation = host.locator('[data-seq-viewer-navigation="root"]');
  const viewportWindow = navigation.getByRole("slider", {
    name: "Viewport window; drag to pan",
  });
  await viewportWindow.press("ArrowUp");
  await viewportWindow.press("End");
  await expect(page.getByTestId("reference-viewer-viewport")).toContainText('"totalColumns":37');
  await expect(page.getByTestId("reference-viewer-viewport")).toContainText('"diagnostic-axis"');
  expect(external).toEqual([]);
});
