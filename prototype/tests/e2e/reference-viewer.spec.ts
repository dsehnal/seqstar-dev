import { expect, test } from "@playwright/test";

test("loads the reference wrapper diagnostic route entirely from local assets", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "data:" && !["127.0.0.1", "localhost"].includes(url.hostname))
      external.push(request.url());
  });
  await page.goto("/#/reference-viewer");
  await expect(page).toHaveURL(/#\/reference-viewer$/u);
  await expect(page.getByTestId("reference-viewer-host")).toBeVisible();
  await expect(
    page.getByTestId("reference-viewer-host").locator('[data-seq-viewer="canvas"]'),
  ).toBeVisible();
  await expect(page.getByTestId("reference-viewer-lifecycle")).toContainText("rendered");
  await expect(page.getByTestId("reference-viewer-lifecycle")).toContainText(
    "reference-diagnostic-initial: rendered",
  );
  expect(external).toEqual([]);
});
