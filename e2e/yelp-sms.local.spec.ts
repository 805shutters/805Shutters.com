import { test, expect, devices, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { buildActiveJobsSnapshot } from "../src/lib/crm/active-jobs";
import { buildDashboardData } from "../src/lib/crm/backend";
import type { CrmJob } from "../src/lib/crm/types";
import { yelpSmsBody, type YelpSmsStatus } from "../src/lib/crm/yelp-sms-shared";

// Synthetic auth, customers and provider responses. All external requests are blocked.
const stamp = "2026-10-14T12:00:00Z";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const email = "805@805shutters.com";
function fixture() {
  const jobs = ["Avery Sample", "Blair Sample", "No Phone Sample", "Error Sample"].map((name, n) => ({
    id: id(n + 1), created_at: stamp, updated_at: stamp, source: "crm", lead_id: null, status: "sold", priority: "normal",
    customer_name: name, phone: n === 2 ? null : n === 3 ? "8055550102" : "8055550100", email: "sample@example.com",
    address: "100 Example Lane", city: "Ventura", product_interest: "Plantation shutters", sales_owner: "Jessica",
    next_action: null, next_action_due: null, appointment_start: stamp, appointment_end: null,
    estimated_total: 4000, deposit_paid: 0, notes: "Synthetic test record", meta: {}
  }) as CrmJob);
  return buildDashboardData({ jobs, quotes: [], events: [], customers: [], products: [], contracts: [], entries: [], payments: [],
    credits: [], expenses: [], installationInvoiceEmails: [], kenPayments: [], openingBalance: 0, payoffTarget: 500000 });
}

async function setup(page: Page, outcome: "accepted" | "review" | "lost" | "unconfigured" = "accepted") {
  const data = fixture();
  writeFileSync("/tmp/805-yelp-sms-fixture.json", JSON.stringify(data));
  const user = { id: id(99), aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: stamp };
  const token = [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ sub: user.id, email, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 7200 })).toString("base64url"), "synthetic-signature"].join(".");
  await page.addInitScript(({ user, token }) => {
    localStorage.setItem("sb-yelp-test-auth-token", JSON.stringify({ access_token: token, refresh_token: "synthetic-refresh", token_type: "bearer",
      expires_in: 7200, expires_at: Math.floor(Date.now() / 1000) + 7200, user }));
  }, { user, token });
  const writes: Record<string, unknown>[] = [];
  const statuses: YelpSmsStatus[] = [];
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/\/$/, "");
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
      if (url.hostname === "yelp-test.supabase.co") return route.fulfill({ json: user });
      return route.abort();
    }
    if (!path.startsWith("/api/")) return route.continue();
    if (path === "/api/crm/session") return route.fulfill({ json: { email, displayName: "Local test" } });
    if (path === "/api/crm/payment-plans" || path === "/api/crm/in-house-plans") return route.fulfill({ json: { plans: [] } });
    if (path === "/api/crm/jobs") return route.fulfill({ json: url.searchParams.get("scope") === "active" ? buildActiveJobsSnapshot(data) : data });
    if (path === "/api/crm/yelp-sms") {
      if (route.request().method() === "GET") return route.fulfill({ json: { statuses } });
      expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
      const body = route.request().postDataJSON() as { itemId: string; expectedPhone: string };
      writes.push(body);
      if (outcome === "unconfigured") return route.fulfill({ status: 503, json: { message: "805 SMS is not configured. No text was sent." } });
      const result: YelpSmsStatus = { phone: body.expectedPhone, status: outcome === "review" ? "needs_review" : "accepted", attemptedAt: stamp };
      statuses.push(result);
      if (outcome === "lost") return route.abort();
      await new Promise(resolve => setTimeout(resolve, 100));
      return route.fulfill({ json: { ...result, duplicate: false, warning: outcome === "review" ? "Provider outcome uncertain; check the SMS log before resending." : null } });
    }
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/crm/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "Job status", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Text Yelp link to Avery Sample", exact: true })).toBeEnabled();
  return { writes, statuses };
}

test("one direct click texts saved cell, shares status across jobs, and persists after reload", async ({ page }) => {
  const { writes } = await setup(page);
  const button = page.getByRole("button", { name: "Text Yelp link to Avery Sample", exact: true });
  await expect(button).toHaveAttribute("title", `Text Avery Sample at +18055550100: ${yelpSmsBody("Avery Sample")}`);
  await expect(page.getByRole("button", { name: "Text Yelp link to No Phone Sample" })).toBeDisabled();
  await button.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Yelp text accepted for sending to Avery Sample");
  expect(writes).toEqual([{ itemId: `job:${id(1)}`, expectedPhone: "+18055550100" }]);
  await expect(page.getByRole("button", { name: "Text Yelp link to Blair Sample; already sent" })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("button", { name: "Text Yelp link to Avery Sample; already sent" })).toBeDisabled();
  await page.getByRole("button", { name: "Avery Sample", exact: true }).click();
  await expect(page.getByRole("button", { name: "Back to job status" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Text Yelp link to Avery Sample; already sent" }).first()).toBeDisabled();
  expect(writes).toHaveLength(1);
});

test("uncertain provider outcome stays disabled with an explicit error", async ({ page }) => {
  const { writes } = await setup(page, "review");
  await page.getByRole("button", { name: "Text Yelp link to Avery Sample", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Provider outcome uncertain" })).toContainText("Provider outcome uncertain");
  await expect(page.getByRole("button", { name: "Text Yelp link to Avery Sample", exact: true })).toBeDisabled();
  expect(writes).toHaveLength(1);
});

test("lost response reads history before allowing a retry", async ({ page }) => {
  const { writes } = await setup(page, "lost");
  await page.getByRole("button", { name: "Text Yelp link to Avery Sample", exact: true }).click();
  await expect(page.getByRole("button", { name: "Text Yelp link to Avery Sample; already sent" })).toBeDisabled();
  expect(writes).toHaveLength(1);
});

test("missing SMS config reports no send and releases the button only after history read", async ({ page }) => {
  await setup(page, "unconfigured");
  await page.getByRole("button", { name: "Text Yelp link to Avery Sample", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No text was sent" })).toContainText("No text was sent");
  await expect(page.getByRole("button", { name: "Text Yelp link to Avery Sample", exact: true })).toBeEnabled();
});

test("compact yellow button fits desktop, iPad and phone and is hidden in print", async ({ page }) => {
  await setup(page);
  for (const [name, width, height] of [["desktop", 1440, 1000], ["ipad", 1024, 1366], ["phone", 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    const button = page.getByRole("button", { name: "Text Yelp link to Avery Sample", exact: true });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box?.width).toBeLessThan(65); expect(box?.height).toBeLessThan(36);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    const nameBox = await page.getByRole("button", { name: "Avery Sample", exact: true }).boundingBox();
    expect(nameBox!.height).toBeLessThan(55);
    expect(await button.evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgb(245, 204, 75)");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/805-yelp-${name}.png`, fullPage: true });
  }
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "Text Yelp link to Avery Sample", exact: true })).toBeHidden();
});

test("touch button remains compact and sends directly on phone", async ({ browser }) => {
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await context.newPage();
  const { writes } = await setup(page);
  await page.getByRole("button", { name: "Text Yelp link to Avery Sample", exact: true }).tap();
  await expect(page.getByRole("button", { name: "Text Yelp link to Avery Sample; already sent" })).toBeDisabled();
  expect(writes).toHaveLength(1);
  await context.close();
});


test("list view keeps the Yelp action beside the name and shares its sent state with cards", async ({ page }) => {
  const { writes } = await setup(page);
  await page.getByRole("radio", { name: "List view", exact: true }).check();
  const button = page.getByRole("button", { name: "Text Yelp link to Avery Sample", exact: true });
  await expect(button).toBeVisible();
  const name = page.getByRole("button", { name: "Avery Sample", exact: true });
  const nameBox = (await name.boundingBox())!;
  const buttonBox = (await button.boundingBox())!;
  expect(Math.abs(nameBox.y - buttonBox.y)).toBeLessThan(8);
  expect(buttonBox.x).toBeGreaterThan(nameBox.x);
  await button.click();
  await expect(page.getByRole("button", { name: "Text Yelp link to Avery Sample; already sent" })).toBeDisabled();
  await page.getByRole("radio", { name: "Card view", exact: true }).check();
  await expect(page.getByRole("button", { name: "Text Yelp link to Avery Sample; already sent" })).toBeDisabled();
  expect(writes).toHaveLength(1);
});
