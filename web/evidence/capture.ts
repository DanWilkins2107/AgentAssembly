import { expect, test } from "@playwright/test";

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 375, height: 812 },
};

const STATES = ["default", "error", "loading"];

for (const [size, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(size, () => {
    test.use({ viewport });

    for (const state of STATES) {
      test(`${state} state`, async ({ page }) => {
        await page.goto(`?state=${state}`);
        await expect(page.locator(".login-form")).toBeVisible();
        await page.screenshot({
          path: `evidence/out/${state}-${size}.png`,
          animations: "disabled",
        });
      });
    }

    test("failed sign-in attempt", async ({ page }) => {
      await page.goto("./");
      await page
        .getByLabel("Email")
        .pressSequentially("ada@agentassembly.dev", { delay: 70 });
      await page
        .getByLabel("Password")
        .pressSequentially("hunter2", { delay: 70 });
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByRole("alert")).toBeVisible();
      await page.waitForTimeout(1200);
    });
  });
}
