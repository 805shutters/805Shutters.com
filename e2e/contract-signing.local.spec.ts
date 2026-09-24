import { expect, test } from "@playwright/test";
const url = "http://127.0.0.1:4288/e2e/fixtures/contract-signing.html";
for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1440, height: 900 }]) {
  test.describe(`${viewport.width}px customer signing`, () => {
    test.use({ viewport });
    test("requires consent, freezes pending form, suppresses double submit, confirms signature", async ({ page }) => {
      let calls = 0;
      let release!: () => void;
      await page.route("**/api/quote/*/accept", async route => {
        calls++; await new Promise<void>(resolve => { release = resolve; });
        expect(route.request().postDataJSON()).toMatchObject({ printedName: "Synthetic Customer", signature: "Synthetic Customer", acknowledgedTotal: 900 });
        await route.fulfill({ json: { ok: true, alreadySigned: false } });
      });
      await page.goto(url);
      await page.getByRole("button", { name: "Sign & approve" }).click();
      await expect(page.getByRole("alert")).toContainText("authorization");
      expect(calls).toBe(0);
      await page.getByRole("checkbox", { name: /reviewed my contract/ }).check();
      await page.getByRole("button", { name: "Sign & approve" }).dblclick();
      await expect.poll(() => calls).toBe(1);
      await expect(page.getByLabel("Full name (your signature)")).toBeDisabled();
      await expect(page.getByRole("radio", { name: "Some", exact: true })).toBeDisabled();
      release();
      await expect(page.getByRole("heading", { name: "Your contract is signed." })).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign & approve" })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `output/signing-audit/signed-${viewport.width}.png`, fullPage: true });
    });
    test("retains consent/name on failed connection, allows retry and confirms dropped successful response", async ({ page }) => {
      let posts = 0;
      await page.route("**/api/quote/*/accept", async route => {
        if (route.request().method() === "POST") { posts++; await route.abort("failed"); }
        else await route.fulfill({ json: posts > 1 ? { signed: true, signedAt: "2026-09-24T01:00:00Z" } : { signed: false, signedAt: null } });
      });
      await page.goto(url);
      await page.getByRole("checkbox", { name: /reviewed my contract/ }).check();
      await page.getByRole("button", { name: "Sign & approve" }).click();
      await expect(page.getByRole("alert")).toContainText("couldn't confirm");
      await expect(page.getByLabel("Full name (your signature)")).toHaveValue("Synthetic Customer");
      await expect(page.getByRole("checkbox", { name: /reviewed my contract/ })).toBeChecked();
      await page.getByRole("button", { name: "Sign & approve" }).click();
      await expect(page.getByRole("heading", { name: "Your contract is signed." })).toBeVisible();
    });
    test("blocks unverified subset prices and discards a late response after choosing all", async ({ page }) => {
      let release!: () => void;
      let started = false;
      await page.route("**/api/quote/*/total", async route => {
        started = true; await new Promise<void>(resolve => { release = resolve; });
        await route.fulfill({ json: { subtotal:450,fees:0,discount:0,tax:0,total:450,depositDue:225,balanceDue:225,payment:{available:true,dueType:'deposit',amountDue:225,outstanding:450,depositPaid:0,paidTotal:0} } }).catch(() => {});
      });
      await page.goto(url);
      await page.getByRole("radio", { name: "Some", exact: true }).check();
      await page.getByRole("checkbox", { name: "Select item 1: Kitchen" }).check();
      await expect(page.getByRole("button", { name: "Sign & approve" })).toBeDisabled();
      await expect.poll(() => started).toBe(true);
      await page.getByRole("radio", { name: "All", exact: true }).check();
      release();
      await expect(page.getByRole("button", { name: "Sign & approve" })).toBeEnabled();
      await expect(page.getByText("$900.00", { exact: true }).last()).toBeVisible();
      await page.getByRole("checkbox", { name: /reviewed my contract/ }).check();
      await page.getByRole("radio", { name: "Some", exact: true }).check();
      await expect(page.getByText("Select at least one item below before signing.")).toBeVisible();
    });
    test("recovers failed total lookup and asks consent for the revised selection", async ({ page }) => {
      let lookups = 0;
      await page.route("**/api/quote/*/total", route => {
        lookups++;
        return route.fulfill(lookups === 1 ? { status: 503, json: { message: "unavailable" } } : {
          json: {subtotal:450,fees:0,discount:0,tax:0,total:450,depositDue:225,balanceDue:225,payment:{available:true,dueType:'deposit',amountDue:225,outstanding:450,depositPaid:0,paidTotal:0}},
        });
      });
      await page.goto(url);
      await page.getByRole("checkbox", { name: /reviewed my contract/ }).check();
      await page.getByRole("radio", { name: "Some", exact: true }).check();
      await page.getByRole("checkbox", { name: "Select item 1: Kitchen" }).check();
      await expect(page.getByRole("alert")).toContainText("verify the total");
      await expect(page.getByRole("button", { name: "Sign & approve" })).toBeDisabled();
      await page.getByRole("button", { name: "Try updating total again" }).click();
      await expect(page.getByRole("button", { name: "Sign & approve" })).toBeEnabled();
      await expect(page.getByRole("checkbox", { name: /reviewed my contract/ })).not.toBeChecked();
      await page.screenshot({ path: `output/signing-audit/selection-${viewport.width}.png`, fullPage: true });
    });
  });
}
