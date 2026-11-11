import { expect, test, type Page } from "@playwright/test";

// Real browser and components; all booking, messaging and analytics destinations
// are intercepted. Never create a live appointment or contact the business.
test.beforeEach(async ({ page, baseURL }) => {
  if (
    !baseURL ||
    !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)
  )
    throw Error("Local preview required");
  await page.route("**/*", async (r) => {
    const url = new URL(r.request().url());
    if (url.origin !== new URL(baseURL).origin) return r.abort();
    if (url.pathname.includes("/api/booking/availability")) {
      const month = url.searchParams.get("month")!;
      return r.fulfill({
        json: {
          configured: true,
          month,
          monthLabel: "Sample month",
          startsOn: 0,
          revision: "demo",
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          addressChecked: !!url.searchParams.get("address"),
          appointmentDurationMinutes: 60,
          days: [
            {
              date: month + "-28",
              day: 28,
              available: true,
              slots: [
                {
                  time: "10:30",
                  label: "10:30 AM",
                  available: true,
                  bookable: !url.searchParams.has("mode"),
                },
              ],
            },
          ],
        },
      });
    }
    if (/^\/api\/booking\/?$/.test(url.pathname))
      return r.fulfill({
        json: {
          leadId: "test-event",
          eventId: "test-event",
          jobId: "test-job",
        },
      });
    if (url.pathname.includes("/api/booking/time-request"))
      return r.fulfill({ json: { ok: true } });
    if (url.pathname.startsWith("/api/")) return r.fulfill({ json: {} });
    return r.continue();
  });
});
const events = (page: Page) =>
  page.evaluate(() =>
    ((window as Window & { dataLayer?: ArrayLike<unknown>[] }).dataLayer || [])
      .map((row) => Array.from(row))
      .filter((row) => row[0] === "event" && row[1] === "booking_confirmed"),
  );

for (const variant of ["standard", "commercial", "requested"])
  test(variant + " booking outcome", async ({ page }) => {
    const commercial = variant === "commercial",
      requested = variant === "requested";
    await page.goto(
      commercial ? "/commercial-window-coverings/" : "/book-consultation/",
    );
    if (commercial) {
      await page
        .locator(".commercial-seo-hero")
        .getByRole("button", { name: "Book a commercial shade audit" })
        .click();
      await page
        .locator(
          ".booking-window-count-choice, .booking-window-grid button, fieldset[aria-label*=Approximately] button",
        )
        .first()
        .click();
      await page
        .locator('[name="projectAddress"]')
        .fill("123 Test Street, Camarillo, CA");
      await page
        .getByRole("button", { name: "Show audit dates and times" })
        .click();
    }
    await page
      .locator(
        commercial
          ? ".booking-day--available"
          : ".consultation-booking__days button:enabled",
      )
      .first()
      .click();
    if (requested)
      await page
        .getByRole("button", { name: /Request a different time/ })
        .click();
    await page.getByRole("button", { name: /^10:30 AM/ }).click();
    const form = page.locator(
      commercial ? "dialog form" : ".consultation-booking form",
    );
    await form.locator('[name="name"]').fill("Site Preview");
    if (!commercial)
      await form
        .locator('[name="address"]')
        .fill("123 Test Street, Camarillo, CA");
    await form.locator('[name="phone"]').fill("8055550100");
    if (commercial)
      await form.locator('[name="email"]').fill("preview@example.test");
    if (requested) {
      await form.getByRole("button", { name: "Send time request" }).click();
      await expect(page.getByText("Your request is received.")).toBeVisible();
      expect(await events(page)).toHaveLength(0);
      return;
    }
    await form.locator('button[name="followUp"]').last().click();
    await expect(page).toHaveURL(/\/booking-thank-you\/$/);
    await expect(
      page.getByRole("heading", { name: "Thank you for booking." }),
    ).toBeVisible();
    expect(await events(page)).toHaveLength(1);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Booking confirmation" }),
    ).toBeVisible();
    expect(await events(page)).toHaveLength(0);
    await page.goto("/booking-thank-you/?lead_id=not-a-booking");
    await expect(
      page.getByRole("link", { name: "choose an appointment time" }),
    ).toBeVisible();
    expect(await events(page)).toHaveLength(0);
  });

test("an inquiry, human text request and AI conversation have distinct outcomes", async ({
  page,
}) => {
  await page.route("**/api/assistant/text-request/", (r) =>
    r.fulfill({ json: { ok: true } }),
  );
  await page.route("**/api/assistant/", (r) =>
    r.fulfill({ json: { reply: "Preview reply." } }),
  );
  await page.route("**/api/leads/", (r) =>
    r.fulfill({ json: { id: "preview-inquiry" } }),
  );
  await page.goto("/");
  await page.getByRole("link", { name: "Text 805 Shutters", exact: true }).click();
  await page.getByLabel("Mobile number").fill("8055550100");
  await page
    .getByLabel("Your question", { exact: true })
    .fill("Sample question");
  await page.getByRole("button", { name: "Send text", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Message sent" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close confirmation" }).click();
  await page.getByRole("button", { name: "Open Ask 805 options" }).click();
  await page.getByRole("button", { name: /General inquiry/ }).click();
  await page
    .getByRole("button", { name: "Compare shutters and shades" })
    .click();
  await expect(page.getByText("Preview reply.")).toBeVisible();
  const names = await page.evaluate(() =>
    (
      (window as Window & { dataLayer?: ArrayLike<unknown>[] }).dataLayer || []
    ).map((row) => Array.from(row)[1]),
  );
  expect(names).toEqual(
    expect.arrayContaining([
      "ask805_text_form_open",
      "ask805_text_request_accepted",
      "ask805_ai_open",
      "ask805_ai_answer",
    ]),
  );
  expect(await events(page)).toHaveLength(0);
  await page.getByRole("button", { name: "Close assistant" }).click();
  await page.getByRole("link", { name: "Email 805 Shutters", exact: true }).click();
  await expect(page.locator("#email-805 a").first()).toHaveAttribute(
    "href",
    "mailto:805@805shutters.com",
  );
  await expect(page).toHaveURL(/\/contact\/#email-805$/);
  const form = page.locator("#email-805 form");
  await form.locator('[name="name"]').fill("Preview");
  await form.locator('[name="phone"]').fill("8055550100");
  await form.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/thank-you\/\?lead_id=preview-inquiry/);
  expect(await events(page)).toHaveLength(0);
});

test("homepage keeps its contact and social controls and opens the About page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("region", { name: "admin login" })).toHaveCount(0);
  await expect(page.locator(".phone-note a").first()).toHaveAttribute("href", /tel:.*8058069344/);
  for (const channel of ["Facebook", "Instagram", "Yelp"]) {
    await expect(page.locator("footer").getByRole("link", { name: "805 Shutters on " + channel })).toBeVisible();
  }
  await page.locator(".masthead-about-link").click();
  await expect(page).toHaveURL(/\/about\/$/);
});

test.describe("mobile contact", () => {
  test.use({ viewport: { width: 390, height: 844 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1", isMobile: true, hasTouch: true });
  test("text opens the SMS address without counting a booking", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open Ask 805 options" }).click();
    const sms = page.getByRole("link", { name: /Text us a question/ });
    await expect(sms).toHaveAttribute("href", /^sms:\+18058069344/);
    await sms.evaluate(link => link.addEventListener("click", e => e.preventDefault(), { once: true }));
    await sms.click();
    expect(await page.evaluate(() => ((window as Window & { dataLayer?: ArrayLike<unknown>[] }).dataLayer || []).map(row => Array.from(row)[1]))).toContain("ask805_sms_open");
    expect(await events(page)).toHaveLength(0);
  });
});
