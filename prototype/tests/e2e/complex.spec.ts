import { expect, type Page, test } from "@playwright/test";

const profile = async (page: Page) =>
  page.getByTestId("inspect-mvs-json").evaluate((element) => {
    const document = JSON.parse(element.textContent ?? "{}") as { readonly root?: unknown };
    const representations: Record<string, number> = {};
    let components = 0;
    let focusComponents = 0;
    const visit = (node: unknown): void => {
      if (node === null || typeof node !== "object") return;
      const value = node as {
        readonly kind?: unknown;
        readonly params?: { readonly type?: unknown };
        readonly children?: readonly unknown[];
      };
      if (value.kind === "representation" && typeof value.params?.type === "string")
        representations[value.params.type] = (representations[value.params.type] ?? 0) + 1;
      if (value.kind === "component") {
        components++;
        if (
          value.children?.some(
            (child) =>
              child !== null &&
              typeof child === "object" &&
              "kind" in child &&
              child.kind === "focus",
          )
        )
          focusComponents++;
      }
      value.children?.forEach(visit);
    };
    visit(document.root ?? document);
    return { components, representations, focusComponents };
  });

const inspectLatestMessage = async (page: Page, type: string): Promise<string> => {
  await page.getByTestId("inspect-tab-messages").click();
  await page.getByTestId(`inspect-message-${type}`).last().click();
  return (await page.getByTestId("inspect-message-json").textContent()) ?? "";
};

/**
 * Reading retained inspector state must not itself move the active pointer off
 * a sequence contact: hover synchronization is animation-frame latest and a
 * pointer leave correctly replaces the pending apply with a clear.
 */
const inspectLatestMessageWithoutPointerMove = async (
  page: Page,
  type: string,
): Promise<string> => {
  await page
    .getByTestId("inspect-tab-messages")
    .evaluate((element: HTMLButtonElement) => element.click());
  await page
    .getByTestId(`inspect-message-${type}`)
    .last()
    .evaluate((element: HTMLButtonElement) => element.click());
  return (await page.getByTestId("inspect-message-json").textContent()) ?? "";
};

const inspectMessageContaining = async (
  page: Page,
  type: string,
  text: string,
): Promise<string> => {
  await page.getByTestId("inspect-tab-messages").click();
  const messages = page.getByTestId(`inspect-message-${type}`);
  for (let index = await messages.count(); index > 0; index--) {
    await messages.nth(index - 1).evaluate((element: HTMLButtonElement) => element.click());
    const json = (await page.getByTestId("inspect-message-json").textContent()) ?? "";
    if (json.includes(text)) return json;
  }
  throw new Error(`No ${type} inspector record contained '${text}'.`);
};

test("composes the offline 1BRS sequence, neutral MVS, profiles, navigation, and inspector", async ({
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
  await expect(page.getByRole("heading", { name: "Complex", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Track profiles and navigation" })).toHaveCount(0);
  await expect(sequence.locator("[data-seq-viewer-track]")).toHaveCount(5);
  await expect(page.getByTestId("complex-structure-host").locator("canvas").first()).toBeVisible();
  await expect(page.getByTestId("inspect-seq-request-id")).toContainText("P50-sequence-initial");
  await expect(page.getByTestId("inspect-mvs-request-id")).toContainText("P50-neutral-initial");
  await expect(page.getByTestId("inspect-mvs-lifecycle")).toHaveText(/rendered|degraded/u, {
    timeout: 20_000,
  });

  for (const expected of [
    ["sequences", "neutral", { representations: { cartoon: 2 } }],
    ["polymer-regions", "regions", { representations: { cartoon: 2 } }],
    ["synthetic-confidence", "confidence", { representations: { cartoon: 2 } }],
    ["interface", "interface", { representations: { ball_and_stick: 2, cartoon: 2 } }],
    ["contacts", "contacts", { representations: { cartoon: 2 } }],
  ] as const) {
    await sequence.locator(`[data-seq-viewer-track="${expected[0]}"]`).click();
    await expect(page.getByTestId("inspect-profile-summary")).toContainText(
      `Profile ${expected[1]}`,
    );
    await expect(page.getByTestId("inspect-mvs-lifecycle")).toHaveText(/rendered|degraded/u, {
      timeout: 20_000,
    });
    await page.getByTestId("inspect-tab-mvs").click();
    await expect.poll(() => profile(page)).toMatchObject(expected[2]);
    expect((await profile(page)).components).toBeGreaterThanOrEqual(2);
    await page.getByTestId("inspect-tab-summary").click();
  }
  await expect(page.getByTestId("inspect-endpoint-summary")).toContainText("barnase: 19");
  await expect(page.getByTestId("inspect-endpoint-summary")).toContainText("barstar: 16");

  const navigation = sequence.locator('[data-seq-viewer-navigation="root"]');
  await expect(navigation).toBeVisible();
  await navigation.getByRole("button", { name: "Zoom in" }).click();
  await navigation.getByRole("slider", { name: "Viewport window; drag to pan" }).press("End");
  await expect(
    navigation.getByRole("slider", { name: "Viewport window; drag to pan" }),
  ).toHaveAttribute("aria-valuetext", /Columns \d+ to 247 of 247/u);
  expect(external).toEqual([]);
});

test("uses actual sequence contact input, retains both endpoint roles, and remounts cleanly", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#/complex");
  await expect(page.getByTestId("p50-harness-status")).toContainText("ready");
  const sequence = page.getByTestId("complex-sequence-host");
  const canvas = sequence.locator('[data-seq-viewer="canvas"]');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (box === null) throw new Error("Expected the mounted complex sequence canvas.");
  const cell = (box.width - 156 - 32) / 247;
  await page.mouse.move(box.x + 156 + 73.5 * cell, box.y + 20 + 4 * 25 + 12.5);
  const nativeContact = await inspectLatestMessageWithoutPointerMove(page, "interaction.native");
  expect(nativeContact).toContain("1brs-A-D-001");
  expect(nativeContact).toContain("endpointRole");
  expect(nativeContact).toContain("barnase");
  expect(nativeContact).toContain("barstar");
  const reflectedHover = await inspectLatestMessageWithoutPointerMove(
    page,
    "interaction.highlight.apply",
  );
  expect(reflectedHover).toContain('"component": "complex-structure"');
  expect(reflectedHover).toContain('"label-asym": "A"');
  expect(reflectedHover).toContain('"label-asym": "D"');
  await page.mouse.move(1, 1);
  const reflectedHoverClear = await inspectLatestMessage(page, "interaction.highlight.clear");
  expect(reflectedHoverClear).toContain('"component": "complex-structure"');
  await page.getByTestId("inspect-tab-summary").click();
  await canvas.scrollIntoViewIfNeeded();
  const selectedBox = await canvas.boundingBox();
  if (selectedBox === null) throw new Error("Expected the mounted complex sequence canvas.");
  await page.mouse.click(selectedBox.x + 156 + 73.5 * cell, selectedBox.y + 20 + 4 * 25 + 12.5);
  const structureApply = await inspectLatestMessage(page, "interaction.selection.apply");
  expect(structureApply).toContain('"component": "complex-structure"');
  expect(structureApply).toContain('"label-asym": "A"');
  expect(structureApply).toContain('"label-asym": "D"');
  await page.getByTestId("inspect-tab-summary").click();
  await expect(page.getByTestId("inspect-profile-summary")).toContainText(
    "Profile contact · relationship 1brs-A-D-001",
  );
  await expect(page.getByTestId("inspect-endpoint-summary")).toContainText("barnase: 1");
  await expect(page.getByTestId("inspect-endpoint-summary")).toContainText("barstar: 1");
  await expect(page.getByTestId("inspect-mvs-lifecycle")).toHaveText(/rendered|degraded/u, {
    timeout: 20_000,
  });
  await page.getByTestId("inspect-tab-mvs").click();
  await expect
    .poll(() => profile(page))
    .toEqual({
      components: 5,
      representations: { ball_and_stick: 2, cartoon: 2 },
      focusComponents: 1,
    });
  await page.getByTestId("inspect-tab-summary").click();

  const previousHost = await page.getByTestId("complex-structure-host").elementHandle();
  if (previousHost === null) throw new Error("Expected the mounted Mol* host.");
  await page.locator(".app-nav__more > summary").click();
  await page.getByRole("link", { name: "Renderer comparison" }).click();
  await expect(page.getByTestId("case-renderer-portability")).toBeVisible();
  await expect
    .poll(() =>
      previousHost.evaluate((element) => ({
        connected: element.isConnected,
        canvases: element.querySelectorAll("canvas").length,
      })),
    )
    .toEqual({ connected: false, canvases: 0 });
  await page.getByRole("link", { name: "Complex" }).click();
  await expect(page.getByTestId("p50-harness-status")).toContainText("ready");
  await expect(
    page.getByTestId("complex-sequence-host").locator('[data-seq-viewer="canvas"]'),
  ).toHaveCount(1);
  await expect(page.getByTestId("complex-structure-host").locator("canvas").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("renders the Nightingale contact endpoint fallback with both semantic roles offline", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "data:" && !["127.0.0.1", "localhost"].includes(url.hostname))
      external.push(request.url());
  });
  await page.goto("/#/complex?renderer=nightingale");
  await expect(page.getByTestId("p50-harness-status")).toContainText("ready");
  const sequence = page.getByTestId("complex-sequence-host");
  const contacts = sequence.locator(
    '[data-seqstar-track="contacts"][data-seqstar-layer="contact-links"]',
  );
  await expect(contacts).toBeVisible();
  const markerIds = await contacts
    .locator("[data-seqstar-feature-id]")
    .evaluateAll((markers) =>
      markers.map((marker) => marker.getAttribute("data-seqstar-feature-id") ?? ""),
    );
  expect(markerIds).toHaveLength(86);
  const barnaseMarker = markerIds.find((id) => id.includes("endpoint-role:7:barnase"));
  const barstarMarker = markerIds.find((id) => id.includes("endpoint-role:7:barstar"));
  expect(barnaseMarker).toBeDefined();
  expect(barstarMarker).toBeDefined();

  const fallbackLifecycle = await inspectMessageContaining(
    page,
    "lifecycle.visualization",
    "wrapper.nightingale.fallback.links-endpoints",
  );
  expect(fallbackLifecycle).toContain('"status": "degraded"');
  expect(fallbackLifecycle).toContain('"componentId": "complex-sequence"');

  await contacts.evaluate(
    (element, featureId) =>
      (
        element as unknown as {
          emitSeqstarInteraction(value: unknown): void;
        }
      ).emitSeqstarInteraction({
        kind: "hover",
        phase: "set",
        featureId,
        regions: [{ start: 1, end: 1 }],
      }),
    barnaseMarker,
  );
  const barnaseNative = await inspectLatestMessageWithoutPointerMove(page, "interaction.native");
  expect(barnaseNative).toContain('"endpointRole": "barnase"');
  expect(barnaseNative).toContain('"id": "uniprot-P00648-sequence"');
  expect(barnaseNative).toContain('"id": "uniprot-P11540-sequence"');

  await contacts.evaluate(
    (element, featureId) =>
      (
        element as unknown as {
          emitSeqstarInteraction(value: unknown): void;
        }
      ).emitSeqstarInteraction({
        kind: "select",
        phase: "set",
        featureId,
        regions: [{ start: 1, end: 1 }],
      }),
    barstarMarker,
  );
  const barstarNative = await inspectLatestMessageWithoutPointerMove(page, "interaction.native");
  expect(barstarNative).toContain('"endpointRole": "barstar"');
  expect(barstarNative).toContain('"id": "uniprot-P00648-sequence"');
  expect(barstarNative).toContain('"id": "uniprot-P11540-sequence"');
  const selected = await inspectLatestMessageWithoutPointerMove(
    page,
    "interaction.selection.apply",
  );
  expect(selected).toContain('"label-asym": "A"');
  expect(selected).toContain('"label-asym": "D"');
  await expect(page.getByTestId("inspect-profile-summary")).toContainText("Profile contact");
  expect(external).toEqual([]);
});
