import { test, expect } from "@playwright/test";

test("Call Center badge, missed calls, shared customer message and resolution", async ({
  page,
}, testInfo) => {
  const user = {
    id: "00000000-0000-4000-8000-000000000001",
    email: "805shutters@gmail.com",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: user.id,
        email: user.email,
        role: "authenticated",
        aud: "authenticated",
        exp: expires,
      }),
    ).toString("base64url"),
    "fixture",
  ].join(".");
  await page.addInitScript(
    ({ token, user, expires }) => {
      localStorage.setItem(
        "sb-phone-test-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "fixture-refresh",
          token_type: "bearer",
          expires_at: expires,
          expires_in: 3600,
          user,
        }),
      );
    },
    { token, user, expires },
  );
  await page.route("https://phone-test.invalid/**", (route) =>
    route.fulfill({ json: user }),
  );
  const customer = {
    id: "00000000-0000-4000-8000-000000000010",
    display_name: "Test Customer",
    phone: "(805) 555-0100",
    meta: {},
  };
  const file = {
    id: customer.id,
    customer,
    customerName: "Test Customer",
    phone: customer.phone,
    email: null,
    address: null,
    city: "Ventura",
    latestStatus: "quoted",
    latestSoldDate: null,
    lifetimeValue: 0,
    openBalance: 0,
    jobs: [],
    quotes: [],
    bookkeepingRows: [],
    products: [],
    contracts: [],
    notes: [],
  };
  const snapshot = {
    actor: "mike",
    calls: [
      {
        id: "00000000-0000-4000-8000-000000000011",
        from: "+18055550100",
        phase: "ended",
        owner: null,
        held: false,
        revision: 3,
        createdAt: Date.now(),
        customerId: customer.id,
        customerName: "Test Customer",
      },
    ],
    messages: [] as Record<string, unknown>[],
    unresolvedCount: 0,
    unreadTextCount: 0,
    notifications: [] as Record<string, unknown>[],
    logs: [],
    readiness: {
      mode: "simulation",
      ready: false,
      missing: ["Dedicated Twilio number"],
    },
    attention: [],
  };
  const outsideList = testInfo.project.name === "mobile";
  await page.route("**/api/crm/**", async (route) => {
    const url = new URL(route.request().url());
    url.pathname = url.pathname.replace(/\/$/, "");
    if (url.pathname.endsWith("/session"))
      return route.fulfill({
        json: { email: user.email, displayName: "Mike" },
      });
    if (url.pathname.endsWith("/jobs"))
      return route.fulfill({
        json: {
          jobs: [],
          quotes: [],
          events: [],
          bookkeepingRows: [],
          customerFiles: outsideList ? [] : [file],
          accountability: [],
          summary: {},
          kenPayments: [],
          commissionPayments: [],
        },
      });
    if (url.pathname.endsWith(`/phone/customers/${customer.id}`))
      return route.fulfill({ json: customer });
    if (url.pathname.endsWith("/phone/state"))
      return route.fulfill({ json: snapshot });
    if (url.pathname.endsWith("/followup")) {
      const data = route.request().postDataJSON();
      snapshot.messages[0].status = data.status;
      snapshot.unresolvedCount = data.status === "resolved" ? 0 : 1;
      return route.fulfill({ json: snapshot.messages[0] });
    }
    return route.fulfill({ json: { updated: 0 } });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/crm/phone");
  const tab = page
    .getByRole("navigation", { name: "CRM sections" })
    .getByRole("button", { name: "Call Center", exact: true });
  await expect(
    page.getByRole("heading", { name: "Call Center", exact: true }),
  ).toBeVisible();
  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(tab).not.toHaveClass(/crm-call-center-unresolved/);
  await page.getByRole("button", { name: "Missed calls", exact: true }).click();
  await expect(page.getByText("Missed / no staff connection")).toBeVisible();
  await expect(page.getByText(/No message saved/)).toBeVisible();
  snapshot.messages = [
    {
      id: "00000000-0000-4000-8000-000000000012",
      callId: snapshot.calls[0].id,
      name: "Test Customer",
      callback: "+18055550100",
      text: "Please call me about my shutters.",
      status: "open",
      createdAt: Date.now(),
      customerId: customer.id,
      customerName: "Test Customer",
    },
  ];
  snapshot.unresolvedCount = 1;
  snapshot.notifications = [
    {
      id: "n1",
      messageId: snapshot.messages[0].id,
      recipient: "mike",
      status: "accepted",
    },
    {
      id: "n2",
      messageId: snapshot.messages[0].id,
      recipient: "jessica",
      status: "delivered",
    },
  ];
  await page.evaluate(() =>
    window.dispatchEvent(new Event("805-phone-updated")),
  );
  const redTab = page.getByRole("button", {
    name: "Call Center, 1 unresolved messages",
    exact: true,
  });
  await expect(redTab).toHaveClass(/crm-call-center-unresolved/);
  await expect(redTab.locator(".crm-call-center-count")).toHaveText("1");
  await page.getByRole("button", { name: /Messages \(1 open\)/ }).click();
  await expect(
    page.getByText("Please call me about my shutters."),
  ).toBeVisible();
  await expect(page.getByText("mike: accepted")).toBeVisible();
  await expect(page.getByText("jessica: delivered")).toBeVisible();
  await page.screenshot({
    path: `docs/phone-system/call-center-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Customer: Test Customer" }).click();
  await expect(
    page.getByText("Call Center messages", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Please call me about my shutters."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mark resolved", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Call Center", exact: true }),
  ).not.toHaveClass(/crm-call-center-unresolved/);
  await page
    .getByRole("button", { name: "Open Call Center", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reopen follow-up" }),
  ).toBeVisible();
  await expect(
    page.getByText("Please call me about my shutters."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Messages (0 open)" }),
  ).toBeVisible();
  snapshot.messages.push({
    id: "00000000-0000-4000-8000-000000000013",
    callId: snapshot.calls[0].id,
    kind: "sms",
    name: "Test Customer",
    callback: "+18055550100",
    text: "Here is my text reply.",
    status: "open",
    confirmed: true,
    createdAt: Date.now(),
  });
  snapshot.unreadTextCount = 1;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("Here is my text reply.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Messages (1 open)" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "CRM sections" })
      .getByRole("button", { name: "Call Center", exact: true }),
  ).not.toHaveClass(/crm-call-center-unresolved/);
  expect(errors).toEqual([]);
});
