import { expect, test } from "@playwright/test";

test("renders admin sign-in gate", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Operator console" }),
  ).toBeVisible();
  await expect(page.getByText("OpenSocial").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
});
