import { test, expect } from "@playwright/test";
const stamp = "2026-09-05T12:00:00Z";
test("filters, partial ordering, archive, persistence, and failures", async ({
  page,
}, info) => {
  const user = {
    id: "10000000-0000-4000-8000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "805shutters@gmail.com",
    app_metadata: {},
    user_metadata: {},
    created_at: stamp,
  };
  const access_token = [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
    Buffer.from(
      JSON.stringify({
        sub: user.id,
        email: user.email,
        exp: Math.floor(Date.now() / 1000) + 7200,
      }),
    ).toString("base64url"),
    "fake",
  ].join(".");
  await page.addInitScript(
    ({ user, access_token }) =>
      localStorage.setItem(
        "sb-jobtracking-test-auth-token",
        JSON.stringify({
          access_token,
          refresh_token: "fake",
          token_type: "bearer",
          expires_at: Math.floor(Date.now() / 1000) + 7200,
          user,
        }),
      ),
    { user, access_token },
  );
  const group = (key: string, label: string) => ({
    key,
    label,
    manufacturer: "Norman",
    openingCount: 3,
    lineIds: [key],
    ordered: false,
    orderedAt: null as string | null,
  });
  const forms: any[] = [
    {
      id: "mixed",
      status: "draft",
      meta: {},
      customer_snapshot: {
        name: "Taylor Example",
        address: "100 Example Lane",
        phone: "8055550100",
      },
      quote_snapshot: { quoteNumber: "TEST-001" },
      productOrders: {
        groups: [
          group("blinds", "Faux Wood Blinds"),
          group("shutters", "Shutters"),
        ],
        orderedCount: 0,
        totalCount: 2,
        label: "Not ordered",
        error: null,
      },
    },
    {
      id: "scheduled",
      status: "draft",
      meta: { measure_scheduling: { status: "scheduled" } },
      customer_snapshot: { name: "Scheduled Example" },
      quote_snapshot: {},
      productOrders: {
        groups: [group("roller", "Roller Shades")],
        orderedCount: 0,
        totalCount: 1,
        label: "Not ordered",
        error: null,
      },
    },
    {
      id: "measured",
      status: "submitted",
      meta: {},
      customer_snapshot: { name: "Measured Example" },
      quote_snapshot: {},
      productOrders: {
        groups: [group("roller", "Roller Shades")],
        orderedCount: 0,
        totalCount: 1,
        label: "Not ordered",
        error: null,
      },
    },
    {
      id: "archive",
      status: "submitted",
      meta: { archived_at: stamp },
      customer_snapshot: { name: "Archived Example" },
      quote_snapshot: {},
      productOrders: {
        groups: [],
        orderedCount: 0,
        totalCount: 0,
        label: "Not ordered",
        error: null,
      },
    },
  ];
  let fail = false,
    writes = 0;
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname.replace(/\/$/, "");
    if (!["127.0.0.1", "localhost"].includes(url.hostname))
      return url.hostname === "jobtracking-test.supabase.co"
        ? route.fulfill({ json: user })
        : route.abort();
    if (!path.startsWith("/api/")) return route.continue();
    if (path === "/api/crm/technical-measures")
      return route.fulfill({ json: { forms } });
    if (path.endsWith("/ordered")) {
      writes++;
      if (fail)
        return route.fulfill({
          status: 502,
          json: {
            message: "The order could not be saved. No changes were applied.",
          },
        });
      const form = forms.find((f) => f.id === path.split("/").at(-2));
      const g = form.productOrders.groups.find(
        (g: any) => g.key === route.request().postDataJSON().groupKey,
      );
      g.ordered = true;
      g.orderedAt = stamp;
      const n = form.productOrders.groups.filter((g: any) => g.ordered).length;
      form.productOrders.orderedCount = n;
      form.productOrders.label = `${n === form.productOrders.totalCount ? "Ordered" : "Partially ordered"} · ${n} of ${form.productOrders.totalCount}`;
      if (n === form.productOrders.totalCount) form.meta.archived_at = stamp;
      return route.fulfill({ json: { form } });
    }
    // Downloads are isolated too; no production form or customer action is called.
    return route.fulfill({
      json: { form: { ...forms[0], lines: [], futureMeasures: [] } },
    });
  });
  await page.goto("/crm/technical-measures/");
  const filters = page.getByRole("navigation", {
    name: "Measure status filters",
  });
  await expect(
    filters.getByRole("button", { name: "Need Measure 1", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Taylor Example", { exact: true })).toBeVisible();
  await page.screenshot({
    path: `test-results/measure-orders/${info.project.name}-queue.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const bounds = await page
    .getByRole("button", { name: "Mark Faux Wood Blinds ordered" })
    .boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(120);
  const labelBounds = await page
    .getByText("Faux Wood Blinds", { exact: true })
    .boundingBox();
  expect(labelBounds!.x + labelBounds!.width).toBeLessThanOrEqual(bounds!.x);
  await filters
    .getByRole("button", { name: "Scheduled 1", exact: true })
    .click();
  await expect(
    page.getByText("Scheduled Example", { exact: true }),
  ).toBeVisible();
  await filters
    .getByRole("button", { name: "Need Measure 1", exact: true })
    .click();
  fail = true;
  await page
    .getByRole("button", { name: "Mark Faux Wood Blinds ordered" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "No changes were applied" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mark Faux Wood Blinds ordered" }),
  ).toBeEnabled();
  fail = false;
  await page
    .getByRole("button", { name: "Mark Faux Wood Blinds ordered" })
    .click();
  await expect(
    filters.getByRole("button", { name: "Needs Order 2", exact: true }),
  ).toBeVisible();
  await filters
    .getByRole("button", { name: "Needs Order 2", exact: true })
    .click();
  await expect(
    page.getByText("Partially ordered · 1 of 2").first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    filters.getByRole("button", { name: "Needs Order 2", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Mark Shutters ordered" }).click();
  await expect(
    filters.getByRole("button", { name: "Archive 2", exact: true }),
  ).toBeVisible();
  await filters.getByRole("button", { name: "Archive 2", exact: true }).click();
  await expect(page.getByText("Taylor Example", { exact: true })).toBeVisible();
  await expect(page.getByText("Ordered · 2 of 2").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mark Shutters ordered" }),
  ).toHaveCount(0);
  await filters
    .getByRole("button", { name: "Needs Order 1", exact: true })
    .click();
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(
    page.getByRole("button", { name: "Mark Roller Shades ordered" }),
  ).toBeDisabled();
  expect(writes).toBe(3);
});
