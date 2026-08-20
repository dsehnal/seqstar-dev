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
