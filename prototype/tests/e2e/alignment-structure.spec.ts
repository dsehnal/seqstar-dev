import { expect, test } from "@playwright/test";

test("loads the offline PF00042.29 alignment / 1A3N structure case", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "data:" && !["127.0.0.1", "localhost"].includes(url.hostname))
      external.push(request.url());
  });
  await page.goto("/#/alignment-structure");
  await expect(page).toHaveURL(/#\/alignment-structure$/u);
  await expect(page.getByTestId("p60-harness-status")).toContainText("ready");
  await expect(
    page.getByTestId("pf00042-alignment-host").locator('[data-seq-viewer="canvas"]'),
  ).toBeVisible();
  await expect(page.getByTestId("p69905-structure-host").getByRole("combobox")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId("p60-mapping-summary")).toContainText("118 columns");
  expect(external).toEqual([]);
});

test("keeps the query member identity stable while its row scrolls out and back in", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "data:" && !["127.0.0.1", "localhost"].includes(url.hostname))
      external.push(request.url());
  });
  await page.goto("/#/alignment-structure");
  await expect(page.getByTestId("p60-harness-status")).toContainText("ready");
  await expect(page.getByTestId("p69905-structure-host").getByRole("combobox")).toBeVisible({
    timeout: 20_000,
  });

  const host = page.getByTestId("pf00042-alignment-host");
  await host.evaluate((element) => {
    Object.assign((element as HTMLElement).style, {
      height: "240px",
      minHeight: "240px",
      maxHeight: "240px",
    });
  });
  const root = host.locator('[data-seq-viewer="root"]');
  const canvas = host.locator('[data-seq-viewer="canvas"]');
  await expect.poll(() => root.evaluate((element) => element.clientHeight)).toBeLessThan(300);
  const queryMember = host.getByRole("button", {
    name: "Activate track PF00042.29 members · HBA_HUMAN-27-137:member",
  });
  await expect(queryMember).toBeInViewport();
  const stableLabel = await queryMember.getAttribute("aria-label");

  await canvas.evaluate((element) => {
    const box = element.getBoundingClientRect();
    element.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: box.left + 160,
        clientY: box.top + 34,
      }),
    );
  });
  const paths = page.getByTestId("p60-composed-paths");
  await expect(paths).toContainText("PF00042.29 · HBA_HUMAN-27-137:member");
  await expect(paths).toContainText("alignment-to-structure · hover · exact");
  await expect(paths).toContainText(
    "p60.PF00042.29.column-to-HBA_HUMAN-27-137:member -> p60.P69905.sequence-to-1A3N-chain-A",
  );

  const scrollMetrics = await root.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return { top: element.scrollTop, height: element.clientHeight, total: element.scrollHeight };
  });
  expect(scrollMetrics.total).toBeGreaterThan(scrollMetrics.height);
  expect(scrollMetrics.top).toBeGreaterThan(0);
  await expect(queryMember).not.toBeInViewport();

  await root.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(queryMember).toBeInViewport();
  await expect(queryMember).toHaveAttribute("aria-label", stableLabel ?? "");
  await canvas.evaluate((element) => {
    const box = element.getBoundingClientRect();
    element.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: box.left + 160,
        clientY: box.top + 34,
      }),
    );
  });
  await expect(
    paths.locator("li").filter({
      hasText: /PF00042\.29 · HBA_HUMAN-27-137:member .* hover · exact/u,
    }),
  ).toHaveCount(2);
  expect(external).toEqual([]);
});
