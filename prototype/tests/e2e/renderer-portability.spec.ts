import { expect, test } from "@playwright/test";

test("renders the offline P04637 portability case with one shared document", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "data:" && !["127.0.0.1", "localhost"].includes(url.hostname))
      external.push(request.url());
  });
  await page.goto("/#/renderer-portability");
  await expect(page).toHaveURL(/#\/renderer-portability$/u);
  await expect(page.getByTestId("renderer-document-id")).toHaveText(
    "uniprot-P04637-renderer-portability",
  );
  await expect(page.getByTestId("renderer-document-digest")).toHaveText(/^sha256-[a-f0-9]{64}$/u);
  await expect(
    page.getByTestId("base-sequence-host").locator('[data-seq-viewer="canvas"]'),
  ).toBeVisible();
  await expect(
    page.getByTestId("nightingale-sequence-host").locator('[data-seqstar-nightingale="root"]'),
  ).toBeVisible();
  await expect(page.getByTestId("base-sequence-lifecycle")).toHaveText("rendered");
  await expect(page.getByTestId("nightingale-sequence-lifecycle")).toHaveText("degraded");
  await expect(page.getByTestId("nightingale-fallback-status")).toContainText(
    "Some richer track styles",
  );
  await expect(page.getByTestId("nightingale-fallback-status")).not.toContainText(
    "wrapper.nightingale.fallback.bars-heatmap",
  );
  const hostHeights = async () =>
    page.evaluate(() => ({
      reference: document
        .querySelector<HTMLElement>('[data-testid="base-sequence-host"]')
        ?.getBoundingClientRect().height,
      nightingale: document
        .querySelector<HTMLElement>('[data-testid="nightingale-sequence-host"]')
        ?.getBoundingClientRect().height,
    }));
  await expect.poll(hostHeights).toEqual({ reference: 384, nightingale: 384 });
  await page.waitForTimeout(250);
  expect(await hostHeights()).toEqual({ reference: 384, nightingale: 384 });
  await expect(page.getByTestId("renderer-portability-capabilities")).toContainText(
    "color-preserving heatmap",
  );
  await expect(page.getByTestId("renderer-portability-capabilities")).not.toContainText(
    "wrapper.nightingale.fallback.bars-heatmap",
  );
  await page.getByTestId("inspect-tab-messages").click();
  await page.getByTestId("inspect-message-lifecycle.visualization").last().click();
  await expect(page.getByTestId("inspect-message-json")).toContainText(
    "wrapper.nightingale.fallback.bars-heatmap",
  );
  expect(external).toEqual([]);
});

test("deep-links and repeatedly replaces the active renderer without changing the document", async ({
  page,
}) => {
  await page.goto("/#/renderer-portability?renderer=reference");
  await expect(page.getByTestId("renderer-chooser-status")).toContainText("ready");
  const digest = await page.getByTestId("renderer-document-digest").textContent();
  await expect(page.getByTestId("base-sequence-host")).toBeVisible();
  const status = page.getByTestId("renderer-chooser-status");
  const choice = page.getByLabel("Sequence renderer");
  const visiblePanels = page.locator('[data-testid^="visualizer-panel-"]:visible');
  const expectedPanels = new Map([
    ["reference", 1],
    ["nightingale", 1],
    ["compare", 2],
  ]);
  for (const mode of ["nightingale", "compare", "reference", "nightingale", "reference"]) {
    await choice.selectOption(mode);
    await expect(page).toHaveURL(new RegExp(`renderer=${mode}`, "u"));
    await expect(status).toContainText("ready");
    await expect(visiblePanels).toHaveCount(expectedPanels.get(mode) ?? 0);
    await expect(page.getByTestId("renderer-document-digest")).toHaveText(digest ?? "");
    await expect(page.locator("html")).toHaveAttribute(
      "data-seqstar-harness-telemetry-subscriptions",
      "1",
    );
  }
  await expect(page.getByTestId("renderer-portability-lifecycle")).toContainText(
    "P04637-reference-initial",
  );
  const settledMessages = await page.evaluate(
    () => document.documentElement.dataset.seqstarHarnessMessageCount,
  );
  await page.waitForTimeout(250);
  expect(
    await page.evaluate(() => document.documentElement.dataset.seqstarHarnessMessageCount),
  ).toBe(settledMessages);
  await page.reload();
  await expect(status).toContainText("ready");
  await expect(page.getByTestId("renderer-document-digest")).toHaveText(digest ?? "");
  await expect(page.getByTestId("base-sequence-host")).toBeVisible();
});

test("reports an exact incoming renderer failure without a false ready mode", async ({ page }) => {
  await page.goto("/#/renderer-portability?renderer=reference");
  const status = page.getByTestId("renderer-chooser-status");
  await expect(status).toContainText("ready");
  await page.evaluate(() => {
    for (const tag of [
      "nightingale-sequence",
      "nightingale-track",
      "nightingale-linegraph-track",
    ]) {
      const element = customElements.get(tag) as
        | (CustomElementConstructor & {
            prototype: { waitForSeqstarFirstRender?: () => Promise<void> };
          })
        | undefined;
      if (element !== undefined)
        element.prototype.waitForSeqstarFirstRender = () =>
          Promise.reject(new Error("forced readiness failure"));
    }
  });
  await page.getByLabel("Sequence renderer").selectOption("nightingale");
  await expect(status).toHaveRole("alert");
  await expect(status).toContainText("Renderer switch failed: Renderer request failed.");
  await expect(status).not.toContainText("renderer ready");
  await expect(page.getByTestId("renderer-portability-lifecycle")).toContainText(
    "P04637-nightingale-initial — failed",
  );
  await expect(
    page.getByTestId("nightingale-sequence-host").locator('[data-seqstar-nightingale="root"]'),
  ).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute(
    "data-seqstar-harness-telemetry-subscriptions",
    "1",
  );
});

test("exposes deterministic generic Nightingale readiness, identity, interaction, and owner state", async ({
  page,
}) => {
  await page.goto("/#/renderer-portability");
  await expect(page.getByTestId("nightingale-sequence-lifecycle")).toHaveText("degraded");

  const result = await page.evaluate(async () => {
    type Region = { readonly start: number; readonly end: number };
    type GenericElement = HTMLElement & {
      data: unknown;
      length: number;
      width: number;
      height: number;
      seqstarTrackId: string;
      seqstarLayerId: string;
      seqstarGeneration: number;
      waitForSeqstarFirstRender(generation: number): Promise<void>;
      emitSeqstarInteraction(value: {
        kind: "hover" | "select" | "activate";
        phase: "set" | "clear";
        featureId?: string;
        regions: readonly Region[];
      }): void;
      setSeqstarInteraction(
        family: "highlight" | "selection",
        owner: string,
        regions: readonly Region[],
      ): void;
      clearSeqstarInteraction(family: "highlight" | "selection", owner: string): void;
    };
    const host = document.createElement("div");
    document.body.append(host);
    const create = (layer: string): { element: GenericElement; ready: Promise<void> } => {
      const element = document.createElement("nightingale-track") as GenericElement;
      element.length = 20;
      element.width = 300;
      element.height = 24;
      element.seqstarTrackId = "track";
      element.seqstarLayerId = layer;
      element.seqstarGeneration = 7;
      const ready = element.waitForSeqstarFirstRender(7);
      element.data = [
        {
          accession: "repeated-item",
          externalId: `document:view:track:${layer}:annotation:features:item:repeated-item`,
          start: 2,
          end: 4,
          color: "#2563eb",
        },
      ];
      host.append(element);
      return { element, ready };
    };
    const first = create("layer-a");
    const second = create("layer-b");
    await Promise.all([first.ready, second.ready]);
    const featureNodes = [...host.querySelectorAll<HTMLElement>("[data-seqstar-feature-id]")];
    const domIds = featureNodes.map((node) => node.id);
    const externalIds = featureNodes.map((node) => node.dataset.seqstarFeatureId);

    let events = 0;
    let eventDetail: unknown;
    const normalized = (event: Event): void => {
      events++;
      eventDetail = (event as CustomEvent).detail;
    };
    first.element.addEventListener("nightingale-interaction", normalized);
    first.element.emitSeqstarInteraction({
      kind: "select",
      phase: "set",
      featureId: externalIds[0],
      regions: [{ start: 2, end: 4 }],
    });

    first.element.setSeqstarInteraction("highlight", "owner-a", [{ start: 2, end: 3 }]);
    first.element.setSeqstarInteraction("highlight", "owner-b", [{ start: 5, end: 6 }]);
    first.element.setSeqstarInteraction("selection", "owner-a", [{ start: 8, end: 9 }]);
    const beforeClear = {
      highlights: first.element.querySelectorAll('g[data-seqstar-applied="highlight"] rect').length,
      selections: first.element.querySelectorAll('g[data-seqstar-applied="selection"] rect').length,
      selectionFill: first.element
        .querySelector('g[data-seqstar-applied="selection"] rect')
        ?.getAttribute("fill"),
    };
    first.element.clearSeqstarInteraction("highlight", "owner-a");
    const afterClear = {
      highlights: first.element.querySelectorAll('g[data-seqstar-applied="highlight"] rect').length,
      selections: first.element.querySelectorAll('g[data-seqstar-applied="selection"] rect').length,
    };
    first.element.removeEventListener("nightingale-interaction", normalized);
    host.remove();
    return { domIds, externalIds, events, eventDetail, beforeClear, afterClear };
  });

  expect(new Set(result.domIds).size).toBe(2);
  expect(new Set(result.externalIds).size).toBe(2);
  expect(result.events).toBe(1);
  expect(result.eventDetail).toMatchObject({
    kind: "select",
    phase: "set",
    generation: 7,
    trackId: "track",
    layerId: "layer-a",
  });
  expect(result.beforeClear).toEqual({ highlights: 2, selections: 1, selectionFill: "none" });
  expect(result.afterClear).toEqual({ highlights: 1, selections: 1 });
});
