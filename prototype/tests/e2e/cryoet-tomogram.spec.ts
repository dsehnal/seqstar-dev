import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

const inspectLatestMessageWithoutPointerMove = async (
  page: Page,
  type: string,
): Promise<string> => {
  await page
    .getByTestId("inspect-tab-messages")
    .evaluate((element: HTMLButtonElement) => element.click());
  await page
    .getByTestId(`inspect-message-${type}`)
    .last()
    .evaluate((element: HTMLButtonElement) => element.click());
  return (await page.getByTestId("inspect-message-json").textContent()) ?? "";
};

const sequence =
  "MSKTIVLSVGEATRTLTEIQSTADRQIFEEKVGPLVGRLRLTASLRQNGAKTAYRVNLKLDQADVVDCSTSVCGELPKVRYTQVWSHDVTIVANSTEASRKSLYDLTKSLVATSQVEDLVVNLVPLGR";
const particles = Array.from({ length: 128 }, (_, index) =>
  JSON.stringify({
    type: "orientedPoint",
    location: { x: (index * 83) % 1230, y: (index * 47) % 1230, z: (index * 19) % 480 },
    xyz_rotation_matrix: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
  }),
).join("\n");
const pointParticles = Array.from({ length: 140 }, (_, index) =>
  JSON.stringify({
    type: "point",
    location: { x: (index * 83) % 1230, y: (index * 47) % 1230, z: (index * 19) % 480 },
  }),
).join("\n");
const uniprot = {
  primaryAccession: "P03630",
  proteinDescription: { recommendedName: { fullName: { value: "Capsid protein" } } },
  organism: { scientificName: "Pseudomonas phage PP7" },
  sequence: { length: 128, value: sequence },
  features: [
    {
      type: "Chain",
      description: "Capsid protein",
      location: { start: { value: 2 }, end: { value: 127 } },
    },
    {
      type: "Binding site",
      description: "",
      location: { start: { value: 40 }, end: { value: 40 } },
    },
    {
      type: "Disulfide bond",
      description: "Interchain",
      location: { start: { value: 68 }, end: { value: 68 } },
    },
    {
      type: "Mutagenesis",
      description: "Loss of activity",
      location: { start: { value: 46 }, end: { value: 46 } },
    },
  ],
};
const emdb = {
  admin: { title: "Live PP7 average" },
  structure_determination_list: {
    structure_determination: [
      { image_processing: [{ final_reconstruction: { resolution: { valueOf_: "3.0" } } }] },
    ],
  },
  map: {
    contour_list: { contour: [{ level: 0.0231 }] },
    statistics: { average: 0, std: 0.0046222196 },
  },
};
const sifts = {
  "1dwn": {
    UniProt: {
      P03630: {
        mappings: ["A", "B", "C"].map((chain_id) => ({ chain_id, identity: 1, coverage: 0.992 })),
      },
    },
  },
};

test("links a live-shaped tomogram particle to density, representative structure, and protein", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const structure = (await readFile("fixtures/complex/input/1BRS.cif", "utf8"))
    .replace("data_1BRS", "data_1DWN")
    .replace("_entry.id   1BRS", "_entry.id   1DWN");
  const seen = new Set<string>();
  await page.route("https://files.cryoetdataportal.cziscience.com/**", async (route) => {
    const url = route.request().url();
    seen.add(url);
    if (url.endsWith(".ndjson"))
      await route.fulfill({
        body: url.includes("/Annotations/101/") ? pointParticles : particles,
        contentType: "application/x-ndjson",
      });
    else if (url.endsWith(".png")) await route.fulfill({ body: image, contentType: "image/png" });
    else await route.abort();
  });
  await page.route("https://www.ebi.ac.uk/emdb/api/entry/EMD-77085", async (route) => {
    seen.add(route.request().url());
    await route.fulfill({ json: emdb });
  });
  await page.route("https://rest.uniprot.org/uniprotkb/P03630.json", async (route) => {
    seen.add(route.request().url());
    await route.fulfill({ json: uniprot });
  });
  await page.route("https://www.ebi.ac.uk/pdbe/api/mappings/uniprot/1dwn", async (route) => {
    seen.add(route.request().url());
    await route.fulfill({ json: sifts });
  });
  await page.route("https://www.ebi.ac.uk/pdbe/densities/emd/emd-77085/**", async (route) => {
    seen.add(route.request().url());
    await route.fulfill({
      status: 503,
      body: "Density rendering is covered by structural unit tests.",
    });
  });
  await page.route(
    "https://www.ebi.ac.uk/pdbe/entry-files/download/1dwn_updated.cif",
    async (route) => {
      seen.add(route.request().url());
      await route.fulfill({ body: structure, contentType: "chemical/x-mmcif" });
    },
  );
  await page.route("https://neuroglancer-demo.appspot.com/**", async (route) => {
    await route.fulfill({
      body: "<html><body>Read-only Neuroglancer test seam</body></html>",
      contentType: "text/html",
    });
  });

  await page.goto("/#/cryoet-tomogram");
  await expect(
    page.getByRole("heading", { name: "Cryo-ET particle → density → structure → protein" }),
  ).toBeVisible();
  const tomogram = page.getByTestId("cryoet-tomogram-host");
  await expect(tomogram.locator(".tomogram-particle")).toHaveCount(128);
  await expect(page.getByText("A, B, C · 99.2% coverage")).toBeVisible();
  await tomogram
    .getByRole("button", { name: "Select PP7 virus-like particle 1", exact: true })
    .click();
  await expect(page.getByTestId("cryoet-selected-object")).toContainText("AN-134660:0001");
  await expect(page.getByTestId("cryoet-selected-object")).toContainText("EMD-77085 · 3.0 Å");
  await expect(page.getByRole("link", { name: "Open EMD-77085 source" })).toHaveAttribute(
    "href",
    /EMD-77085/u,
  );
  await expect(page.getByRole("link", { name: "Open 1DWN source" })).toHaveAttribute(
    "href",
    /1dwn/iu,
  );
  await expect(page.getByRole("link", { name: "Open P03630 source" })).toHaveAttribute(
    "href",
    /P03630/u,
  );
  await expect(tomogram.locator("iframe")).toHaveCount(0);
  await expect(tomogram.getByRole("link", { name: /Open full Neuroglancer/u })).toBeVisible();

  await page.getByRole("button", { name: "1DWN", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Representative atomic structure" }),
  ).toBeVisible();
  await expect(page.getByText(/MolViewSpec: cryoet-structure-\d+ · rendered/u)).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId("cryoet-sequence-host").locator("canvas")).toBeVisible();
  await expect(page.getByTestId("cryoet-structure-host").locator("canvas")).toBeVisible();

  const sequenceCanvas = page
    .getByTestId("cryoet-sequence-host")
    .locator('[data-seq-viewer="canvas"]');
  await sequenceCanvas.scrollIntoViewIfNeeded();
  const sequenceBox = await sequenceCanvas.boundingBox();
  if (sequenceBox === null) throw new Error("Expected the P03630 sequence canvas.");
  const sequenceCell = (sequenceBox.width - 152) / 128;
  await page.mouse.move(sequenceBox.x + 152 + 39.5 * sequenceCell, sequenceBox.y + 32);
  const structureHover = await inspectLatestMessageWithoutPointerMove(
    page,
    "interaction.highlight.apply",
  );
  expect(structureHover).toContain('"component": "cryoet-structure"');
  expect(structureHover).toContain('"value": "label:38|auth:38"');

  await page.getByTestId("inspect-tab-summary").click();
  const structureCanvas = page.getByTestId("cryoet-structure-host").locator("canvas").first();
  await structureCanvas.scrollIntoViewIfNeeded();
  const structureBox = await structureCanvas.boundingBox();
  if (structureBox === null) throw new Error("Expected the 1DWN Mol* canvas.");
  let nativeStructureHover = "";
  for (const yFraction of [0.35, 0.5, 0.65]) {
    for (const xFraction of [0.35, 0.5, 0.65]) {
      await page.mouse.move(
        structureBox.x + structureBox.width * xFraction,
        structureBox.y + structureBox.height * yFraction,
      );
      await page.waitForTimeout(100);
      const latest = await inspectLatestMessageWithoutPointerMove(page, "interaction.native");
      if (latest.includes('"component": "cryoet-structure"') && latest.includes('"phase": "set"')) {
        nativeStructureHover = latest;
        break;
      }
    }
    if (nativeStructureHover.length > 0) break;
  }
  expect(nativeStructureHover).toContain('"value": "label:');
  const sequenceHover = await inspectLatestMessageWithoutPointerMove(
    page,
    "interaction.highlight.apply",
  );
  expect(sequenceHover).toContain('"component": "cryoet-sequence"');
  expect(sequenceHover).toContain('"kind": "index"');

  await page.getByRole("button", { name: "EMD-77085", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Subtomogram average density" })).toBeVisible();
  // The offline seam deliberately returns 503 for the large live BCIF. The
  // production MVS is structurally checked in unit coverage; here the click
  // must still issue the density request and move the viewport to Mol*.
  await expect(page.getByTestId("inspect-panel-container")).toContainText(
    /pending structure: cryoet-density-\d+/u,
  );
  await expect
    .poll(async () => {
      const bounds = await page.getByTestId("visualizer-panel-cryoet-structure").boundingBox();
      const height = await page.evaluate(() => window.innerHeight);
      return bounds === null ? false : bounds.y < height && bounds.y + bounds.height > 0;
    })
    .toBe(true);

  await page.getByRole("button", { name: "Activate track Binding and disulfide sites" }).click();
  await expect(page.getByTestId("inspect-mvs-request-id")).toContainText("cryoet-structure-sites-");
  await expect(page.getByTestId("inspect-mvs-lifecycle")).toHaveText(/rendered|degraded/u, {
    timeout: 20_000,
  });
  await page.getByTestId("inspect-tab-mvs").click();
  await expect(page.getByTestId("inspect-mvs-json")).toContainText("ball_and_stick");
  await expect(page.getByTestId("inspect-mvs-json")).toContainText("#D97706");
  await expect(page.getByTestId("inspect-mvs-json")).toContainText('"label_seq_id": 39');
  await page.getByTestId("inspect-tab-summary").click();

  await page
    .getByRole("button", { name: "Activate track Synthetic structure fit quality" })
    .click();
  await expect(page.getByTestId("inspect-mvs-request-id")).toContainText(
    "cryoet-structure-fit-quality-",
  );
  await expect(page.getByTestId("inspect-mvs-lifecycle")).toHaveText(/rendered|degraded/u, {
    timeout: 20_000,
  });
  await page.getByTestId("inspect-tab-mvs").click();
  await expect(page.getByTestId("inspect-mvs-json")).toContainText("#DC2626");
  await expect(page.getByTestId("inspect-mvs-json")).toContainText("#059669");
  await expect(page.getByTestId("inspect-mvs-json")).not.toContainText("ball_and_stick");
  await page.getByTestId("inspect-tab-summary").click();

  await page.getByLabel("Sequence renderer").selectOption("nightingale");
  await expect(page.getByText("nightingale renderer ready")).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByTestId("cryoet-sequence-host").locator('[data-seqstar-nightingale="root"]'),
  ).toBeVisible();
  await page.getByTestId("cryoet-dataset-selector").selectOption("points");
  await expect(page.getByTestId("cryoet-tomogram-host").locator(".tomogram-particle")).toHaveCount(
    140,
    { timeout: 20_000 },
  );
  await expect(page.getByTestId("cryoet-selected-object")).toContainText(
    "140 live point annotations",
  );
  expect([...seen]).toEqual(
    expect.arrayContaining([
      expect.stringContaining("pseudomonas_phage_pp7_vlp-1.0_orientedpoint.ndjson"),
      "https://www.ebi.ac.uk/emdb/api/entry/EMD-77085",
      "https://rest.uniprot.org/uniprotkb/P03630.json",
      "https://www.ebi.ac.uk/pdbe/api/mappings/uniprot/1dwn",
      "https://www.ebi.ac.uk/pdbe/entry-files/download/1dwn_updated.cif",
    ]),
  );
});
