import { expect, test } from "@playwright/test";

test("proves offline Nightingale renderer output and Mol* MVS/locus feasibility", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "data:" && !["127.0.0.1", "localhost"].includes(url.hostname))
      external.push(request.url());
  });
  await page.goto("/p01-feasibility");
  const nightingale = page.getByTestId("p01a-status");
  const molstar = page.getByTestId("p01b-status");
  await expect(nightingale).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
  await expect(molstar).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
  await page.getByRole("button", { name: "Prove Nightingale highlight" }).click();
  await expect
    .poll(
      async () => {
        const proof = JSON.parse((await nightingale.textContent()) ?? "{}") as {
          blockElementId?: string;
          highlightAfterApply?: number;
          highlightAfterClear?: number;
        };
        return (
          proof.blockElementId === "g_p01a-block-domain" &&
          proof.highlightAfterApply !== undefined &&
          proof.highlightAfterApply > 0 &&
          proof.highlightAfterClear === 0
        );
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  const nightingaleProof = JSON.parse((await nightingale.textContent()) ?? "{}") as {
    highlightAfterApply?: number;
    highlightAfterClear?: number;
    blockElementId?: string;
  };
  expect(nightingaleProof).toMatchObject({
    blockElementId: "g_p01a-block-domain",
    highlightAfterClear: 0,
  });
  expect(nightingaleProof.highlightAfterApply).toBeGreaterThan(0);
  const locus = JSON.parse((await molstar.textContent()) ?? "{}") as {
    residue?: { authAsymId?: string; authSeqId?: number };
  };
  expect(locus.residue).toEqual({ authAsymId: "A", authSeqId: 1 });
  await page.getByRole("button", { name: "Prove external Mol* commands" }).click();
  const command = JSON.parse((await molstar.textContent()) ?? "{}") as {
    external?: {
      highlightAfterApply?: number;
      highlightAfterClear?: number;
      selectionAfterApply?: number;
      selectionAfterClear?: number;
    };
  };
  expect(command.external).toMatchObject({ highlightAfterClear: 0, selectionAfterClear: 0 });
  expect(command.external?.highlightAfterApply).toBeGreaterThan(0);
  expect(command.external?.selectionAfterApply).toBeGreaterThan(0);
  expect(external).toEqual([]);
  await page.getByRole("button", { name: "Dispose and remount feasibility probes" }).click();
  await expect(molstar).toHaveAttribute("data-session", "2");
  await expect(molstar).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
  await expect(nightingale).toHaveAttribute("data-session", "2");
  await expect(nightingale).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
});
