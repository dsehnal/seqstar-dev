import { expect, test } from "@playwright/test";

test("loads the empty prototype shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("prototype-shell")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "interoperable sequence visualization",
  );
});
