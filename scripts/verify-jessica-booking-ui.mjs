// Local browser QA only. Run with a dev server at 127.0.0.1:3107.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile, rm } from "node:fs/promises";
const base = "http://127.0.0.1:3107";
const dir = "artifacts/booking-authority";
await mkdir(dir, { recursive: true });
const fixture = "src/app/booking-ui-test";
await mkdir(fixture, { recursive: true });
await writeFile(
  `${fixture}/page.tsx`,
  '"use client"; import type { Session } from "@supabase/supabase-js"; import { JessicaWorkingRanges } from "@/components/crm/JessicaWorkingRanges"; export default function Preview(){return <main style={{padding:"24px",background:"#f5f7f4"}}><JessicaWorkingRanges session={{access_token:"isolated-browser-fixture"} as Session}/></main>}',
  { flag: "wx" },
);
const browser = await chromium.launch({ headless: true });
const month = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
})
  .format(new Date())
  .slice(0, 7);
const date = `${month}-15`;
const opened = (revision = "1", available = true) => ({
  configured: true,
  revision,
  expiresAt: new Date(Date.now() + 30000).toISOString(),
  appointmentDurationMinutes: 60,
  month,
  monthLabel: "Calendar preview",
  startsOn: 2,
  days: [
    {
      date,
      day: 15,
      inMonth: true,
      available,
      slots: [
        {
          time: "10:00",
          label: "10:00 AM",
          available,
          reason: available ? null : "closed_hours",
        },
        {
          time: "11:00",
          label: "11:00 AM",
          available,
          reason: available ? null : "closed_hours",
        },
      ],
    },
  ],
});
const reports = [];
try {
  for (const width of [1440, 820, 375]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/places/**", (r) =>
      r.fulfill({ json: { suggestions: [] } }),
    );
    let revision = "1",
      available = true,
      submits = [];
    await page.route("**/api/booking/availability?**", (r) =>
      r.fulfill({ json: opened(revision, available) }),
    );
    await page.route("**/api/booking/", (r) => {
      submits.push(r.request().postDataJSON());
      return r.fulfill({
        status: 409,
        json: { message: "That appointment time is no longer available." },
      });
    });
    await page.route("**/api/booking", (r) => {
      submits.push(r.request().postDataJSON());
      return r.fulfill({
        status: 409,
        json: { message: "That appointment time is no longer available." },
      });
    });
    await page.goto(`${base}/book-consultation/`);
    await page.getByRole("button", { name: "1-5", exact: true }).click();
    await page
      .getByRole("combobox", { name: "What address should we go to?" })
      .fill("123 Main Street, Camarillo, CA");
    await page
      .getByRole("button", { name: "Show dates and times", exact: true })
      .click();
    await page.getByRole("button", { name: "15", exact: true }).click();
    await page.getByRole("button", { name: "10:00 AM", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Full name", exact: true })
      .fill("Local Browser Test");
    await page
      .getByRole("textbox", { name: "Phone", exact: true })
      .fill("8055550100");
    await page.screenshot({
      path: `${dir}/customer-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: /Submit.*no follow-up/ }).click();
    await expect(
      page.getByText("That appointment time is no longer available.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "11:00 AM", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Full name", exact: true }),
    ).toHaveValue("Local Browser Test");
    if (!submits[0]?.idempotencyKey) throw new Error("Missing idempotency key");
    revision = "2";
    available = false;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page.getByRole("button", { name: "11:00 AM", exact: true }),
    ).toBeDisabled();
    await page.screenshot({
      path: `${dir}/customer-closed-${width}.png`,
      fullPage: true,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    if (overflow) throw new Error(`Customer overflow at ${width}`);
    reports.push({
      surface: "customer",
      width,
      contactPreserved: true,
      focusRefresh: true,
      closedTimesDisabled: true,
      errors,
    });
    await context.close();
  }
  // The same engine is reached from the homepage modal and commercial modal.
  for (const [path, label] of [
    ["/", "Book an appointment here"],
    ["/commercial-window-coverings/", "Book a commercial shade audit"],
  ]) {
    const context = await browser.newContext({
      viewport: { width: 375, height: 1000 },
    });
    const page = await context.newPage();
    await page.route("**/api/places/**", (r) =>
      r.fulfill({ json: { suggestions: [] } }),
    );
    let calls = 0;
    await page.route("**/api/booking/availability?**", (r) => {
      calls++;
      return r.fulfill({ json: opened("closed", false) });
    });
    await page.goto(`${base}${path}`);
    await page
      .getByRole("button", { name: label, exact: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Book an appointment",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "1-5", exact: true }).click();
    await dialog.getByRole("combobox").fill("123 Main Street, Camarillo, CA");
    await dialog
      .getByRole("button", { name: /^Show (audit )?dates and times$/ })
      .click();
    await expect(
      dialog.getByRole("button", { name: "15", exact: true }),
    ).toBeDisabled();
    if (calls !== 1)
      throw new Error("Modal did not use shared availability API");
    reports.push({ surface: path, modal: true, closedMonth: true });
    await context.close();
  }
  // Late responses for a superseded address cannot restore obsolete openings.
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.clock.install();
    await page.route("**/api/places/**", (r) =>
      r.fulfill({ json: { suggestions: [] } }),
    );
    let releaseOld,
      oldRequested = false,
      calls = 0;
    await page.route("**/api/booking/availability?**", async (r) => {
      calls++;
      if (r.request().url().includes("Old+Address")) {
        oldRequested = true;
        await new Promise((resolve) => (releaseOld = resolve));
        await r.fulfill({ json: opened("old", true) }).catch(() => {});
      } else await r.fulfill({ json: opened("new", false) });
    });
    await page.goto(`${base}/book-consultation/`);
    await page.getByRole("button", { name: "1-5", exact: true }).click();
    const address = page.getByRole("combobox", {
      name: "What address should we go to?",
    });
    await address.fill("Old Address");
    await page
      .getByRole("button", { name: "Show dates and times", exact: true })
      .click();
    await expect.poll(() => oldRequested).toBe(true);
    await address.fill("123 Main Street, Camarillo, CA");
    await page
      .getByRole("button", { name: "Show dates and times", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "15", exact: true }),
    ).toBeDisabled();
    releaseOld();
    await page.clock.runFor(1000);
    await expect(
      page.getByRole("button", { name: "15", exact: true }),
    ).toBeDisabled();
    const prior = calls;
    await page.clock.runFor(31000);
    await expect.poll(() => calls).toBeGreaterThan(prior);
    reports.push({
      surface: "customer",
      supersededAddressDiscarded: true,
      thirtySecondRefresh: true,
    });
    await context.close();
  }
  for (const width of [1440, 820, 375]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
    });
    const page = await context.newPage();
    let published = [];
    const ranges = [
      {
        id: "draft",
        owner: "Jessica",
        status: "draft",
        source: "crm_click_availability",
        start_at: `${date}T16:00:00Z`,
        end_at: `${date}T19:00:00Z`,
      },
    ];
    await page.route("**/api/places/**", (r) =>
      r.fulfill({ json: { suggestions: [] } }),
    );
    await page.route("**/api/crm/availability**", (r) => {
      if (r.request().method() === "PUT") {
        const body = r.request().postDataJSON();
        published.push(body);
        return r.fulfill({
          json: {
            revision: "2",
            ranges: body.ranges.map((v) => ({
              ...v,
              owner: "Jessica",
              status: "available",
              source: "crm_working_ranges",
            })),
          },
        });
      }
      if (r.request().url().includes("preview=true"))
        return r.fulfill({ json: opened("2", true) });
      return r.fulfill({ json: { revision: "1", ranges, slots: [] } });
    });
    await page.goto(`${base}/booking-ui-test/`);
    await expect(
      page.getByText(
        /Previous open-time buttons have been converted to drafts/,
      ),
    ).toBeVisible();
    await page.getByLabel("Start 1", { exact: true }).fill("10:00");
    await page.getByLabel("End 1", { exact: true }).fill("14:00");
    await page
      .getByRole("button", { name: "Publish working ranges", exact: true })
      .click();
    await expect(
      page.getByText(/Jessica's working ranges are published/),
    ).toBeVisible();
    if (published.length !== 1 || published[0].ranges.length !== 1)
      throw new Error("Ranges did not publish atomically");
    await page
      .getByRole("combobox", { name: "Customer service address", exact: true })
      .fill("123 Main Street, Camarillo, CA");
    await page
      .getByRole("button", { name: "Check customer availability", exact: true })
      .click();
    await expect(
      page.getByText(`${date} · 2 available starts`, { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `${dir}/crm-ranges-${width}.png`,
      fullPage: true,
    });
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      )
    )
      throw new Error(`CRM overflow at ${width}`);
    reports.push({
      surface: "CRM ranges",
      width,
      draftReview: true,
      atomicPublication: true,
      customerPreview: true,
    });
    await context.close();
  }
  await writeFile(
    `${dir}/browser-results.json`,
    JSON.stringify(reports, null, 2),
  );
  console.log(JSON.stringify(reports, null, 2));
} finally {
  await browser.close();
  await rm(fixture, { recursive: true });
}
