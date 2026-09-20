import { test, expect, devices } from "@playwright/test";
import { buildActiveJobsSnapshot } from "../src/lib/crm/active-jobs";
import { buildDashboardData } from "../src/lib/crm/backend";
import type { CrmJob, CrmQuote, CrmCustomerContract } from "../src/lib/crm/types";

// All auth, CRM requests, and records are synthetic; external traffic is blocked.
for (const viewport of [{ width: 1600, height: 1000 }, { width: 820, height: 1180 }]) {
  test(`weekly sales navigation, detail, refresh and layout at ${viewport.width}px`, async ({ browser }) => {
    test.setTimeout(120000);
    const context = await browser.newContext(viewport.width === 820 ? { ...devices["iPad Mini"], viewport } : { viewport });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    let failed = false;
    let reportNow = "2026-09-15T18:00:00Z";
    const names = ["Avery Sample", "Jordan Example", "Morgan Preview"];
    const dates = ["2026-09-08T18:00:00Z", "2026-09-13T20:00:00Z", "2026-08-25T17:00:00Z"];
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
    await page.goto("/crm/");
    if (viewport.width === 820) {
      await expect(page).toHaveURL(/\/crm\/mobile\/quotes\//);
      await page.getByRole("link", { name: "All saved quotes" }).click();
    }
    const card = page.locator(".crm-closed-sales-card");
    await expect(card).toContainText("$5,075.82");
    await expect(card).toContainText("Mon, Sep 7–Sun, Sep 13, 2026");
    await card.locator(".crm-closed-sales-open").click();
    const records = page.getByRole("listbox", { name: "Closed Sales records" });
    await expect(records).toContainText("Avery Sample");
    await expect(records).toContainText("Jordan Example");
    await expect(records).toContainText("$4,350.27");
    await expect(records).toContainText("$725.55");
    await expect(records).toContainText("Signed");
    const select = page.locator(".crm-closed-sales-selector select");
    await select.selectOption("2026-08-31");
    await expect(card).toContainText("$0.00");
    await expect(page.getByText("No verified signed sales for this week.", { exact: true })).toBeVisible();
    await select.selectOption("2026-08-24");
    await expect(card).toContainText("$8,100.10");
    await expect(records).toContainText("Morgan Preview");
    await page.getByRole("button", { name: "Latest completed sales week" }).click();
    await expect(card).toContainText("$5,075.82");
    await card.scrollIntoViewIfNeeded();
    const bounds = await card.evaluate(el => ({ width: el.clientWidth, scrollWidth: el.scrollWidth }));
    expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.width);
    await page.screenshot({ path: `/tmp/805-weekly-sales-release-${viewport.width}.png`, fullPage: false });
    await page.locator(".crm-global-search-route-panel").getByRole("button", { name: "Customer File" }).click();
    await expect(page.locator(".crm-inline-drill-shell")).toHaveCount(0);
    failed = true;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(card).toContainText("Unavailable");
    await expect(card.locator(".crm-closed-sales-open")).toBeDisabled();
    failed = false;
    reportNow = "2026-09-21T07:00:00Z";
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(card).toContainText("Mon, Sep 14–Sun, Sep 20, 2026");
    await expect(card).toContainText("$0.00");
    expect(errors).toEqual([]);
    await context.close();
  });
}
