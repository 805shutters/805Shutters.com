import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({ client: null as SupabaseClient | null }));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServiceClient: () => mocks.client,
}));

import { GET } from "./route";

const STORED = 4419.9;
const LIVE = 2209.95;

function database(balanceDue: number | null, error: string | null = null) {
  const row = {
    id: "4eb47cd0-0000-4000-8000-000000000001",
    quote_id: "10000000-0000-4000-8000-000000000002",
    job_id: "job-1",
    public_token: "secret",
    status: "sent",
    customer_snapshot: {
      name: "Sample Customer",
      address: "123 Main Street",
      phone: null,
      email: null,
      quoteNumber: "805-0264",
    },
    line_snapshot: [{
      id: "line-1",
      room: "Living Room",
      productName: "Plantation Shutter",
      styleName: "",
      options: [],
      quantity: 1,
      lineTotal: 1234.56,
    }],
    cod_original: STORED,
    cod_adjusted: 4000,
    cod_withheld: 419.9,
    issues: [],
    accepted: false,
    signer_name: null,
    signed_at: null,
    meta: {
      customer_balance: {
        schema: "805_installer_customer_balance_v1",
        contract_id: "contract-1",
        contract_total: STORED,
        recorded_payments_total: 0,
        payment_record_count: 0,
        credits_in_total: 0,
        credits_out_total: 0,
        remaining_customer_balance: STORED,
        contract_signed_at: "2026-07-30T12:00:00.000Z",
        calculated_at: "2026-07-30T13:00:00.000Z",
      },
    },
  };
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: row }),
  };
  return {
    from: () => query,
    rpc: vi.fn(async (name: string, args: { p_quote: string; p_entry: null }) => {
      expect(name).toBe("crm_customer_payment_totals");
      expect(args).toEqual({ p_quote: row.quote_id, p_entry: null });
      return error
        ? { data: null, error: { message: error } }
        : { data: { balanceDue }, error: null };
    }),
  } as unknown as SupabaseClient;
}

function request() {
  return GET(new NextRequest("http://localhost/api/installer-forms/secret"), {
    params: Promise.resolve({ token: "secret" }),
  });
}

describe("GET installer form", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("serves the live balanceDue and leaves collect-on-delivery fields off the response", async () => {
    mocks.client = database(LIVE);
    const response = await request();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.customer_balance).toBe(LIVE);
    expect(body.customer_snapshot.quoteNumber).toBe("805-0264");
    expect(body).not.toHaveProperty("cod_original");
    expect(body).not.toHaveProperty("cod_adjusted");
    expect(body).not.toHaveProperty("cod_withheld");
    expect(body.lines[0]).not.toHaveProperty("lineTotal");
    expect(JSON.stringify(body)).not.toContain("4419.9");
  });

  it("falls back to the stored balance when the live lookup fails", async () => {
    mocks.client = database(null, "totals unavailable");
    const response = await request();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.customer_balance).toBe(STORED);
    expect(body).not.toHaveProperty("cod_original");
    expect(body).not.toHaveProperty("cod_adjusted");
    expect(body).not.toHaveProperty("cod_withheld");
    expect(console.warn).toHaveBeenCalledWith(
      "installer form balance live lookup failed; using stored meta.customer_balance",
      expect.objectContaining({ error: "totals unavailable" }),
    );
  });
});
