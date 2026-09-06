import { test, expect, type Page } from "@playwright/test";
import { buildDashboardData } from "../src/lib/crm/backend";
import type { CrmJob } from "../src/lib/crm/types";

// Synthetic browser fixture: all API and external traffic is intercepted.
// Run against a local dev server with the jobtracking-test Supabase URL/key.
async function setup(page: Page) {
  const stamp = new Date(Date.now() - 86400000).toISOString();
  const jobs = ["Avery Morgan", "Avery Morgan", "Jordan Ellis"].map((name, index) => ({
    id: `opportunity-${index}`, customer_name: name, created_at: stamp, updated_at: stamp,
    source: "crm", lead_id: null, status: index === 2 ? "sold" : index === 0 ? "quoted" : "scheduled",
    priority: "normal", phone: index === 2 ? "8058060191" : "8058060190", email: null,
    address: null, city: null, product_interest: index === 1 ? "Consultation" : "Shutters",
    sales_owner: "Jessica", next_action: null, next_action_due: null,
    appointment_start: stamp, appointment_end: null, estimated_total: 0, deposit_paid: 0, notes: null,
  }) as CrmJob);
  const writes: string[] = [];
  const flags = { fail: false, hold: false, restoreFail: false };
  const user = { id: "10000000-0000-4000-8000-000000000099", aud: "authenticated", role: "authenticated", email: "805shutters@gmail.com", app_metadata: {}, user_metadata: {}, created_at: stamp };
  const token = [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify({ sub: user.id, email: user.email, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 7200 })).toString("base64url"), "synthetic-signature"].join(".");
  await page.addInitScript(({ user, token }) => {
    localStorage.setItem("sb-jobtracking-test-auth-token", JSON.stringify({ access_token: token, refresh_token: "synthetic-refresh", token_type: "bearer", expires_in: 7200, expires_at: Math.floor(Date.now() / 1000) + 7200, user }));
  }, { user, token });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/\/$/, "");
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
      if (url.hostname === "jobtracking-test.supabase.co") return route.fulfill({ json: user });
      return route.abort();
    }
    if (!path.startsWith("/api/")) return route.continue();
    if (path === "/api/crm/session") return route.fulfill({ json: { email: user.email, displayName: "Local verification" } });
    if (path === "/api/crm/jobs/deleted" && route.request().method() === "GET") {
      return route.fulfill({ json: { jobs: jobs.filter((job) => job.meta?.deleted_at).map((job) => ({ id: job.id, customer_name: job.customer_name, product_interest: job.product_interest, deleted_at: job.meta!.deleted_at })) } });
    }
    if (path.endsWith("/restore") && route.request().method() === "POST") {
      if (flags.restoreFail) return route.fulfill({ status: 409, json: { message: "Opportunity changed. Refresh and try again." } });
      const job = jobs.find((item) => path === `/api/crm/jobs/${item.id}/restore`);
      if (!job) return route.fulfill({ status: 404, json: { message: "Unknown fixture" } });
      expect(route.request().postDataJSON()).toEqual({ deleted_at: job.meta!.deleted_at });
      job.meta = {};
      return route.fulfill({ json: { id: job.id } });
    }
    if (path === "/api/crm/jobs" && route.request().method() === "GET") {
      return route.fulfill({ json: buildDashboardData({ jobs: jobs.filter((job) => !job.meta?.deleted_at), quotes: [], events: [], customers: [], products: [], contracts: [], expenses: [], payments: [], credits: [], entries: [], installationInvoiceEmails: [], kenPayments: [], openingBalance: 0, payoffTarget: 500000 }) });
    }
    if (route.request().method() === "DELETE") {
      writes.push(path);
      while (flags.hold) await new Promise((resolve) => setTimeout(resolve, 30));
      if (flags.fail) return route.fulfill({ status: 409, json: { message: "This job has a sold quote in the bookkeeping ledger." } });
      const job = jobs.find((item) => path === `/api/crm/jobs/${item.id}`);
      if (!job) return route.fulfill({ status: 404, json: { message: "Unknown fixture" } });
      job.meta = { deleted_at: new Date().toISOString() };
      return route.fulfill({ json: { id: job.id } });
    }
    return route.fulfill({ status: 503, json: { message: "Outside the local fixture." } });
  });
  await page.goto("/crm/");
  await page.getByRole("button", { name: /30-Day Customer Conversion/ }).click();
  const view = page.locator("#crm-close-rate-drilldown");
  await expect(view.getByRole("heading", { name: "Unsold", exact: true })).toBeVisible();
  return { writes, flags, view };
}

test("cancel, delete just one opportunity, refresh counts, then empty the unsold group", async ({ page }) => {
  const { view, writes, flags } = await setup(page);
  const unsold = view.locator(".crm-close-rate-group--unsold");
  const sold = view.locator(".crm-close-rate-group--sold");
  await expect(sold.getByRole("button", { name: /Delete/ })).toHaveCount(0);
  await expect(unsold.getByRole("button", { name: /Delete/ })).toHaveCount(2);
  page.once("dialog", async (dialog) => { expect(dialog.message()).toContain("Avery Morgan"); expect(dialog.message()).toContain("Shutters"); await dialog.dismiss(); });
  await unsold.getByRole("button", { name: /Delete.*Shutters/ }).click();
  expect(writes).toEqual([]);
  flags.hold = true;
  page.once("dialog", (dialog) => dialog.accept());
  await unsold.getByRole("button", { name: /Delete.*Shutters/ }).click();
  await expect(unsold.getByRole("button", { name: /Delete.*Consultation/ })).toBeDisabled();
  flags.hold = false;
  await expect(unsold.getByRole("button", { name: /Delete/ })).toHaveCount(1);
  expect(writes).toEqual(["/api/crm/jobs/opportunity-0"]);
  await expect(unsold).toContainText("1 job in period");
  await expect(sold).toContainText("Jordan Ellis");
  page.once("dialog", (dialog) => dialog.accept());
  await unsold.getByRole("button", { name: /Delete.*Consultation/ }).click();
  await expect(unsold).toContainText("No unsold jobs are included in this period.");
  await expect(view).toContainText("1 included customer: 1 sold and 0 unsold.");
});

test("a rejected removal keeps the row visible and allows retry", async ({ page }) => {
  const { view, flags, writes } = await setup(page);
  flags.fail = true;
  page.once("dialog", (dialog) => dialog.accept());
  await view.getByRole("button", { name: /Delete.*Shutters/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "This job has a sold quote" })).toBeVisible();
  await expect(view.getByRole("button", { name: /Delete/ })).toHaveCount(2);
  await expect(view.getByRole("button", { name: /Delete.*Shutters/ })).toBeEnabled();
  expect(writes).toHaveLength(1);
});

test("recently deleted restores the selected opportunity and handles a failed restore", async ({ page }) => {
  const { view, flags } = await setup(page);
  page.once("dialog", (dialog) => dialog.accept());
  await view.getByRole("button", { name: /Delete.*Shutters/ }).click();
  await expect(view.getByRole("button", { name: /Delete/ })).toHaveCount(1);
  await view.getByRole("button", { name: "Recently deleted", exact: true }).click();
  const recovery = view.getByRole("region", { name: "Recently deleted opportunities" });
  const restore = recovery.getByRole("button", { name: "Restore Shutters for Avery Morgan" });
  await expect(restore).toBeVisible();
  await page.screenshot({ path: "reports/screenshots/close-rate-restore-1440.png" });
  await page.setViewportSize({ width: 375, height: 1000 });
  await restore.scrollIntoViewIfNeeded();
  const restoreBox = await restore.boundingBox();
  expect(restoreBox!.x + restoreBox!.width).toBeLessThanOrEqual(375);
  await page.screenshot({ path: "reports/screenshots/close-rate-restore-375.png" });
  flags.restoreFail = true;
  await restore.click();
  await expect(recovery.getByRole("alert")).toContainText("Opportunity changed");
  await expect(restore).toBeEnabled();
  flags.restoreFail = false;
  await restore.click();
  await expect(recovery).toContainText("No recently deleted opportunities.");
  await expect(view.getByRole("button", { name: /Delete/ })).toHaveCount(2);
  await expect(page.getByRole("status").filter({ hasText: "Opportunity restored." })).toBeVisible();
});

for (const width of [1440, 820, 375]) {
  test(`deletion controls fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const { view } = await setup(page);
    const button = view.getByRole("button", { name: /Delete.*Shutters/ });
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `reports/screenshots/close-rate-delete-${width}.png` });
  });
}
