import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CrmAuthError } from "@/lib/crm/auth";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
}));

vi.mock("@/lib/crm/sales-quote-v2-send", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/lib/crm/sales-quote-v2-send")
  >();
  return {
    ...original,
    prepareV2CustomerSendPayloadFromDatabase: mocks.prepare,
  };
});

import {
  assertV2CustomerPayloadHasNoProtectedFields,
  assertV2CustomerSendPersistenceRuntimeEnabled,
  parseSalesQuoteV2CustomerSendBody,
  persistSalesQuoteV2CustomerSend,
} from "./sales-quote-v2-send-persist";

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const LINE_ID = "22222222-2222-4222-8222-222222222222";
const DESIGN_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR_ID = "44444444-4444-4444-8444-444444444444";
const SEND_SNAPSHOT_ID = "55555555-5555-4555-8555-555555555555";
const CRM_QUOTE_ID = "66666666-6666-4666-8666-666666666666";
const CATALOG = "norman-roller-minmax-2026-08-01";

const customerPayload = {
  backend: "authoritative_v2" as const,
  total: 358,
  lines: [
    {
      lineItemId: LINE_ID,
      selectedDesignId: DESIGN_ID,
      selectedVariant: "A",
      room: "Living Room",
      productType: "Roller Shades",
      widthInches: 36,
      heightInches: 60,
      quantity: 1,
      price: {
        productId: "roller",
        programId: "roller_cordless_fabric_price_group_2_pg2",
        programName: "Cordless Fabric - Price Group 2",
        matchedWidth: 36,
        matchedHeight: 60,
        base: 328,
        surchargeLines: [
          { id: "fabric", label: "Fabric upgrade", amount: 30 },
        ],
        unitPrice: 358,
        discountPercent: 0,
        discountAmount: 0,
        quantity: 1,
        onceTotal: 0,
        total: 358,
      },
    },
  ],
};

function quote(overrides: Record<string, unknown> = {}) {
  return {
    id: QUOTE_ID,
    status: "draft",
    total_amount: 358,
    quote_v2_backend: true,
    quote_v2_status: "priced",
    quote_v2_catalog_version: CATALOG,
    quote_v2_revision: 7,
    ...overrides,
  };
}

function rpcResult(overrides: Record<string, unknown> = {}) {
  return {
    send_snapshot_id: SEND_SNAPSHOT_ID,
    quote_id: QUOTE_ID,
    crm_quote_id: CRM_QUOTE_ID,
    previous_revision: 7,
    new_revision: 8,
    catalog_version: CATALOG,
    quote_total: 358,
    persisted_sent_at: "2026-07-22T20:00:00.000Z",
    persisted_sent_via: "email",
    customer_payload: customerPayload,
    ...overrides,
  };
}

function fakeSupabase(
  storedQuote: Record<string, unknown>,
  response: { data: unknown; error: unknown } = {
    data: [rpcResult()],
    error: null,
  },
) {
  const selects: string[] = [];
  const rpc = vi.fn(async () => response);
  const client = {
    from(table: string) {
      expect(table).toBe("sales_quotes");
      const query = {
        select(columns: string) {
          selects.push(columns);
          return query;
        },
        eq() {
          return query;
        },
        async maybeSingle() {
          return { data: storedQuote, error: null };
        },
      };
      return query;
    },
    rpc,
  };
  return {
    client: client as unknown as SupabaseClient,
    rpc,
    selects,
  };
}

beforeEach(() => {
  mocks.prepare.mockReset();
  mocks.prepare.mockResolvedValue(customerPayload);
  delete process.env.QUOTE_V2_CUSTOMER_SEND_PERSISTENCE;
});

afterEach(() => {
  delete process.env.QUOTE_V2_CUSTOMER_SEND_PERSISTENCE;
});

describe("V2 customer-send persistence body and runtime gate", () => {
  it("accepts only concurrency, idempotency, and channel intent", () => {
    expect(
      parseSalesQuoteV2CustomerSendBody({
        expectedRevision: 7,
        idempotencyKey: "v2-send:test-0001",
        sentVia: "both",
      }),
    ).toEqual({
      expectedRevision: 7,
      idempotencyKey: "v2-send:test-0001",
      sentVia: "both",
    });

    for (const forbidden of [
      "customerPayload",
      "catalogVersion",
      "selectionFingerprint",
      "retailTotal",
      "dealerCost",
      "internalCost",
      "margin",
      "contacts",
    ]) {
      expect(() =>
        parseSalesQuoteV2CustomerSendBody({
          expectedRevision: 7,
          idempotencyKey: "v2-send:test-0001",
          sentVia: "email",
          [forbidden]: {},
        }),
      ).toThrow(`does not accept client-supplied field: ${forbidden}`);
    }
  });

  it("stays disabled unless the deliberate post-migration cutover value is exact", () => {
    for (const value of [undefined, "true", "1", "enabled"]) {
      if (value === undefined) {
        delete process.env.QUOTE_V2_CUSTOMER_SEND_PERSISTENCE;
      } else {
        process.env.QUOTE_V2_CUSTOMER_SEND_PERSISTENCE = value;
      }
      expect(() =>
        assertV2CustomerSendPersistenceRuntimeEnabled(),
      ).toThrow("implemented but disabled");
    }
    process.env.QUOTE_V2_CUSTOMER_SEND_PERSISTENCE =
      "enabled-after-v2-send-migration";
    expect(() => assertV2CustomerSendPersistenceRuntimeEnabled()).not.toThrow();
  });

  it("rejects protected fields recursively", () => {
    for (const value of [
      { dealerCost: 10 },
      { lines: [{ price: { internal_cost: 10 } }] },
      { lines: [{ price: { landedCostTotal: 10 } }] },
      { lines: [{ price: { margin: 0.4 } }] },
      { lines: [{ price: { options_json: { secret: true } } }] },
    ]) {
      expect(() =>
        assertV2CustomerPayloadHasNoProtectedFields(value),
      ).toThrow("protected field");
    }
    expect(() =>
      assertV2CustomerPayloadHasNoProtectedFields(customerPayload),
    ).not.toThrow();
  });
});

describe("persistSalesQuoteV2CustomerSend", () => {
  it("revalidates on the server and sends only the customer allow-list to one RPC", async () => {
    const { client, rpc, selects } = fakeSupabase(quote());
    const result = await persistSalesQuoteV2CustomerSend(client, {
      quoteId: QUOTE_ID,
      expectedRevision: 7,
      idempotencyKey: "v2-send:test-0001",
      actorId: ACTOR_ID,
      sentVia: "email",
    });

    expect(mocks.prepare).toHaveBeenCalledWith(client, quote());
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("persist_quote_v2_customer_send", {
      p_quote_id: QUOTE_ID,
      p_expected_revision: 7,
      p_expected_catalog_version: CATALOG,
      p_idempotency_key: "v2-send:test-0001",
      p_actor_id: ACTOR_ID,
      p_sent_via: "email",
      p_customer_payload: customerPayload,
    });
    expect(selects).toEqual([
      "id,status,total_amount,quote_v2_backend,quote_v2_status,quote_v2_catalog_version,quote_v2_revision",
    ]);
    expect(selects[0]).not.toMatch(/cost|profit|margin|wholesale|manufacturer/i);

    const serializedRpc = JSON.stringify(
      (rpc.mock.calls[0] as unknown as [string, Record<string, unknown>])?.[1],
    );
    expect(serializedRpc).not.toMatch(
      /dealer.?cost|freight.?cost|internal.?cost|landed.?cost|wholesale|margin|markup|multiplier|options.?json/i,
    );
    expect(result).toEqual({
      backend: "authoritative_v2",
      quoteId: QUOTE_ID,
      sendSnapshotId: SEND_SNAPSHOT_ID,
      crmQuoteId: CRM_QUOTE_ID,
      previousRevision: 7,
      revision: 8,
      catalogVersion: CATALOG,
      total: 358,
      sentAt: "2026-07-22T20:00:00.000Z",
      sentVia: "email",
      customerPayload,
    });
  });

  it("uses the RPC's immutable idempotent result after the source quote is sent", async () => {
    const { client, rpc } = fakeSupabase(
      quote({ status: "sent", quote_v2_status: "sent", quote_v2_revision: 8 }),
    );
    const result = await persistSalesQuoteV2CustomerSend(client, {
      quoteId: QUOTE_ID,
      expectedRevision: 7,
      idempotencyKey: "v2-send:test-0001",
      actorId: ACTOR_ID,
      sentVia: "email",
    });

    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "persist_quote_v2_customer_send",
      expect.objectContaining({ p_customer_payload: null }),
    );
    expect(result.customerPayload).toEqual(customerPayload);
  });

  it("rejects lifecycle, revision, and catalog drift before persistence", async () => {
    for (const stored of [
      quote({ quote_v2_backend: false }),
      quote({ quote_v2_status: "stale" }),
      quote({ quote_v2_revision: 8 }),
      quote({ status: "sold" }),
      quote({ quote_v2_catalog_version: null }),
    ]) {
      const { client, rpc } = fakeSupabase(stored);
      await expect(
        persistSalesQuoteV2CustomerSend(client, {
          quoteId: QUOTE_ID,
          expectedRevision: 7,
          idempotencyKey: "v2-send:test-0001",
          actorId: ACTOR_ID,
          sentVia: "email",
        }),
      ).rejects.toBeInstanceOf(CrmAuthError);
      expect(rpc).not.toHaveBeenCalled();
    }
  });

  it("maps database drift and authorization failures without exposing details", async () => {
    const conflict = fakeSupabase(quote(), {
      data: null,
      error: { code: "40001", message: "snapshot drift secret detail" },
    });
    await expect(
      persistSalesQuoteV2CustomerSend(conflict.client, {
        quoteId: QUOTE_ID,
        expectedRevision: 7,
        idempotencyKey: "v2-send:test-0001",
        actorId: ACTOR_ID,
        sentVia: "email",
      }),
    ).rejects.toMatchObject({ status: 409 });

    const forbidden = fakeSupabase(quote(), {
      data: null,
      error: { code: "42501", message: "actor secret detail" },
    });
    await expect(
      persistSalesQuoteV2CustomerSend(forbidden.client, {
        quoteId: QUOTE_ID,
        expectedRevision: 7,
        idempotencyKey: "v2-send:test-0002",
        actorId: ACTOR_ID,
        sentVia: "email",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects protected fields, retail drift, revision drift, and catalog drift in the RPC result", async () => {
    const badRows = [
      rpcResult({
        customer_payload: {
          ...customerPayload,
          internalCost: { landedCostTotal: 100 },
        },
      }),
      rpcResult({
        customer_payload: { ...customerPayload, total: 359 },
        quote_total: 359,
      }),
      rpcResult({ new_revision: 9 }),
      rpcResult({ catalog_version: "attacker-catalog" }),
    ];

    for (const row of badRows) {
      const { client } = fakeSupabase(quote(), { data: [row], error: null });
      await expect(
        persistSalesQuoteV2CustomerSend(client, {
          quoteId: QUOTE_ID,
          expectedRevision: 7,
          idempotencyKey: "v2-send:test-0001",
          actorId: ACTOR_ID,
          sentVia: "email",
        }),
      ).rejects.toBeInstanceOf(CrmAuthError);
    }
  });
});
