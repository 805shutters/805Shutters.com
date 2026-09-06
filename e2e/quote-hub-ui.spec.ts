import { test, expect } from "@playwright/test";
// Isolated development fixture: no CRM API, real customer data, or real sending.
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1")
      return route.abort();
    if (url.pathname.startsWith("/api/crm/"))
      throw new Error("The UI fixture must never contact live CRM APIs");
    return route.continue();
  });
  await page.goto("/crm/quote-hub-preview/");
  await expect(
    page.getByRole("button", { name: "Preview email", exact: true }),
  ).toBeEnabled();
});
test("discount, preview and simulated send preserve the original quote", async ({
  page,
}) => {
  await page
    .getByRole("spinbutton", { name: "Discount percentage" })
    .fill("12.5");
  await expect(page.getByText("$3,235.91", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Preview email", exact: true })
    .click();
  const preview = page.getByRole("region", { name: "Customer email preview" });
  await expect(preview).toContainText("12.5%");
  await page.getByRole("button", { name: "Send email now" }).click();
  await expect(
    page.getByText("Sent · accepted by email provider", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("$3,698.18", { exact: true }).first(),
  ).toBeVisible();
});
test("four actions, saved text, notes and image order work", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Still interested?", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Email message" })
    .fill("Checking in about your shutters.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved.", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Personal message", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Still interested?", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Email message" }),
  ).toHaveValue("Checking in about your shutters.");
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Internal note", exact: true })
    .fill("Prefers a call on Friday.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(
    page.getByText("Prefers a call on Friday.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Send inspiration", exact: true })
    .click();
  const photoButtons = page
    .locator("button")
    .filter({ has: page.locator("img") });
  await photoButtons.nth(0).click();
  await photoButtons.nth(1).click();
  await photoButtons.nth(0).click();
  await page
    .getByRole("button", { name: "Preview email", exact: true })
    .click();
  const images = page
    .getByRole("region", { name: "Customer email preview" })
    .locator("img");
  await expect(images).toHaveCount(2);
  await expect(images.nth(0)).toHaveAttribute("src", /roller-shades/);
  await expect(images.nth(1)).toHaveAttribute("src", /plantation-shutters/);
  await page.screenshot({
    path: "/tmp/805-quote-hub-desktop.png",
    fullPage: true,
  });
});
test("mobile remains within the viewport and invalid offers cannot send", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page
    .getByRole("spinbutton", { name: "Discount percentage" })
    .fill("51");
  await expect(
    page.getByRole("button", { name: "Preview email", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "10%", exact: true }).click();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  await page.screenshot({
    path: "/tmp/805-quote-hub-mobile.png",
    fullPage: true,
  });
});

test("photo uploads join the email and customer drafts stay separate", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Personal message", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Email message" })
    .fill("A personal note for Avery.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("button", { name: /Jordan Example/ }).click();
  await expect(
    page.getByRole("textbox", { name: "Email message" }),
  ).not.toHaveValue("A personal note for Avery.");
  await page.getByRole("button", { name: /Avery Sample/ }).click();
  await page
    .getByRole("button", { name: "Personal message", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Email message" }),
  ).toHaveValue("A personal note for Avery.");
  await page
    .getByRole("button", { name: "Send inspiration", exact: true })
    .click();
  await page
    .locator("input[type=file]")
    .setInputFiles("public/images/homepage-flow/roller-shades.jpg");
  await expect(
    page.getByText("Choose photos · 2 selected", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Preview email", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Customer email preview" }).locator("img"),
  ).toHaveCount(2);
});

test("hub APIs reject requests without a CRM session", async ({ request }) => {
  const url = "/api/crm/quote-hub/crm/30000000-0000-4000-8000-000000000001/";
  expect((await request.get(url)).status()).toBe(401);
  expect(
    (
      await request.post(url, {
        data: { operation: "send", messageId: "sample" },
      })
    ).status(),
  ).toBe(401);
  expect((await request.post("/api/crm/quote-hub/photos/")).status()).toBe(401);
});
