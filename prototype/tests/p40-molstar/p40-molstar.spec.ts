import { expect, test } from "@playwright/test";

test("loads local MVS, applies exact structure commands, replaces, resizes, and disposes offline", async ({
  page,
}) => {
  const remoteRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" && url.protocol !== "data:")
      remoteRequests.push(request.url());
  });
  await page.goto("/");
  const status = page.getByTestId("p40-status");
  await expect(status).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
  await page.evaluate(() => window.__p40?.apply());
  await page.evaluate(() => window.__p40?.unrelated());
  await page.evaluate(async () => window.__p40?.replace());
  await page.evaluate(() => window.__p40?.resize());
  const payload = JSON.parse((await status.textContent()) ?? "{}") as {
    messages: Array<{
      type: string;
      payload: { requestId?: string; status?: string; diagnostics?: Array<{ code?: string }> };
    }>;
  };
  expect(payload.messages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "lifecycle.visualization",
        payload: expect.objectContaining({ requestId: "first-1", status: "rendered" }),
      }),
      expect.objectContaining({
        type: "lifecycle.visualization",
        payload: expect.objectContaining({ requestId: "replacement", status: "rendered" }),
      }),
      expect.objectContaining({
        type: "harness.diagnostic",
        payload: expect.objectContaining({
          diagnostics: expect.arrayContaining([
            expect.objectContaining({ code: "wrapper.molstar.command.unmapped" }),
          ]),
        }),
      }),
    ]),
  );
  expect(remoteRequests).toEqual([]);
  await page.evaluate(async () => window.__p40?.dispose());
  await expect(status).toHaveText(/"disposed": true/);
  await page.evaluate(async () => window.__p40?.remount());
  await expect(status).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
  await expect(page.locator("#viewer canvas")).toHaveCount(1);
  const remounted = JSON.parse((await status.textContent()) ?? "{}") as {
    mountSession: number;
    remountEvidence: { oldCanvasRemoved: boolean; newCanvasCreated: boolean };
    messages: Array<{ type: string; payload: { requestId?: string; status?: string } }>;
  };
  expect(remounted.mountSession).toBe(2);
  expect(remounted.remountEvidence).toEqual({ oldCanvasRemoved: true, newCanvasCreated: true });
  expect(remounted.messages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "lifecycle.visualization",
        payload: expect.objectContaining({ requestId: "first-2", status: "rendered" }),
      }),
    ]),
  );
  expect(
    remounted.messages.some(
      (message) =>
        message.type === "lifecycle.visualization" && message.payload.requestId === "first-1",
    ),
  ).toBe(false);
});
