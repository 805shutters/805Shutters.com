import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { InstallerFormClient } from "@/app/installer-form/[token]/InstallerFormClient";
import {
  balanceDueFromPaymentTotals,
  resolveInstallerFormBalanceDue,
  storedInstallerCustomerBalanceAmount,
} from "./installer-balance";
import {
  buildInstallerFormPdf,
  calculateInstallerCod,
  loadInstallerFormByToken,
  renderInstallerFormEmail,
  renderInstallerFormPdf,
  type InstallerFormRow,
} from "./installer-forms";

const STORED = 4419.9;
const LIVE = 2209.95;

function form(): InstallerFormRow {
  return {
    id: "4eb47cd0-0000-4000-8000-000000000001",
    quote_id: "10000000-0000-4000-8000-000000000002",
    job_id: "job-1",
    public_token: "secret",
    status: "sent",
    customer_snapshot: {
      name: "Sample Customer",
      address: "123 Main Street",
      phone: "805-555-0101",
      email: "sample@example.com",
      quoteNumber: "805-0264",
    },
    line_snapshot: [{
      id: "line-1",
      room: "Living Room",
      productName: "Plantation Shutter",
      styleName: "Woodlore",
      options: ["Color: Silk White"],
      quantity: 1,
      lineTotal: 1234.56,
    }],
    cod_original: STORED,
    cod_adjusted: STORED,
    cod_withheld: 12.5,
    issues: [],
    accepted: false,
    signer_name: null,
    signed_at: null,
    meta: {
      schema: "805_installer_form_v1",
      workflow: { outcome: "completed", reasonCode: "", notes: "Leave the note", revision: 2, updatedAt: null },
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
}

function client(rpc: SupabaseClient["rpc"]): SupabaseClient {
  const row = form();
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: row }),
  };
  return { from: () => query, rpc } as unknown as SupabaseClient;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("live installer form balance", () => {
  it("reads balanceDue from crm_customer_payment_totals for the form, PDF, and email packet", async () => {
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe("crm_customer_payment_totals");
      expect(args).toEqual({ p_quote: form().quote_id, p_entry: null });
      return { data: { balanceDue: LIVE, total: STORED, received: LIVE }, error: null };
    });
    const db = client(rpc as unknown as SupabaseClient["rpc"]);
    const row = form();
    const loaded = await loadInstallerFormByToken(db, "secret");
    const pdf = (await renderInstallerFormPdf(db, row, "https://805shutters.com/installer-form/secret")).toString("latin1");
    const email = await renderInstallerFormEmail(db, row, "https://805shutters.com/installer-form/secret");
    const markup = renderToStaticMarkup(createElement(InstallerFormClient, { form: loaded! }));

    expect(loaded?.customer_balance).toBe(LIVE);
    expect(pdf).toContain("REMAINING CUSTOMER BALANCE: $2,209.95");
    expect(pdf).not.toContain("REMAINING CUSTOMER BALANCE: $4,419.90");
    expect(email.text).toContain("Remaining customer balance: $2,209.95");
    expect(markup).toContain("Remaining customer balance");
    expect(markup).toContain("$2,209.95");
    expect(markup).not.toContain("$4,419.90");
    expect(row.cod_original).toBe(STORED);
    expect(row.cod_adjusted).toBe(STORED);
    expect(row.cod_withheld).toBe(12.5);
  });

  it("falls back to the stored balance and logs when the live lookup fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const db = client((async () => ({ data: null, error: { message: "totals unavailable" } })) as unknown as SupabaseClient["rpc"]);
    const row = form();
    const loaded = await loadInstallerFormByToken(db, "secret");
    const pdf = (await renderInstallerFormPdf(db, row, "https://805shutters.com/installer-form/secret")).toString("latin1");

    expect(loaded?.customer_balance).toBe(STORED);
    expect(pdf).toContain("REMAINING CUSTOMER BALANCE: $4,419.90");
    expect(warn).toHaveBeenCalledWith(
      "installer form balance live lookup failed; using stored meta.customer_balance",
      expect.objectContaining({ formId: row.id, quoteId: row.quote_id, error: "totals unavailable" }),
    );
    expect(row.cod_original).toBe(STORED);
    expect(row.cod_adjusted).toBe(STORED);
    expect(row.cod_withheld).toBe(12.5);
  });

  it("keeps collect-on-delivery fields off the public form and unchanged by the balance read", async () => {
    const db = client((async () => ({ data: { balanceDue: LIVE }, error: null })) as unknown as SupabaseClient["rpc"]);
    const loaded = await loadInstallerFormByToken(db, "secret");
    const markup = renderToStaticMarkup(createElement(InstallerFormClient, { form: loaded! }));

    expect(loaded).not.toHaveProperty("cod_original");
    expect(loaded).not.toHaveProperty("cod_adjusted");
    expect(loaded).not.toHaveProperty("cod_withheld");
    expect(markup).not.toContain("cod_original");
    expect(markup).not.toContain("cod_adjusted");
    expect(markup).not.toContain("cod_withheld");
    expect(calculateInstallerCod(1800, [{ id: "a", lineTotal: 1000 }], [{ lineId: "a", notInstalled: true }]))
      .toEqual({ withheld: 500, adjusted: 1300 });
    expect(buildInstallerFormPdf(form(), "https://805shutters.com/installer-form/secret").toString("latin1"))
      .toContain("REMAINING CUSTOMER BALANCE: $4,419.90");
  });

  it("parses a live balanceDue and the stored remaining amount", () => {
    expect(balanceDueFromPaymentTotals({ balanceDue: "2209.95" })).toBe(LIVE);
    expect(balanceDueFromPaymentTotals({ total: 1 })).toBeNull();
    expect(storedInstallerCustomerBalanceAmount(form())).toBe(STORED);
    expect(resolveInstallerFormBalanceDue).toBeTypeOf("function");
  });
});
