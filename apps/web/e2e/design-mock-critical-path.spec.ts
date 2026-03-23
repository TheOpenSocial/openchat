import { expect, test } from "@playwright/test";

test.describe("Web design mock critical path", () => {
  test("preview auth → onboarding → routed surfaces → agent message", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Explore the routed shell" }),
    ).toBeVisible();

    await page.getByTestId("web-design-preview-signin").click();
    await expect(
      page.getByRole("heading", { name: "Finish your profile" }),
    ).toBeVisible();

    await page.getByTestId("web-onboarding-continue").click();
    await expect(page.locator("h1", { hasText: "Home" })).toBeVisible();

    await page.getByRole("link", { name: "Requests", exact: true }).click();
    await expect(page.locator("h1", { hasText: "Requests" })).toBeVisible();

    await page.getByRole("link", { name: "Chats", exact: true }).click();
    await expect(page.locator("h1", { hasText: "Chats" })).toBeVisible();

    await page.getByRole("link", { name: "Discover", exact: true }).click();
    await expect(page.locator("h1", { hasText: "Discover" })).toBeVisible();

    await page.getByRole("link", { name: "Circles", exact: true }).click();
    await expect(page.locator("h1", { hasText: "Circles" })).toBeVisible();

    await page.getByRole("link", { name: "Automations", exact: true }).click();
    await expect(page.locator("h1", { hasText: "Automations" })).toBeVisible();

    await page.getByRole("link", { name: "Profile", exact: true }).click();
    await expect(page.locator("h1", { hasText: "Profile" })).toBeVisible();

    await page.getByRole("link", { name: "Home", exact: true }).click();
    await page
      .getByTestId("web-agent-intent-input")
      .fill("Playwright smoke intent");
    await page.getByTestId("web-agent-send-intent").click();

    await expect(page.getByText("Playwright smoke intent")).toBeVisible();
  });
});
