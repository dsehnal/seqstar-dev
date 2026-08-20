import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1"]);
const routes = [
  "/",
  "/renderer-portability",
  "/uniprot-structure",
  "/complex",
  "/alignment-structure",
  "/cds-protein",
  "/p01-feasibility",
  "/reference-viewer",
  "/harness-diagnostics",
] as const;

test("keeps every route offline and leaves no stale mounted root across repeated navigation", async ({
  page,
}) => {
  const blocked: string[] = [];
  const errors: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["data:", "blob:"].includes(url.protocol) || loopbackHosts.has(url.hostname)) {
      await route.continue();
      return;
    }
    blocked.push(url.href);
    await route.abort("blockedbyclient");
  });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  for (const route of routes) {
    await page.goto(`/#${route}`);
    await expect(page).toHaveURL(new RegExp(`#${route === "/" ? "/$" : `${route}$`}`, "u"));
    await expect(page.getByRole("navigation", { name: "Case studies" })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => ({
          rootChildren: document.querySelectorAll("#root > *").length,
          canvases: document.querySelectorAll("canvas").length,
          nightingaleRoots: document.querySelectorAll('[data-seqstar-nightingale="root"]').length,
        })),
      )
      .toMatchObject({ rootChildren: 1 });
  }

  // The diagnostic host is instrumented by the shared React adapter. A fresh
  // StrictMode host contributes exactly two starts and leaves no old component
  // root behind when revisited.
  const diagnosticStarts = await page.evaluate(() =>
    Number(document.documentElement.dataset.harnessStartCount),
  );
  await page.goto("/#/");
  await page.goto("/#/harness-diagnostics");
  await expect(page.getByTestId("page-harness-status")).toContainText("ready");
  await expect
    .poll(() => page.evaluate(() => Number(document.documentElement.dataset.harnessStartCount)))
    .toBe(diagnosticStarts + 2);
  await expect
    .poll(() =>
      page.evaluate(() => ({
        subscriptions: Number(
          document.documentElement.dataset.seqstarHarnessTelemetrySubscriptions,
        ),
        messages: Number(document.documentElement.dataset.seqstarHarnessMessageCount),
      })),
    )
    .toEqual({ subscriptions: 1, messages: 4 });
  await page.getByRole("button", { name: "Record diagnostics probe" }).click();
  await page.getByRole("button", { name: "Show details" }).click();
  await expect(
    page.getByTestId("diagnostics-drawer").getByTestId("lifecycle-summary").getByRole("listitem"),
  ).toHaveCount(2);

  await page.goto("/#/uniprot-structure");
  await expect(page.getByTestId("p41-harness-status")).toContainText("ready");
  const tracks = page.getByTestId("uniprot-tracks-host");
  await tracks.locator('[data-seqstar-track-activate="regions"]').click();
  const staleRequest = await page.getByTestId("p41-request-id").textContent();
  await tracks.locator('[data-seqstar-track-activate="variants"]').click();
  await expect(page.getByTestId("p41-request-id")).toContainText("P41-variants-");
  await expect(page.getByTestId("p41-mvs-json")).toContainText("Natural variants on 1TUP");
  await expect(page.getByTestId("p41-generated-lifecycle")).toHaveText(/rendered|degraded/u, {
    timeout: 20_000,
  });
  expect(await page.getByTestId("p41-request-id").textContent()).not.toBe(staleRequest);

  await page.goto("/#/renderer-portability");
  await expect(page.getByTestId("nightingale-sequence-lifecycle")).toHaveText("degraded");
  const beforeRemount = await page.evaluate(() => ({
    roots: document.querySelectorAll('[data-seqstar-nightingale="root"]').length,
    canvases: document.querySelectorAll('[data-seq-viewer="canvas"]').length,
  }));
  await page.goto("/#/reference-viewer");
  await page.goto("/#/renderer-portability");
  await expect(page.getByTestId("nightingale-sequence-lifecycle")).toHaveText("degraded");
  await expect
    .poll(() =>
      page.evaluate(() => ({
        roots: document.querySelectorAll('[data-seqstar-nightingale="root"]').length,
        canvases: document.querySelectorAll('[data-seq-viewer="canvas"]').length,
      })),
    )
    .toEqual(beforeRemount);

  expect(blocked).toEqual([]);
  expect(errors).toEqual([]);
});

test("uses production Case 1/2 native seams without echo and downloads the validated generated MVS", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/#/renderer-portability");
  await expect(page.getByTestId("nightingale-sequence-lifecycle")).toHaveText("degraded");
  const interaction = await page.evaluate(async () => {
    type Track = HTMLElement & {
      emitSeqstarInteraction(value: {
        kind: "hover";
        phase: "set" | "clear";
        featureId?: string;
        regions: readonly { readonly start: number; readonly end: number }[];
      }): void;
      setSeqstarInteraction(
        family: "highlight" | "selection",
        owner: string,
        regions: readonly { readonly start: number; readonly end: number }[],
      ): void;
      clearSeqstarInteraction(family: "highlight" | "selection", owner: string): void;
    };
    const track = document.querySelector<Track>("nightingale-track");
    if (!track) throw new Error("Production Nightingale track was not mounted");
    const reference = document.querySelector<HTMLElement>("[data-testid='base-sequence-host']");
    if (!reference) throw new Error("Production reference viewer was not mounted");
    const featureId = track.querySelector<HTMLElement>("[data-seqstar-feature-id]")?.dataset
      .seqstarFeatureId;
    if (!featureId) throw new Error("Production Nightingale feature identity was not mounted");
    let nativeEvents = 0;
    track.addEventListener("nightingale-interaction", () => nativeEvents++);
    track.emitSeqstarInteraction({
      kind: "hover",
      phase: "set",
      featureId,
      regions: [{ start: 14, end: 15 }],
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const reflectedToReference = Number(reference.dataset.seqstarAppliedHighlights ?? "0");
    track.setSeqstarInteraction("highlight", "p80-owner-a", [{ start: 2, end: 3 }]);
    track.setSeqstarInteraction("highlight", "p80-owner-b", [{ start: 5, end: 6 }]);
    track.clearSeqstarInteraction("highlight", "p80-owner-a");
    const remaining = track.querySelectorAll('g[data-seqstar-applied="highlight"] rect').length;
    track.emitSeqstarInteraction({ kind: "hover", phase: "clear", regions: [] });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return {
      nativeEvents,
      lastMessage: document.documentElement.dataset.seqstarHarnessLastMessage,
      messageCount: document.documentElement.dataset.seqstarHarnessMessageCount,
      reflectedToReference,
      clearedOnReference: Number(reference.dataset.seqstarAppliedHighlights ?? "0"),
      remaining,
      remainingAfterNativeClear: track.querySelectorAll('g[data-seqstar-applied="highlight"] rect')
        .length,
    };
  });
  expect(interaction).toMatchObject({
    nativeEvents: 2,
    reflectedToReference: 1,
    clearedOnReference: 0,
    remaining: 1,
    remainingAfterNativeClear: 1,
  });

  const reflectedToNightingale = await page.evaluate(async () => {
    const canvas = document.querySelector<HTMLElement>("[data-seq-viewer='canvas']");
    const nightingale = document.querySelector<HTMLElement>("[data-seqstar-nightingale='root']");
    if (!canvas || !nightingale) throw new Error("Case 1 visualizer surface was not mounted");
    const box = canvas.getBoundingClientRect();
    canvas.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: box.left + 160,
        clientY: box.top + 34,
      }),
    );
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return Number(nightingale.dataset.seqstarAppliedHighlights ?? "0");
  });
  expect(reflectedToNightingale).toBeGreaterThan(0);

  await page.goto("/#/uniprot-structure");
  await expect(page.getByTestId("p41-harness-status")).toContainText("ready");
  await page
    .getByTestId("uniprot-tracks-host")
    .locator('[data-seqstar-track-activate="regions"]')
    .click();
  await expect(page.getByTestId("p41-generated-lifecycle")).toHaveText(/rendered|degraded/u, {
    timeout: 20_000,
  });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download validated MVSJ" }).click(),
  ]);
  const path = await download.path();
  expect(path).not.toBeNull();
  const document = JSON.parse(await readFile(path as string, "utf8")) as {
    readonly root?: { readonly kind?: string; readonly children?: readonly unknown[] };
    readonly metadata?: { readonly version?: string };
  };
  expect(document.root?.kind).toBe("root");
  expect(document.root?.children?.length).toBeGreaterThan(1);
  expect(document.metadata?.version).toBe("1");
  expect(errors).toEqual([]);
});
