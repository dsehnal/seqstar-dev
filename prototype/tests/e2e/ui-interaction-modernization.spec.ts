import { expect, test } from "@playwright/test";

const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1"]);

const caseRenderers = [
  { route: "/renderer-portability", modes: ["reference", "nightingale", "compare"] },
  { route: "/uniprot-structure", modes: ["reference", "nightingale"] },
  { route: "/complex", modes: ["reference", "nightingale"] },
  { route: "/alignment-structure", modes: ["reference", "nightingale"] },
  { route: "/cds-protein", modes: ["reference", "nightingale"] },
] as const;

test("keeps every promised case-study renderer mode offline and singly subscribed", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "data:" && url.protocol !== "blob:" && !loopbackHosts.has(url.hostname))
      external.push(request.url());
  });

  for (const entry of caseRenderers) {
    await page.goto(`/#${entry.route}?renderer=reference`);
    const chooser = page.getByLabel("Sequence renderer");
    const status = page.getByTestId("renderer-chooser-status");
    await expect(status).toContainText("reference renderer ready", { timeout: 20_000 });
    await expect(
      chooser.locator("xpath=ancestor::*[contains(@class, 'visualization-card__header')]"),
    ).toHaveCount(1);
    await expect(page.getByTestId("renderer-chooser-trigger")).toHaveCSS("width", "32px");
    await expect(page.locator(".renderer-chooser__label--hidden")).toHaveCSS("width", "1px");
    await expect(page.locator(".renderer-chooser__label--hidden")).toHaveCSS("height", "1px");
    expect(
      await chooser
        .locator("option")
        .evaluateAll((options) => options.map((option) => option.value).sort()),
    ).toEqual([...entry.modes].sort());

    for (const mode of entry.modes) {
      await chooser.selectOption(mode);
      await expect(page).toHaveURL(new RegExp(`#${entry.route}\\?renderer=${mode}$`, "u"));
      await expect(status, `${entry.route} → ${mode}`).toContainText(
        mode === "compare" ? "Comparison renderer ready" : `${mode} renderer ready`,
        { timeout: 20_000 },
      );
      await expect(page.locator("html")).toHaveAttribute(
        "data-seqstar-harness-telemetry-subscriptions",
        "1",
      );
      await expect(
        page
          .locator('[data-seq-viewer="canvas"], [data-seqstar-nightingale="root"]:visible')
          .first(),
      ).toBeVisible();
    }
  }

  expect(external).toEqual([]);
});

test("keeps Nightingale chrome synchronized, fixed, compact, and readable after zoom", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/#/alignment-structure?renderer=nightingale");
  await expect(page.getByTestId("renderer-chooser-status")).toContainText(
    "nightingale renderer ready",
    { timeout: 20_000 },
  );
  const root = page
    .getByTestId("pf00042-alignment-host")
    .locator('[data-seqstar-nightingale="root"]');
  await expect(root).toBeVisible();

  const chrome = await root.evaluate(async (element) => {
    const navigation = element.querySelector<HTMLElement>(
      '[data-seqstar-nightingale-viewport="root"]',
    );
    const header = element.querySelector<HTMLElement>(".seqstar-nightingale-track-header");
    const action = element.querySelector<HTMLElement>(".seqstar-nightingale-track-action");
    const slider = navigation?.querySelector<HTMLInputElement>('input[type="range"]');
    if (navigation === null || header === null || action === null || slider === null)
      throw new Error("Nightingale modernization chrome is incomplete.");
    const before = header.getBoundingClientRect().left;
    const box = element.getBoundingClientRect();
    for (let index = 0; index < 7; index += 1) {
      element.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: box.left + box.width * 0.7,
          clientY: box.top + 20,
          deltaY: -500,
        }),
      );
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    slider.value = slider.max;
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const elements = [
      ...element.querySelectorAll<HTMLElement>("nightingale-sequence, nightingale-track"),
    ];
    return {
      navigationWidth: navigation.getBoundingClientRect().width,
      rootWidth: element.getBoundingClientRect().width,
      headerShift: header.getBoundingClientRect().left - before,
      headerPosition: getComputedStyle(header).position,
      actionRadius: getComputedStyle(action).borderRadius,
      letters: element.querySelectorAll("nightingale-sequence text.base").length,
      range: [element.dataset.seqstarViewportStart, element.dataset.seqstarViewportEnd],
      displayRanges: elements.map((entry) => [
        entry.getAttribute("display-start"),
        entry.getAttribute("display-end"),
      ]),
    };
  });

  expect(chrome.navigationWidth).toBeLessThanOrEqual(chrome.rootWidth + 0.5);
  expect(chrome.headerShift).toBeCloseTo(0, 1);
  expect(chrome.headerPosition).toBe("sticky");
  expect(chrome.actionRadius).toBe("0px");
  expect(chrome.letters).toBeGreaterThan(0);
  expect(chrome.range[0]).not.toBe("1");
  expect(new Set(chrome.displayRanges.map((range) => range.join(":"))).size).toBe(1);
});

test("keeps sequence viewers inset while Mol* stays flush and borderless", async ({ page }) => {
  await page.goto("/#/alignment-structure?renderer=reference");
  await expect(page.getByTestId("renderer-chooser-status")).toContainText(
    "reference renderer ready",
    { timeout: 20_000 },
  );
  const sequenceHost = page.getByTestId("pf00042-alignment-host");
  const structureHost = page.getByTestId("p69905-structure-host");
  const molstarContent = structureHost.locator(".msp-plugin-content");
  await expect(molstarContent).toBeVisible({ timeout: 20_000 });

  expect(await sequenceHost.evaluate((element) => getComputedStyle(element).paddingLeft)).toBe(
    "12px",
  );
  expect(await structureHost.evaluate((element) => getComputedStyle(element).paddingLeft)).toBe(
    "0px",
  );
  expect(
    await molstarContent.evaluate((element) => {
      const style = getComputedStyle(element);
      return [
        style.borderTopWidth,
        style.borderRightWidth,
        style.borderBottomWidth,
        style.borderLeftWidth,
      ];
    }),
  ).toEqual(["0px", "0px", "0px", "0px"]);
  expect(
    await structureHost.evaluate((element) => {
      const classes = [
        "msp-snapshot-description-wrapper",
        "msp-state-snapshot-viewport-controls",
        "msp-animation-viewport-controls",
        "msp-viewport-controls-buttons",
      ];
      return classes.map((className) => {
        const probe = document.createElement("div");
        probe.className = className;
        element.append(probe);
        const display = getComputedStyle(probe).display;
        probe.remove();
        return display;
      });
    }),
  ).toEqual(["none", "none", "none", "none"]);
});

test("retains the accessible glass shell under reduced motion, forced colors, narrow width, and zoom", async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/uniprot-structure?renderer=reference");
  await expect(page.getByTestId("renderer-chooser-status")).toContainText(
    "reference renderer ready",
    {
      timeout: 20_000,
    },
  );
  const complex = page.getByRole("link", { name: "Protein complex" });
  await complex.focus();
  await page.evaluate(() => window.scrollTo(0, 500));

  const shell = await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
    const header = document.querySelector<HTMLElement>(".app-shell-header");
    const focused = document.activeElement;
    const card = document.querySelector<HTMLElement>(".visualization-card");
    if (header === null || focused === null || card === null)
      throw new Error("Shell is incomplete.");
    return {
      headerTop: Math.round(header.getBoundingClientRect().top),
      headerPosition: getComputedStyle(header).position,
      backdrop: getComputedStyle(header).backdropFilter,
      transition: getComputedStyle(focused).transitionDuration,
      outline: getComputedStyle(focused).outlineStyle,
      cardBorder: getComputedStyle(card).borderTopWidth,
      hasLegacyName: document.body.textContent?.includes("Seq* Prototype") ?? false,
      hasLegacyLabName: document.body.textContent?.includes("P01 evidence") ?? false,
    };
  });
  expect(shell).toMatchObject({
    headerTop: 0,
    headerPosition: "sticky",
    backdrop: "none",
    cardBorder: "1px",
    hasLegacyName: false,
    hasLegacyLabName: false,
  });
  expect(
    Math.max(...shell.transition.split(",").map((value) => Number.parseFloat(value))),
  ).toBeLessThanOrEqual(0.01);
  expect(shell.outline).not.toBe("none");
  await expect(complex).not.toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Protein complex" }).click();
  await expect(page.getByRole("link", { name: "Protein complex" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});
