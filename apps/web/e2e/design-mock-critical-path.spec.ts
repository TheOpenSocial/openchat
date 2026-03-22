import { expect, test } from "@playwright/test";

test.describe("Web design mock critical path", () => {
  test("preview auth → onboarding → routed surfaces → agent message", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Explore the app" }),
    ).toBeVisible();

    await page.getByTestId("web-design-preview-signin").click();
    await expect(
      page.getByRole("heading", { name: "Finish your profile" }),
    ).toBeVisible();

    await page.getByTestId("web-onboarding-continue").click();
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();

    await page.getByRole("link", { name: "Requests" }).click();
    await expect(
      page.getByRole("heading", { name: "Requests", exact: true }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Chats" }).click();
    await expect(
      page.getByRole("heading", { name: "Chats", exact: true }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Discover" }).click();
    await expect(
      page.getByRole("heading", { name: "Discover", exact: true }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Circles" }).click();
    await expect(
      page.getByRole("heading", { name: "Circles", exact: true }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Automations" }).click();
    await expect(
      page.getByRole("heading", { name: "Automations", exact: true }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Profile" }).click();
    await expect(
      page.getByRole("heading", { name: "Profile", exact: true }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Home" }).click();
    await page
      .getByTestId("web-agent-intent-input")
      .fill("Playwright smoke intent");
    await page.getByTestId("web-agent-send-intent").click();

    await expect(page.getByText("Playwright smoke intent")).toBeVisible();
  });
});
