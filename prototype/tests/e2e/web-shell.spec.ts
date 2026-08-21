import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { expect, test } from "@playwright/test";

const distRoot = new URL("../../apps/web/dist/", import.meta.url);
const contentTypes: Readonly<Record<string, string>> = {
  ".bcif": "application/octet-stream",
  ".cif": "text/plain; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
};

test("loads the relative production bundle from an extensionless nested mount", async ({
  page,
}) => {
  const mount = "/apps/web/dist";
  await page.route("http://relative-host.test/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    const relative =
      pathname === mount || pathname === `${mount}/`
        ? "index.html"
        : pathname.startsWith(`${mount}/`)
          ? decodeURIComponent(pathname.slice(mount.length + 1))
          : undefined;
    if (relative === undefined || relative.split("/").includes("..")) {
      await route.fulfill({ status: 404, body: "Not found" });
      return;
    }
    try {
      const body = await readFile(new URL(relative, distRoot));
      await route.fulfill({
        status: 200,
        body,
        contentType: contentTypes[extname(relative)] ?? "application/octet-stream",
      });
    } catch {
      await route.fulfill({ status: 404, body: "Not found" });
    }
  });

  await page.goto("http://relative-host.test/apps/web/dist");
  await expect.poll(() => page.evaluate(() => window.location.pathname)).toBe(mount);
  await expect
    .poll(() => page.evaluate(() => document.baseURI))
    .toBe("http://relative-host.test/apps/web/dist/");
  await expect(page.getByTestId("prototype-shell")).toBeVisible();
  await page.getByRole("link", { name: "Protein complex" }).click();
  await expect(page.getByTestId("case-complex")).toBeVisible();
});

test("uses hash deep links, accessible navigation, and a responsive case shell", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/#/renderer-portability");

  await expect(page).toHaveURL(/#\/renderer-portability$/u);
  await expect(page.getByTestId("case-renderer-portability")).toBeVisible();
  await expect(page.getByText("Case study", { exact: true })).toBeVisible();
  await expect(page.getByText(/Case study \d/u)).toHaveCount(0);
  await page.locator(".app-nav__more > summary").click();
  await expect(page.getByRole("link", { name: "Renderer comparison" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const activeRoute = page.getByRole("link", { name: "Renderer comparison" });
  await expect(activeRoute).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(activeRoute).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
  await expect(activeRoute).toHaveCSS("border-radius", "0px");
  await expect(activeRoute).toHaveCSS("box-shadow", /inset/u);
  await expect(page.getByTestId("visualizer-panel-base-sequence")).toBeVisible();
  await expect(page.getByTestId("visualizer-panel-nightingale")).toBeVisible();

  await page.getByRole("link", { name: "Protein complex" }).focus();
  await expect(page.getByRole("link", { name: "Protein complex" })).toBeFocused();

  await page.getByRole("link", { name: "Mol* Harness Prototype" }).click();
  await expect(page.getByText("Vibe-coded research prototype")).toBeVisible();
  const warning = page.getByText("This is a vibe-coded prototype, not a product.");
  const seqIntroduction = page.getByText(/It introduces Seq\*/u);
  await expect(warning).toBeVisible();
  await expect(seqIntroduction).toBeVisible();
  await expect(page.getByText(/It also introduces Seq\*/u)).toHaveCount(0);
  const [seqBox, warningBox] = await Promise.all([
    seqIntroduction.boundingBox(),
    warning.boundingBox(),
  ]);
  if (seqBox === null || warningBox === null) throw new Error("Landing copy geometry is missing.");
  expect(seqBox.y).toBeLessThan(warningBox.y);
  await expect(page.getByText(/Mol\* idea, but for sequences/u)).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore case shells" })).toHaveCount(0);
  await expect(page.locator(".app-nav > a")).toHaveCount(5);
  await expect(page.getByRole("link", { name: "Tomogram to molecule" })).toBeVisible();
  await expect(page.locator(".app-nav__menu > a")).toHaveCount(3);

  await page.setViewportSize({ width: 480, height: 900 });
  await expect(page.getByTestId("prototype-shell")).toBeVisible();
});

test("disposes connected hosts and remounts a fresh StrictMode-safe harness", async ({ page }) => {
  await page.addInitScript(() => {
    const events: unknown[] = [];
    Object.defineProperty(window, "__seqstarDisposeEvents", { value: events });
    window.addEventListener("seqstar:harness-dispose", (event) => {
      events.push((event as CustomEvent).detail);
    });
  });
  await page.goto("/#/harness-diagnostics");
  await expect(page.getByTestId("page-harness-status")).toContainText("ready");
  await expect(page.getByTestId("visualizer-panel-diagnostic-sequence")).toHaveAttribute(
    "data-harness-component",
    "ready",
  );
  expect(
    await page.evaluate(() => Number(document.documentElement.dataset.harnessStartCount)),
  ).toBe(2);

  await page.getByRole("button", { name: "Record diagnostics probe" }).click();
  await page.getByRole("button", { name: "Show details" }).click();
  const drawer = page.getByTestId("diagnostics-drawer");
  await expect(drawer).toContainText("harness.diagnostic");
  await expect(drawer.getByTestId("lifecycle-summary").getByRole("listitem")).toHaveCount(2);
  await drawer
    .getByRole("button", { name: /harness\.diagnostic/u })
    .first()
    .click();
  await expect(drawer).toContainText("[redacted]");
  await expect(drawer).not.toContainText("never-render-this");
  await drawer
    .getByRole("button", { name: "seqviewspec: diagnostic-probe-harness-diagnostics" })
    .click();
  const inspector = drawer.getByTestId("document-inspector");
  await expect(inspector).toContainText("[redacted]");
  await inspector.getByRole("button", { name: "Validate document" }).click();
  await expect(inspector.getByRole("status")).toContainText("Document is invalid");
  await expect(inspector.getByRole("button", { name: "Download validated JSON" })).toBeDisabled();

  await page.getByRole("link", { name: "Mol* Harness Prototype" }).click();
  await expect(page.getByTestId("prototype-shell")).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            __seqstarDisposeEvents: { componentId: string; hostConnected: boolean }[];
          }
        ).__seqstarDisposeEvents,
    ),
  ).toEqual([
    { componentId: "diagnostic-sequence", hostConnected: true },
    { componentId: "diagnostic-structure", hostConnected: true },
  ]);
  await page.evaluate(() => {
    window.location.hash = "/harness-diagnostics";
  });
  await expect(page.getByTestId("page-harness-status")).toContainText("ready");
  expect(
    await page.evaluate(() => Number(document.documentElement.dataset.harnessStartCount)),
  ).toBe(4);
  await page.getByRole("button", { name: "Show details" }).click();
  await expect(
    page.getByTestId("diagnostics-drawer").getByTestId("lifecycle-summary").getByRole("listitem"),
  ).toHaveCount(2);

  await page.getByRole("button", { name: "Hide details" }).click();
  await page.getByRole("button", { name: "Test harness startup recovery" }).click();
  const startupFailure = page.getByRole("alert");
  await expect(startupFailure).toContainText("Harness startup failed");
  await expect(startupFailure).toContainText("harness-diagnostics");
  await startupFailure.getByRole("button", { name: "Retry harness startup" }).click();
  await expect(page.getByTestId("page-harness-status")).toContainText("ready");
  await expect(page.getByTestId("visualizer-panel-diagnostic-sequence")).toHaveAttribute(
    "data-harness-component",
    "ready",
  );
  expect(
    await page.evaluate(() => Number(document.documentElement.dataset.harnessStartCount)),
  ).toBe(6);
});
