import { test, expect } from "@playwright/test";
import { buildActiveJobsSnapshot } from "../src/lib/crm/active-jobs";
import { buildDashboardData } from "../src/lib/crm/backend";
import type { CrmJob, CrmQuote, CrmCustomerContract } from "../src/lib/crm/types";

// All auth, CRM requests, and records are synthetic; external traffic is blocked.
for (const viewport of [{ width: 1600, height: 1000 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
  test(`dashboard card opens only the displayed sales week at ${viewport.width}px`, async ({ browser }) => {
    test.setTimeout(120000);
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    let failed = false;
    let reportNow = "2026-09-15T18:00:00Z";
    const names = ["Avery Sample", "Jordan Example", "Morgan Preview"];
    const dates = ["2026-09-15T18:00:00Z", "2026-09-13T20:00:00Z", "2026-08-25T17:00:00Z"];
    const amounts = [4350.27, 725.55, 8100.10];
    const jobs = names.map((name, i) => ({ id: `weekly-job-${i}`, customer_name: name, status: "sold", source: "crm", created_at: dates[i], updated_at: dates[i], priority: "normal", estimated_total: amounts[i], deposit_paid: 0, meta: {} })) as CrmJob[];
    const quotes = jobs.map((job, i) => ({ id: `weekly-quote-${i}`, job_id: job.id, customer_name: names[i], quote_number: `DEMO-${i + 1}`, status: "sold", signed_at: dates[i], sold_at: dates[i], created_at: "2026-08-01T18:00:00Z", updated_at: dates[i], quote_total: amounts[i], materials_cost: 0, labor_cost: 0, discount: 0, tax: 0, deposit_required: 0, balance_due: amounts[i], meta: {} })) as CrmQuote[];
    const contracts = quotes.map((quote, i) => ({ id: `weekly-contract-${i}`, job_id: quote.job_id, quote_id: quote.id, customer_id: null, title: quote.quote_number!, created_at: dates[i], updated_at: dates[i], bookkeeping_entry_id: null, contract_url: null, share_token: null, status: "sold", signed_at: dates[i], total_amount: amounts[i], meta: { contract_snapshot: { schema: "805_signed_quote_contract_v1", signedAt: dates[i], totals: { total: amounts[i] } } } })) as CrmCustomerContract[];
    const user = { id: "10000000-0000-4000-8000-000000000099", aud: "authenticated", role: "authenticated", email: "805shutters@gmail.com", app_metadata: {}, user_metadata: {}, created_at: reportNow };
    const token = [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify({ sub: user.id, email: user.email, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 7200 })).toString("base64url"), "synthetic-signature"].join(".");
    await page.addInitScript(({ user, token }) => localStorage.setItem("sb-jobtracking-test-auth-token", JSON.stringify({ access_token: token, refresh_token: "synthetic-refresh", token_type: "bearer", expires_in: 7200, expires_at: Math.floor(Date.now() / 1000) + 7200, user })), { user, token });
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace(/\/$/, "");
      if (!["localhost", "127.0.0.1"].includes(url.hostname)) return url.hostname === "jobtracking-test.supabase.co" ? route.fulfill({ json: url.pathname.startsWith("/auth/") ? user : [] }) : route.abort();
      if (!path.startsWith("/api/")) return route.continue();
      if (path === "/api/crm/session") return route.fulfill({ json: { email: user.email, displayName: "Local verification" } });
      if (path === "/api/crm/jobs" && route.request().method() === "GET") {
        if (failed) return route.fulfill({ status: 503, json: { message: "Synthetic outage" } });
        const dashboard = buildDashboardData({ jobs, quotes, contracts, now: reportNow, events: [], customers: [], products: [], entries: [], payments: [], credits: [], expenses: [], installationInvoiceEmails: [], kenPayments: [], openingBalance: 0, payoffTarget: 500000 });
        return route.fulfill({ json: url.searchParams.get("scope") === "active" ? buildActiveJobsSnapshot(dashboard) : dashboard });
      }
      if (path === "/api/crm/activity") return route.fulfill({ json: { activityEvents: [], payments: [], signedContracts: [] } });
      return route.fulfill({ status: 503, json: { message: "Outside read-only fixture" } });
    });
    await page.clock.setFixedTime(new Date(reportNow));
    await page.goto("/crm/");
    if (viewport.width === 390) await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    const card = page.getByRole("button", { name: /Weekly gross sales status/ });
    const records = page.getByRole("listbox", { name: "Closed Sales records" });
    const select = page.locator(".crm-closed-sales-selector select");
    const close = page.getByRole("button", { name: "Close", exact: true });
    await expect(card).toContainText("Sep 14 – Sep 20, 2026");
    await card.click();
    await expect(select).toHaveValue("2026-09-14");
    await expect(records).toContainText("Avery Sample");
    await expect(records).not.toContainText("Jordan Example");
    await expect(records).not.toContainText("Morgan Preview");
    await expect(page.getByText("Workflow completion", { exact: true })).not.toBeVisible();
    await close.click();
    await page.getByRole("button", { name: "Previous sales week" }).click();
    await expect(card).toContainText("Sep 7 – Sep 13, 2026");
    await card.click();
    await expect(select).toHaveValue("2026-09-07");
    await expect(records).toContainText("Jordan Example");
    await expect(records).not.toContainText("Avery Sample");
    await expect(records).not.toContainText("Morgan Preview");
    await select.selectOption("2026-08-24");
    await expect(records).toContainText("Morgan Preview");
    await expect(records).not.toContainText("Jordan Example");
    await close.click();
    // Opening again must override a different week left selected in history.
    await card.click();
    await expect(select).toHaveValue("2026-09-07");
    await expect(records).toContainText("Jordan Example");
    await close.click();
    await page.getByRole("button", { name: "Previous sales week" }).click();
    await expect(card).toContainText("$0.00");
    await card.click();
    await expect(select).toHaveValue("2026-08-31");
    await expect(page.getByText("No verified signed sales for this week.", { exact: true })).toBeVisible();
    await expect(records).toHaveCount(0);
    await close.click();
    await page.getByRole("button", { name: "This week", exact: true }).click();
    await card.click();
    await expect(select).toHaveValue("2026-09-14");
    await expect(records).toContainText("Avery Sample");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect.poll(() => select.evaluate(el => {
      const bounds = el.getBoundingClientRect();
      return bounds.top >= 0 && bounds.bottom <= innerHeight;
    })).toBe(true);
    await page.screenshot({ path: `/tmp/805-week-filter-${viewport.width}.png` });
    expect(errors).toEqual([]);
    await context.close();
  });
}
