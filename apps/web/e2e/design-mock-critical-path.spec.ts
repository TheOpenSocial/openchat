import { expect, test } from "@playwright/test";

test.describe("Web design mock critical path", () => {
  test("welcome → preview auth → onboarding → home tabs → agent message", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Explore the app" }),
    ).toBeVisible();

    await page.getByTestId("web-design-welcome-continue").click();
    await expect(page.getByTestId("web-design-auth-title")).toBeVisible();

    await page.getByTestId("web-design-preview-signin").click();
    await expect(
      page.getByRole("heading", { name: "Finish your profile" }),
    ).toBeVisible();

    await page.getByTestId("web-onboarding-continue").click();
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();

    await page.getByTestId("web-tab-chats").click();
    await expect(
      page.getByRole("heading", { name: "Chats", exact: true }),
    ).toBeVisible();

    await page.getByTestId("web-tab-profile").click();
    await expect(
      page.getByRole("heading", { name: "Profile", exact: true }),
    ).toBeVisible();

    await page.getByTestId("web-tab-home").click();
    await page
      .getByTestId("web-agent-intent-input")
      .fill("Playwright smoke intent");
    await page.getByTestId("web-agent-send-intent").click();

    await expect(page.getByText("Playwright smoke intent")).toBeVisible();
  });
});
