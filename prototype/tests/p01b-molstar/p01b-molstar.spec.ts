import { expect, test } from "@playwright/test";

test("loads local MVS and proves first-frame, locus, and disposal feasibility", async ({
  page,
}) => {
  const networkRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" && url.protocol !== "data:") {
      networkRequests.push(request.url());
    }
  });

  await page.goto("/");
  const status = page.getByTestId("p01b-status");
  await expect(status).toHaveAttribute("data-status", "ready", { timeout: 30_000 });

  const evidence = JSON.parse((await status.textContent()) ?? "{}") as {
    firstFrame?: { representationCount?: number };
    nativeHover?: unknown[];
    nativeSelection?: Array<{ kind?: string }>;
    residue?: { authAsymId?: string; authSeqId?: number };
    selectedElementCount?: number;
    selectionAfterClear?: number;
  };
  expect(evidence.firstFrame?.representationCount).toBeGreaterThan(0);
  expect(evidence.residue).toMatchObject({ authAsymId: "A", authSeqId: 1 });
  expect(evidence.nativeHover).toEqual([]);
  expect(evidence.nativeSelection).toEqual([]);
  expect(evidence.selectedElementCount).toBe(0);
  expect(evidence.selectionAfterClear).toBe(0);
  expect(networkRequests).toEqual([]);

  await page.evaluate(() => {
    (
      window as typeof window & {
        __disposeP01bMolstar?: () => void;
      }
    ).__disposeP01bMolstar?.();
  });
  await expect(status).toHaveAttribute("data-dispose-completed", "true");
  await expect(status).toHaveAttribute("data-draw-stream-stopped", "true");
});
