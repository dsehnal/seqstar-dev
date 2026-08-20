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
  await expect.poll(hostHeights).toEqual({ reference: 288, nightingale: 288 });
  await page.waitForTimeout(250);
  expect(await hostHeights()).toEqual({ reference: 288, nightingale: 288 });
  await expect(page.getByTestId("renderer-portability-capabilities")).toContainText(
    "bars-to-heatmap fallback",
  );
  expect(external).toEqual([]);
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
