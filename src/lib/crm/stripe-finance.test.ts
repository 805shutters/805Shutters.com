import { beforeEach, expect, it, vi } from "vitest";
import { syncStripeFinance, storeStripeObject } from "./stripe-finance";
import { stripeRequest, verifyStripeAccount } from "@/lib/finance/stripe";
import { synchronizeStripeRequest } from "./stripe-collection";
vi.mock("@/lib/finance/stripe", async () => ({
  ...(await vi.importActual("@/lib/finance/stripe")),
  stripeRequest: vi.fn(),
  verifyStripeAccount: vi.fn(),
}));
vi.mock("./stripe-collection", () => ({ synchronizeStripeRequest: vi.fn() }));
const config = {
  account: "acct_fixture",
  livemode: false,
  key: "fixture",
  environment: "test" as const,
};
function database(
  state: Record<string, unknown> = {},
  rows: Record<string, any[]> = {},
) {
  const tables: Record<string, any[]> = {
    crm_stripe_sync: [{ account_id: config.account, livemode: false, state }],
    crm_stripe_requests: [],
    crm_stripe_objects: [],
    crm_stripe_events: [],
    ...rows,
  };
  const updates: any[] = [];
  const db: any = {
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    from: (table: string) => {
      let filters: ((r: any) => boolean)[] = [],
        operation = "select",
        value: any,
        max = Infinity,
        single = false;
      const q: any = {
        select: () => q,
        eq: (k: string, v: unknown) => {
          filters.push((r) => r[k] === v || k === "lease_id");
          return q;
        },
        gt: (k: string, v: any) => {
          filters.push((r) => r[k] > v);
          return q;
        },
        not: (k: string, _: unknown, v: unknown) => {
          filters.push((r) => r[k] !== v);
          return q;
        },
        is: (k: string, v: unknown) => {
          filters.push((r) => r[k] === v);
          return q;
        },
        order: () => q,
        limit: (n: number) => {
          max = n;
          return q;
        },
        single: () => {
          single = true;
          return q;
        },
        maybeSingle: () => {
          single = true;
          return q;
        },
        update: (v: any) => {
          operation = "update";
          value = v;
          return q;
        },
        upsert: (v: any) => {
          operation = "upsert";
          value = v;
          return q;
        },
        then: (resolve: any) => {
          let result = (tables[table] || [])
            .filter((r) => filters.every((f) => f(r)))
            .slice(0, max);
          if (operation === "update") {
            updates.push({ table, value: structuredClone(value) });
            result.forEach((r) => Object.assign(r, structuredClone(value)));
          }
          if (operation === "upsert") {
            const all = (tables[table] ||= []);
            const old = all.find(
              (r) => r.id === value.id && r.kind === value.kind,
            );
            if (old) Object.assign(old, value);
            else all.push(value);
          }
          return Promise.resolve({
            data: single ? result[0] || null : result,
            error: null,
          }).then(resolve);
        },
      };
      return q;
    },
  };
  return { db, tables, updates };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyStripeAccount).mockResolvedValue(config);
  vi.mocked(stripeRequest).mockResolvedValue({ data: [], has_more: false });
  vi.mocked(synchronizeStripeRequest).mockResolvedValue({} as never);
});
it("checkpoints every phase and rotates after a partial page instead of starving later evidence", async () => {
  const f = database(
    { phase: "requests" },
    {
      crm_stripe_requests: Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        account_id: config.account,
        livemode: false,
        session_id: `cs_${i}`,
      })),
    },
  );
  const result = await syncStripeFinance(f.db);
  expect(result.status).toBe("partial");
  expect(synchronizeStripeRequest).toHaveBeenCalledTimes(10);
  expect(vi.mocked(stripeRequest).mock.calls.map(([url]) => url)).toContain(
    "/v1/payouts?limit=25",
  );
  expect(f.updates.filter((u) => u.value.state).length).toBe(8);
  expect(f.tables.crm_stripe_sync[0].state.requestAfter).toBe("9");
  expect(f.tables.crm_stripe_sync[0].lease_id).toBe(null);
});
it("leaves a mismatched notification for review while processing a later authoritative payout", async () => {
  const e = (id: string) => ({
    account_id: config.account,
    livemode: false,
    id,
    event_type: "payout.paid",
    object_id: "po_one",
    processed_at: null,
  });
  const f = database(
    { phase: "events" },
    { crm_stripe_events: [e("evt_bad"), e("evt_good")] },
  );
  vi.mocked(stripeRequest).mockImplementation(async (url) => {
    if (url === "/v1/events/evt_bad")
      return {
        id: "evt_wrong",
        livemode: false,
        type: "payout.paid",
        data: { object: { id: "po_one" } },
      };
    if (url === "/v1/events/evt_good")
      return {
        id: "evt_good",
        livemode: false,
        type: "payout.paid",
        data: { object: { id: "po_one" } },
      };
    if (url === "/v1/payouts/po_one")
      return {
        id: "po_one",
        livemode: false,
        status: "paid",
        currency: "usd",
        amount: 9700,
        created: 1700000000,
      };
    return { data: [], has_more: false };
  });
  expect((await syncStripeFinance(f.db)).status).toBe("needs_review");
  expect(f.tables.crm_stripe_events[0].processed_at).toBe(null);
  expect(f.tables.crm_stripe_events[1].processed_at).toBeTruthy();
  expect(f.tables.crm_stripe_objects[0].id).toBe("po_one");
});
it("preserves payout membership across a global refresh and rejects mixed modes", async () => {
  const f = database(
    {},
    {
      crm_stripe_objects: [
        {
          account_id: config.account,
          livemode: false,
          kind: "balance_transaction",
          id: "txn_one",
          payout_id: "po_one",
          details: {},
        },
      ],
    },
  );
  await storeStripeObject(f.db, config, "balance_transaction", {
    id: "txn_one",
    amount: 10000,
    fee: 300,
    net: 9700,
    currency: "usd",
    created: 1700000000,
  });
  expect(f.tables.crm_stripe_objects[0].payout_id).toBe("po_one");
  await expect(
    storeStripeObject(f.db, config, "payout", {
      id: "po_wrong",
      livemode: true,
    }),
  ).rejects.toThrow("mode mismatch");
});
it("keeps a composition mismatch visible instead of declaring a payout reconciled", async () => {
  const f = database(
    { phase: "composition" },
    {
      crm_stripe_objects: [
        {
          account_id: config.account,
          livemode: false,
          kind: "payout",
          id: "po_one",
          status: "paid",
          amount_cents: 9700,
          details: { automatic: true },
        },
      ],
    },
  );
  vi.mocked(stripeRequest).mockImplementation(async (url) =>
    url.includes("payout=po_one")
      ? {
          data: [
            {
              id: "txn_one",
              amount: 9000,
              fee: 300,
              net: 8700,
              currency: "usd",
              created: 1700000000,
            },
          ],
          has_more: false,
        }
      : { data: [], has_more: false },
  );
  expect((await syncStripeFinance(f.db)).status).toBe("needs_review");
  expect(f.tables.crm_stripe_objects[0].details.composition_complete).toBe(
    false,
  );
});
it("does no provider recovery when another worker owns the lease", async () => {
  const f = database();
  f.db.rpc.mockResolvedValue({ data: false, error: null });
  expect((await syncStripeFinance(f.db)).status).toBe("busy");
  expect(stripeRequest).not.toHaveBeenCalled();
});

it("retains a failed phase cursor and still recovers independent evidence", async () => {
  const f = database({ phase: "payment", payment: "pi_previous" });
  vi.mocked(stripeRequest).mockImplementation(async (url) => {
    if (url.startsWith("/v1/payment_intents"))
      throw new Error("provider unavailable");
    return { data: [], has_more: false };
  });
  const result = await syncStripeFinance(f.db);
  expect(result.status).toBe("needs_review");
  expect(f.tables.crm_stripe_sync[0].state.payment).toBe("pi_previous");
  expect(vi.mocked(stripeRequest).mock.calls.map(([url]) => url)).toContain(
    "/v1/payouts?limit=25",
  );
  expect(f.tables.crm_stripe_sync[0].lease_id).toBe(null);
});
