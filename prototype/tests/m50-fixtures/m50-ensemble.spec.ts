import { expect, test } from "@playwright/test";

test("four local experimental/predicted roots load, render a fresh frame, and dispose twice", async ({
  page,
}) => {
  const nonLoopbackRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" && url.protocol !== "data:")
      nonLoopbackRequests.push(request.url());
  });

  await page.goto("/");
  const status = page.getByTestId("m50-ensemble-status");
  await expect(status).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
  const evidence = JSON.parse((await status.textContent()) ?? "{}") as {
    readonly biologicalEnsembleClaim?: boolean;
    readonly validationIssues?: readonly string[];
    readonly structureRoots?: number;
    readonly urls?: readonly string[];
    readonly colors?: readonly string[];
    readonly focus?: string;
    readonly firstFrame?: { readonly reprCount?: number };
  };
  expect(evidence).toMatchObject({
    biologicalEnsembleClaim: false,
    validationIssues: [],
    structureRoots: 4,
    urls: [
      "/input/1A3N.cif",
      "/input/AF-P02197-F1-model_v6.cif",
      "/input/AF-A0A5E4C8D4-F1-model_v6.cif",
      "/input/AF-A0A2Y9DEZ0-F1-model_v6.cif",
    ],
    colors: ["#2563EB", "#F97316", "#10B981", "#A855F7"],
    focus: "experimental 1A3N chain A",
  });
  expect(evidence.firstFrame?.reprCount).toBeGreaterThanOrEqual(4);
  expect(nonLoopbackRequests).toEqual([]);

  await page.evaluate(() => {
    (
      window as typeof window & { __disposeM50EnsembleFixture?: () => void }
    ).__disposeM50EnsembleFixture?.();
  });
  await expect(status).toHaveAttribute("data-dispose-call-count", "2");
  await expect(status).toHaveAttribute("data-dispose-completed", "true");
  await expect(status).toHaveAttribute("data-draw-stream-stopped", "true");
});
