import { expect, test } from "@playwright/test";

const mvsProfile = (
  document: unknown,
): {
  readonly representations: Record<string, number>;
  readonly focusComponents: number;
  readonly focusSelectors: readonly unknown[];
} => {
  const representations: Record<string, number> = {};
  let focusComponents = 0;
  const focusSelectors: unknown[] = [];
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== "object") return;
    const value = node as {
      readonly kind?: unknown;
      readonly params?: unknown;
      readonly children?: unknown;
    };
    if (
      value.kind === "representation" &&
      value.params !== null &&
      typeof value.params === "object"
    ) {
      const type = (value.params as { readonly type?: unknown }).type;
      if (typeof type === "string") representations[type] = (representations[type] ?? 0) + 1;
    }
    if (
      value.kind === "component" &&
      Array.isArray(value.children) &&
      value.children.some(
        (child) =>
          child !== null && typeof child === "object" && "kind" in child && child.kind === "focus",
      )
    ) {
      focusComponents++;
      const selector =
        value.params !== null && typeof value.params === "object"
          ? (value.params as { readonly selector?: unknown }).selector
          : undefined;
      if (Array.isArray(selector)) focusSelectors.push(...selector);
    }
    if (Array.isArray(value.children)) value.children.forEach(visit);
  };
  visit(document);
  return {
    representations,
    focusComponents,
    focusSelectors,
  };
};

test("runs the offline 1BRS multi-polymer interface flow through native reference-viewer activation", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "data:" && !["127.0.0.1", "localhost"].includes(url.hostname))
      external.push(request.url());
  });
  await page.goto("/#/complex");
  await expect(page).toHaveURL(/#\/complex$/u);
  await expect(page.getByTestId("p50-harness-status")).toContainText("ready");
  await expect(page.getByTestId("p50-synthetic-label")).toContainText(
    "not a biological prediction",
  );
  const sequence = page.getByTestId("complex-sequence-host");
  await expect(sequence.locator("[data-seq-viewer-track]")).toHaveCount(5);
  await expect(sequence.locator('[data-seq-viewer-track="polymer-regions"]')).toBeVisible();
  await sequence.locator('[data-seq-viewer-track="interface"]').click();
  await expect(page.getByTestId("p50-request-id")).toContainText("P50-interface-");
  await expect(page.getByTestId("p50-role-summary")).toContainText("barnase: 19");
  await expect(page.getByTestId("p50-role-summary")).toContainText("barstar: 16");
  await expect(page.getByTestId("p50-mvs-json")).toContainText('"label_asym_id": "A"');
  await expect(page.getByTestId("p50-mvs-json")).toContainText('"label_asym_id": "D"');
  await expect
    .poll(async () => {
      const document = JSON.parse(
        (await page.getByTestId("p50-mvs-json").textContent()) ?? "{}",
      ) as {
        readonly root?: unknown;
      };
      return mvsProfile(document.root ?? document).representations;
    })
    .toEqual({ cartoon: 2 });
  await expect(page.getByTestId("p50-lifecycle")).toHaveText(/rendered|degraded/u, {
    timeout: 20_000,
  });
  expect(external).toEqual([]);
});

test("renders, replaces, disposes, and remounts bounded contact detail offline", async ({
  page,
}) => {
  const external: string[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "data:" && !["127.0.0.1", "localhost"].includes(url.hostname))
      external.push(request.url());
  });
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
  const canvas = sequence.locator('[data-seq-viewer="canvas"]');
  await expect(canvas).toBeVisible();
  await canvas.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const cell = (box.width - 156 - 32) / 247;
    element.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        clientX: box.left + 156 + (73 + 0.5) * cell,
        clientY: box.top + 20 + 4 * 25 + 12.5,
      }),
    );
  });
  await expect(page.getByTestId("p50-request-id")).toContainText("P50-1brs-A-D-001-");
  const contactRequestId = (await page.getByTestId("p50-request-id").textContent())?.trim();
  expect(contactRequestId).toMatch(/^P50-1brs-A-D-001-\d+$/u);
  await expect(page.getByTestId("p50-role-summary")).toContainText(
    "contact · 1brs-A-D-001 · barnase: 1 · barstar: 1",
  );
  await expect(page.getByTestId("p50-lifecycle")).toHaveAttribute(
    "data-request-id",
    contactRequestId ?? "",
  );
  await expect(page.getByTestId("p50-lifecycle")).toHaveText(/rendered|degraded/u, {
    timeout: 20_000,
  });
  await expect
    .poll(async () => {
      const document = JSON.parse(
        (await page.getByTestId("p50-mvs-json").textContent()) ?? "{}",
      ) as {
        readonly root?: unknown;
      };
      return mvsProfile(document.root ?? document);
    })
    .toEqual({
      representations: { ball_and_stick: 2, cartoon: 2 },
      focusComponents: 1,
      focusSelectors: [
        {
          label_entity_id: "1",
          label_asym_id: "A",
          auth_asym_id: "A",
          label_seq_id: 27,
          auth_seq_id: 27,
        },
        {
          label_entity_id: "2",
          label_asym_id: "D",
          auth_asym_id: "D",
          label_seq_id: 38,
          auth_seq_id: 38,
        },
      ],
    });

  await sequence.locator('[data-seq-viewer-track="interface"]').click();
  await expect(page.getByTestId("p50-request-id")).toContainText("P50-interface-");
  const interfaceRequestId = (await page.getByTestId("p50-request-id").textContent())?.trim();
  expect(interfaceRequestId).toMatch(/^P50-interface-\d+$/u);
  expect(interfaceRequestId).not.toBe(contactRequestId);
  await expect(page.getByTestId("p50-role-summary")).toContainText("43 contacts");
  await expect(page.getByTestId("p50-lifecycle")).toHaveAttribute(
    "data-request-id",
    interfaceRequestId ?? "",
  );
  await expect(page.getByTestId("p50-lifecycle")).toHaveText(/rendered|degraded/u, {
    timeout: 20_000,
  });
  await expect
    .poll(async () => {
      const document = JSON.parse(
        (await page.getByTestId("p50-mvs-json").textContent()) ?? "{}",
      ) as {
        readonly root?: unknown;
      };
      return mvsProfile(document.root ?? document);
    })
    .toEqual({ representations: { cartoon: 2 }, focusComponents: 0, focusSelectors: [] });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.seqstarHarnessLastMessage))
    .toBe("lifecycle.visualization:complex-structure:broadcast");

  const previousHost = await page.getByTestId("complex-structure-host").elementHandle();
  if (previousHost === null) throw new Error("Expected the mounted Mol* host.");
  await page.getByRole("link", { name: "Renderer portability" }).click();
  await expect(page).toHaveURL(/#\/renderer-portability$/u);
  await expect(page.getByTestId("case-renderer-portability")).toBeVisible();
  await expect
    .poll(() =>
      previousHost.evaluate((element) => ({
        connected: element.isConnected,
        children: element.childElementCount,
        canvases: element.querySelectorAll("canvas").length,
      })),
    )
    .toEqual({ connected: false, children: 0, canvases: 0 });
  await page.getByRole("link", { name: "Complex" }).click();
  await expect(page.getByTestId("p50-harness-status")).toContainText("ready");
  await expect
    .poll(() =>
      page.evaluate(() =>
        Number(document.documentElement.dataset.seqstarHarnessTelemetrySubscriptions),
      ),
    )
    .toBe(1);
  await expect(
    page.getByTestId("complex-sequence-host").locator('[data-seq-viewer="canvas"]'),
  ).toHaveCount(1);
  await expect(page.getByTestId("complex-structure-host").locator("canvas").first()).toBeVisible();
  expect(external).toEqual([]);
  expect(pageErrors).toEqual([]);
});
