import { expect, type Page, test } from "@playwright/test";

type Profile = {
  readonly components: number;
  readonly representations: Record<string, number>;
  readonly selectors: number;
};

const inspectProfile = async (page: Page) =>
  page.getByTestId("inspect-mvs-json").evaluate((element): Profile => {
    const document = JSON.parse(element.textContent ?? "{}") as {
      readonly root?: unknown;
      readonly snapshots?: readonly { readonly root?: unknown }[];
    };
    let components = 0;
    let selectors = 0;
    const representations: Record<string, number> = {};
    const visit = (node: unknown): void => {
      if (node === null || typeof node !== "object") return;
      const value = node as {
        readonly kind?: unknown;
        readonly params?: { readonly type?: unknown; readonly selector?: unknown };
        readonly children?: readonly unknown[];
      };
      if (value.kind === "component") components++;
      if (value.kind === "representation" && typeof value.params?.type === "string")
        representations[value.params.type] = (representations[value.params.type] ?? 0) + 1;
      if (value.kind === "color" && Array.isArray(value.params?.selector))
        selectors += value.params.selector.length;
      value.children?.forEach(visit);
    };
    if (document.root !== undefined) visit(document.root);
    document.snapshots?.forEach((snapshot) => {
      visit(snapshot.root);
    });
    return { components, representations, selectors };
  });

const blockExternalRequests = async (page: Page) => {
  const external: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.protocol === "data:" ||
      url.protocol === "blob:" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "localhost" ||
      url.hostname === "::1"
    ) {
      await route.continue();
      return;
    }
    external.push(url.href);
    await route.abort("blockedbyclient");
  });
  return external;
};

test("renders every revised P04637 and 1BRS MVS profile offline without accumulating geometry", async ({
  page,
}) => {
  const external = await blockExternalRequests(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/#/uniprot-structure");
  await expect(page.getByTestId("inspect-harness-status")).toContainText("ready");
  await expect
    .poll(() =>
      page.evaluate(() =>
        Number(document.documentElement.dataset.seqstarHarnessTelemetrySubscriptions),
      ),
    )
    .toBe(1);
  const tracks = page.getByTestId("uniprot-tracks-host");
  for (const profile of [
    {
      track: "missense-score",
      request: "dataset-1-P04637-1TUP-missense-score-",
      selectors: 196,
      components: 1,
      representations: { cartoon: 1 },
    },
    {
      track: "structure-coverage",
      request: "dataset-1-P04637-1TUP-structure-coverage-",
      selectors: 196,
      components: 1,
      representations: { cartoon: 1 },
    },
    {
      track: "regions",
      request: "dataset-1-P04637-1TUP-regions-",
      selectors: 196,
      components: 1,
      representations: { cartoon: 1 },
    },
    {
      track: "sites",
      request: "dataset-1-P04637-1TUP-sites-",
      selectors: 2,
      components: 3,
      representations: { ball_and_stick: 2, cartoon: 1 },
    },
    {
      track: "variants",
      request: "dataset-1-P04637-1TUP-variants-",
      selectors: 2,
      components: 1,
      representations: { cartoon: 1 },
    },
  ] as const) {
    await tracks.locator(`[data-seqstar-track-activate="${profile.track}"]`).click();
    await expect(page.getByTestId("inspect-mvs-request-id")).toContainText(profile.request);
    await expect(page.getByTestId("inspect-mvs-lifecycle")).toHaveText(/rendered|degraded/u, {
      timeout: 20_000,
    });
    await expect
      .poll(() => inspectProfile(page))
      .toEqual({
        components: profile.components,
        representations: profile.representations,
        selectors: profile.selectors,
      });
  }

  await page.goto("/#/complex");
  await expect(page.getByTestId("p50-harness-status")).toContainText("ready");
  await expect
    .poll(() =>
      page.evaluate(() =>
        Number(document.documentElement.dataset.seqstarHarnessTelemetrySubscriptions),
      ),
    )
    .toBe(1);
  const sequence = page.getByTestId("complex-sequence-host");
  await sequence.locator('[data-seq-viewer-track="interface"]').click();
  await expect(page.getByTestId("inspect-mvs-lifecycle")).toHaveText(/rendered|degraded/u, {
    timeout: 20_000,
  });
  await expect
    .poll(() => inspectProfile(page))
    .toEqual({
      components: 4,
      representations: { ball_and_stick: 2, cartoon: 2 },
      selectors: 35,
    });

  const canvas = sequence.locator('[data-seq-viewer="canvas"]');
  const bounds = await canvas.boundingBox();
  if (bounds === null) throw new Error("Expected the complex sequence canvas.");
  const cell = (bounds.width - 156 - 32) / 247;
  await page.mouse.click(bounds.x + 156 + (73 + 0.5) * cell, bounds.y + 20 + 4 * 25 + 12.5);
  await expect(page.getByTestId("inspect-mvs-request-id")).toContainText(
    "P50-undefined-1brs-A-D-001-",
  );
  await expect(page.getByTestId("inspect-mvs-lifecycle")).toHaveText(/rendered|degraded/u, {
    timeout: 20_000,
  });
  await expect
    .poll(() => inspectProfile(page))
    .toEqual({
      components: 5,
      representations: { ball_and_stick: 2, cartoon: 2 },
      // Only cartoon color nodes contribute here; the two focused endpoint selectors
      // intentionally live on their own component rather than a color node.
      selectors: 2,
    });

  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
