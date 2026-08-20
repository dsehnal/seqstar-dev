import { expect, test } from "@playwright/test";

test("pinned Mol* MVS loads, transforms, colors, focuses, renders, and disposes a local asset", async ({
  page,
}) => {
  const nonLocalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" && url.protocol !== "data:")
      nonLocalRequests.push(request.url());
  });

  await page.goto("/");
  const status = page.getByTestId("m01-transform-status");
  await expect(status).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
  const evidence = JSON.parse((await status.textContent()) ?? "{}") as {
    readonly apiOnly?: boolean;
    readonly biologicalEnsembleClaim?: boolean;
    readonly validationIssues?: readonly string[];
    readonly firstFrame?: { readonly reprCount?: number };
    readonly structureRoots?: number;
    readonly colors?: readonly string[];
    readonly focus?: string;
  };
  expect(evidence).toMatchObject({
    apiOnly: true,
    biologicalEnsembleClaim: false,
    validationIssues: [],
    structureRoots: 2,
    colors: ["#2563EB", "#F97316"],
    focus: "1A3N-chain-A",
  });
  expect(evidence.firstFrame?.reprCount).toBeGreaterThanOrEqual(2);
  expect(nonLocalRequests).toEqual([]);

  await page.evaluate(() => {
    (
      window as typeof window & { __disposeM01TransformSpike?: () => void }
    ).__disposeM01TransformSpike?.();
  });
  await expect(status).toHaveAttribute("data-dispose-completed", "true");
  await expect(status).toHaveAttribute("data-draw-stream-stopped", "true");
});
