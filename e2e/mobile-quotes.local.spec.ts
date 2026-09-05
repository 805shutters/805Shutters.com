import { test, expect, type Page } from "@playwright/test";
import type { PublicQuote } from "../src/lib/crm/public-quote";
import type { MobileQuoteCustomer } from "../src/lib/crm/mobile-quotes";

// Synthetic, isolated tests. No request may reach a customer/provider/database.
// Start a local app with NEXT_PUBLIC_SUPABASE_URL=https://jobtracking-test.supabase.co
// and NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-test-anon-key, then run this spec only:
// E2E_BASE_URL=http://localhost:3118 npx playwright test e2e/mobile-quotes.local.spec.ts
const stamp = "2026-09-01T12:00:00Z";
function documentFixture(id: string, signed = false): PublicQuote {
  return {
    id,
    token: "",
    quoteNumber: `805-${id}`,
    customerName: "Jamie Sample",
    customerAddress: "100 Example Lane, Ventura",
    customerPhone: "8055550100",
    customerEmail: "sample@example.com",
    status: signed ? "sold" : "draft",
    signed,
    signedAt: signed ? stamp : null,
    lines: [
      {
        id: "line-1",
        room: "Living Room",
        productName: "Roller Shades",
        styleName: "Cordless",
        width: "36",
        height: "60",
        quantity: 1,
        unitPrice: 400,
        lineTotal: 400,
        discountPercent: 0,
        options: [
          "Color: White",
          "Inside mount",
          "Width: 36 in",
          "Height: 60 in",
        ],
        designOptions: [],
        priceReady: true,
      },
    ],
    subtotal: 400,
    fees: [],
    discount: 0,
    tax: 0,
    sourceTotalAdjustment: 0,
    depositDue: 200,
    balanceDue: 200,
    total: 400,
    allPriced: true,
    hasOnyxShutters: false,
    adjustments: {
      discountPercent: 0,
      taxPercent: 0,
      depositPercent: 50,
      extraFees: [],
    },
    payment: { available: false, reason: "test" },
    business: {
      name: "805 Shutters",
      email: "805@805shutters.com",
      phone: "805-806-9344",
      website: "805shutters.com",
    },
    versions: [],
  } as unknown as PublicQuote;
}
const contract = (id: string, status = "draft") => ({
  id,
  number: `805-${id}`,
  label: id === "two" ? "Option B" : null,
  status,
  createdAt: stamp,
  signedAt: status === "sold" ? stamp : null,
  signedBy: status === "sold" ? "Jamie Sample" : null,
});
const customers: MobileQuoteCustomer[] = [
  {
    id: "a",
    name: "Jamie Sample",
    address: "100 Example Lane, Ventura",
    contracts: [
      contract("one"),
      contract("two", "sold"),
      contract("old", "archived"),
    ],
  },
  {
    id: "b",
    name: "Jamie Sample",
    address: "900 Different Road, Oxnard",
    contracts: [contract("single", "sent")],
  },
];
async function setup(page: Page, workspace: "quotes" | "contracts" = "quotes") {
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const flags = {
    signed: false,
    rejectTotal: true,
    failDocument: false,
    expired: false,
    slowSearch: false,
    incomplete: false,
    missingContact: false,
    failSearch: false,
    paginate: false,
    total: 400,
  };
  const user = {
    id: "10000000-0000-4000-8000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "805shutters@gmail.com",
    app_metadata: {},
    user_metadata: {},
    created_at: stamp,
  };
  const accessToken = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
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
    ({ user, accessToken }) =>
      localStorage.setItem(
        "sb-jobtracking-test-auth-token",
        JSON.stringify({
          access_token: accessToken,
          refresh_token: "fake",
          token_type: "bearer",
          expires_in: 7200,
          expires_at: Math.floor(Date.now() / 1000) + 7200,
          user,
        }),
      ),
    { user, accessToken },
  );
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname.replace(/\/$/, "");
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
      if (url.hostname === "jobtracking-test.supabase.co")
        return route.fulfill({ json: user });
      return route.abort();
    }
    if (!path.startsWith("/api/")) return route.continue();
    if (path === "/api/crm/session")
      return route.fulfill({
        json: { email: user.email, displayName: "Local test" },
      });
    if (path === "/api/crm/mobile/quotes") {
      if (flags.expired)
        return route.fulfill({
          status: 401,
          json: { message: "Login expired" },
        });
      if (flags.failSearch)
        return route.fulfill({
          status: 502,
          json: { message: "Search temporarily unavailable" },
        });
      const q = url.searchParams.get("q") || "";
      if (flags.slowSearch && q === "jam")
        await new Promise((resolve) => setTimeout(resolve, 600));
      return route.fulfill({
        json: {
          results:
            q === "none"
              ? []
              : q === "single"
                ? [customers[1]]
                : flags.paginate
                  ? url.searchParams.get("offset")
                    ? [customers[1]]
                    : [customers[0]]
                  : customers,
          nextOffset:
            flags.paginate && !url.searchParams.get("offset") ? 30 : null,
        },
      });
    }
    if (path.endsWith("/document")) {
      if (flags.failDocument)
        return route.fulfill({
          status: 502,
          json: { message: "Contract temporarily unavailable" },
        });
      const id = path.split("/").at(-2)!;
      return route.fulfill({
        json: {
          quote: {
            ...documentFixture(id, id === "two" || flags.signed),
            ...(id === "old" ? { status: "archived" } : {}),
            ...(flags.incomplete ? { allPriced: false } : {}),
            ...(flags.missingContact
              ? { customerPhone: null, customerEmail: null }
              : {}),
            total: flags.total,
            subtotal: flags.total,
            depositDue: flags.total / 2,
            balanceDue: flags.total / 2,
            lines: documentFixture(id).lines.map((line) => ({
              ...line,
              unitPrice: flags.total,
              lineTotal: flags.total,
            })),
          },
        },
      });
    }
    if (route.request().method() !== "GET") {
      writes.push({ path, body: route.request().postDataJSON() || {} });
      if (path.endsWith("/share"))
        return route.fulfill({
          json: { token: "synthetic-sign", url: "/quote/synthetic-sign" },
        });
      if (path.endsWith("/send"))
        return route.fulfill({
          json: {
            sms: { sent: true },
            email: { sent: false, error: "Mailbox rejected" },
            status: "sent",
          },
        });
      if (path.endsWith("/accept")) {
        if (flags.rejectTotal) {
          flags.total = 450;
          return route.fulfill({
            status: 409,
            json: {
              message:
                "The contract total changed. Review the updated contract before signing.",
            },
          });
        }
        flags.signed = true;
        return route.fulfill({ json: { ok: true } });
      }
    }
    return route.fulfill({
      status: 400,
      json: { message: `Unexpected test request: ${path}` },
    });
  });
  await page.goto(`/crm/mobile/${workspace}/`, { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: workspace === "contracts" ? "Contracts" : "Quotes", exact: true }),
  ).toBeVisible();
  return { writes, flags };
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
]) {
  test(`search, status selection, document, send and sign at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const { writes, flags } = await setup(page);
    await page.getByRole("searchbox").fill("jam");
    await expect(
      page.getByRole("button", { name: /Draft.*805-one/ }),
    ).toBeVisible();
    await expect(page.getByText("900 Different Road, Oxnard")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Archived.*805-old/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `reports/mobile-qa/mobile-quotes/search-${viewport.width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: /Draft.*805-one/ }).click();
    await expect(
      page.getByText("Living Room", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Contract copy", { exact: true }),
    ).toBeVisible();
    expect(writes).toHaveLength(0);
    await expect(
      page.getByRole("button", { name: "New Quote", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("img", { name: "805 Shutters" })
      .evaluate((img: HTMLImageElement) => img.decode());
    await page.screenshot({
      path: `reports/mobile-qa/mobile-quotes/contract-${viewport.width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.getByLabel("Both", { exact: true }).check();
    await expect(
      page.getByText("sample@example.com", { exact: true }).first(),
    ).toBeVisible();
    await page.screenshot({
      path: `reports/mobile-qa/mobile-quotes/send-${viewport.width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Send contract", exact: true })
      .click();
    await expect(
      page.getByText("Email: Mailbox rejected", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Text: accepted for sending. Delivery is not yet confirmed.",
      ),
    ).toBeVisible();
    expect(writes.filter((write) => write.path.endsWith("/send"))).toEqual([
      {
        path: "/api/crm/quotes/one/send",
        body: {
          channels: { email: true, sms: true },
          expectedRecipients: {
            email: "sample@example.com",
            sms: "8055550100",
          },
        },
      },
    ]);
    await page
      .getByRole("button", { name: "Back to contract", exact: true })
      .click();
    await page.getByRole("button", { name: "Sign", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Sign & approve", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Sign & approve", exact: true })
      .click();
    await expect(
      page.getByText("Please check the authorization box to continue."),
    ).toBeVisible();
    await page.getByRole("checkbox").check();
    await page.screenshot({
      path: `reports/mobile-qa/mobile-quotes/sign-${viewport.width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Sign & approve", exact: true })
      .click();
    await expect(
      page.getByText(
        "The contract total changed. Review the updated contract before signing.",
      ),
    ).toBeVisible();
    expect(
      writes.find((write) => write.path.endsWith("/accept"))?.body
        .acknowledgedTotal,
    ).toBe(400);
    await expect(
      page.getByRole("button", { name: "Sign & approve", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("$450.00", { exact: true }).first(),
    ).toBeVisible();
    flags.rejectTotal = false;
    await page.getByRole("button", { name: "Sign", exact: true }).click();
    await expect(page.getByRole("checkbox")).not.toBeChecked();
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Sign & approve", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Signed", exact: true }),
    ).toBeDisabled();
    await expect(page.getByText("Contract signed successfully.")).toBeVisible();
    expect(
      writes
        .filter((write) => write.path.endsWith("/accept"))
        .map((write) => write.body.acknowledgedTotal),
    ).toEqual([400, 450]);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByRole("searchbox")).toHaveValue("jam");
    await page.getByRole("button", { name: /Sold · Signed.*805-two/ }).click();
    await expect(
      page.getByRole("button", { name: "Signed", exact: true }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test("single contract, alphabet, errors, stale searches and expired sessions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { writes, flags } = await setup(page);
  await page.getByRole("button", { name: "J", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Draft.*805-one/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "J", exact: true }).click();
  await page.getByRole("searchbox").fill("single");
  await page
    .getByRole("button", { name: /Jamie Sample.*900 Different Road/ })
    .click();
  await expect(
    page.getByText("Living Room", { exact: true }).first(),
  ).toBeVisible();
  expect(writes).toHaveLength(0);
  await page.goBack();
  await expect(page.getByRole("searchbox")).toHaveValue("single");
  flags.failDocument = true;
  await page
    .getByRole("button", { name: /Jamie Sample.*900 Different Road/ })
    .click();
  await expect(
    page.getByText("Contract temporarily unavailable"),
  ).toBeVisible();
  flags.failDocument = false;
  await page
    .getByRole("button", { name: "Retry contract", exact: true })
    .click();
  await expect(
    page.getByText("Living Room", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  flags.slowSearch = true;
  await page.getByRole("searchbox").fill("jam");
  await page.waitForTimeout(300);
  await page.getByRole("searchbox").fill("none");
  await expect(
    page.getByText("No customers with contracts matched this search."),
  ).toBeVisible();
  await page.waitForTimeout(700);
  await expect(
    page.getByRole("button", { name: /Draft.*805-one/ }),
  ).toHaveCount(0);
  flags.expired = true;
  await page.getByRole("searchbox").fill("expire");
  await expect(
    page.getByRole("heading", { name: "Quote login." }),
  ).toBeVisible();
});

test("pagination, search retry, incomplete and archived documents, missing recipients, keyboard", async ({
  page,
}) => {
  const { writes, flags } = await setup(page);
  flags.paginate = true;
  await page.getByRole("searchbox").fill("jam");
  await page.getByRole("button", { name: "Load more customers" }).click();
  await expect(page.getByText("900 Different Road, Oxnard")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Load more customers" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Archived.*805-old/ }).click();
  await expect(
    page.getByText(/This archived contract is available to view and send/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("searchbox")).toBeFocused();
  flags.incomplete = true;
  await page.getByRole("button", { name: /Draft.*805-one/ }).click();
  await expect(page.getByText(/This contract is incomplete/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  flags.incomplete = false;
  flags.missingContact = true;
  await page.getByRole("button", { name: /Draft.*805-one/ }).click();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("No email available")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send contract", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Back to contract", exact: true })
    .click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  flags.failSearch = true;
  await page.getByRole("searchbox").fill("retry");
  await expect(page.getByText("Search temporarily unavailable")).toBeVisible();
  flags.failSearch = false;
  await page.getByRole("button", { name: "Retry search", exact: true }).click();
  const draft = page.getByRole("button", { name: /Draft.*805-one/ });
  await expect(draft).toBeVisible();
  await draft.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Jamie Sample", exact: true }),
  ).toBeFocused();
  expect(writes).toHaveLength(0);
});

for (const width of [390, 820]) {
  test(`Contracts tab uses customer search and contract actions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1180 });
    const { writes } = await setup(page, "contracts");
    await page.getByRole("searchbox").fill("jam");
    await expect(page.getByRole("button", { name: /Draft.*805-one/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Archived.*805-old/ })).toBeVisible();
    await page.getByRole("button", { name: /Draft.*805-one/ }).click();
    await expect(page.getByText("Living Room", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Sign", exact: true })).toBeEnabled();
    expect(writes).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `reports/mobile-qa/mobile-quotes/contracts-tab-${width}.png` });
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Contracts", exact: true })).toBeVisible();
    await expect(page.getByRole("searchbox")).toHaveValue("jam");
  });
}
