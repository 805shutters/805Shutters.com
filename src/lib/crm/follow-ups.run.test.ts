import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmBookkeepingEntry, CrmQuote } from "@/lib/crm/types";
import { sendEmail } from "@/lib/notify/email";
import { sendSms } from "@/lib/notify/twilio";
import { OVERDUE_ALERT_RECIPIENT, OverdueAlertsSendError, runOverdueAlerts } from "./follow-ups";

vi.mock("@/lib/notify/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/notify/twilio", () => ({ sendSms: vi.fn() }));

const NOW = new Date("2026-11-15T07:30:00.000Z");
const SOLD = "2026-10-01T00:00:00.000Z";
const CUSTOMER_EMAIL = "ada@customer.test";
const CUSTOMER_PHONE = "+18055550111";
const OTHER_EMAIL = "grace@customer.test";
const OTHER_PHONE = "+18055550122";

function quote(overrides: Partial<CrmQuote> = {}): CrmQuote {
  return {
    id: "quote-ada",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    job_id: "job-ada",
    quote_number: "Q-1001",
    status: "sold",
    quote_total: 1000,
    materials_cost: 0,
    labor_cost: 0,
    discount: 0,
    tax: 0,
    deposit_required: 250,
    balance_due: 750,
    sold_by: null,
    sent_at: null,
    approved_at: null,
    sold_at: SOLD,
    ordered_at: null,
    received_at: null,
    installed_at: null,
    archived_at: null,
    share_token: null,
    customer_signature: null,
    customer_printed_name: null,
    signed_at: null,
    quote_group_id: null,
    quote_label: null,
    meta: { region: "sb" },
    manufacturer_name: null,
    manufacturer_order_ref: null,
    manufacturer_order_url: null,
    manufacturer_document_url: null,
    customer_email: CUSTOMER_EMAIL,
    customer_phone: CUSTOMER_PHONE,
    customer_address: "123 Secret St",
    notes: null,
    customer_name: "Ada Lovelace",
    ...overrides,
  };
}

function entry(overrides: Partial<CrmBookkeepingEntry> = {}): CrmBookkeepingEntry {
  return {
    id: "entry-grace",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    quote_id: "quote-grace",
    job_id: "job-grace",
    source: "crm_quote",
    customer_name: "Grace Hopper",
    sold_date: SOLD,
    total_amount: 900,
    payment_type: null,
    cogs_amount: 0,
    sales_owner: null,
    sales_owner_auth_user_id: null,
    sales_owner_set_at: null,
    installation_invoice_document_id: null,
    installation_invoice_amount: 0,
    installation_invoice_number: null,
    installation_invoice_url: null,
    installation_invoice_paid_at: null,
    installation_invoice_paid_amount: 0,
    installation_invoice_payment_method: null,
    installation_invoice_payment_notes: null,
    installation_match_status: "unmatched",
    installation_matched_at: null,
    jessica_commission_paid_at: null,
    manufacturer_name: null,
    manufacturer_order_ref: null,
    manufacturer_order_url: null,
    manufacturer_document_url: null,
    notes: null,
    imported_sheet_row: null,
    ken_cut_override: null,
    meta: { kept: "yes" },
    ...overrides,
  };
}

function createDb(
  seed: { quotes?: CrmQuote[]; entries?: CrmBookkeepingEntry[] } = {},
  options: { updateError?: string; insertError?: string } = {},
) {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    crm_quotes: [...(seed.quotes ?? [])],
    crm_quote_bookkeeping_entries: [...(seed.entries ?? [])],
    crm_quote_bookkeeping_payments: [],
    crm_activity_events: [],
  };
  const updates: Array<{ table: string; id: string; values: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];
  const client = {
    from(table: string) {
      return {
        select: async () => ({ data: tables[table] ?? [], error: null }),
        update(values: Record<string, unknown>) {
          return {
            eq: async (_column: string, id: string) => {
              updates.push({ table, id, values });
              if (options.updateError) return { error: { message: options.updateError } };
              const row = (tables[table] ?? []).find((item) => item.id === id);
              if (row) Object.assign(row, values);
              return { error: null };
            },
          };
        },
        insert: async (values: Record<string, unknown>) => {
          inserts.push({ table, values });
          if (options.insertError) return { error: { message: options.insertError } };
          (tables[table] ?? []).push(values);
          return { error: null };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, updates, inserts, tables };
}

function emailPayload() {
  expect(sendEmail).toHaveBeenCalledTimes(1);
  return vi.mocked(sendEmail).mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RESEND_FROM", "805 Shutters <805@805shutters.com>");
  vi.mocked(sendEmail).mockResolvedValue({ sent: true, id: "re_123" });
});

describe("runOverdueAlerts", () => {
  it("sends one internal digest and never texts", async () => {
    const ada = quote();
    const grace = quote({
      id: "quote-grace",
      job_id: "job-grace",
      quote_number: "Q-1002",
      status: "installed",
      quote_total: 900,
      deposit_required: 0,
      balance_due: 900,
      customer_name: "Grace Hopper",
      customer_email: OTHER_EMAIL,
      customer_phone: OTHER_PHONE,
      meta: {},
    });
    const graceEntry = entry();
    const db = createDb({ quotes: [ada, grace], entries: [graceEntry] });

    const result = await runOverdueAlerts(db.client, NOW);

    expect(OVERDUE_ALERT_RECIPIENT).toBe("wcbot+805@mail.grokbot.com");
    expect(result).toEqual({ alerted: 2, emailed: 1, resendId: "re_123" });
    expect(sendSms).not.toHaveBeenCalled();
    const payload = emailPayload();
    expect(payload.to).toBe("wcbot+805@mail.grokbot.com");
    expect(payload.cc).toBeUndefined();
    expect(payload.from).toBe("805 Shutters <805@805shutters.com>");
    expect(payload.idempotencyKey).toBe("overdue-alerts-2026-11-14");
    const body = `${payload.subject}\n${payload.text}\n${payload.html}`;
    expect(body).toContain("Ada Lovelace");
    expect(body).toContain("Q-1001");
    expect(body).toContain("deposit");
    expect(body).toContain("$250.00");
    expect(body).toContain(SOLD);
    expect(body).toContain("Grace Hopper");
    expect(body).toContain("Q-1002");
    expect(body).toContain("balance");
    expect(body).toContain("$900.00");
    expect(body).not.toContain(CUSTOMER_EMAIL);
    expect(body).not.toContain(CUSTOMER_PHONE);
    expect(body).not.toContain(OTHER_EMAIL);
    expect(body).not.toContain(OTHER_PHONE);
    expect(body).not.toContain("123 Secret St");
    expect(db.inserts).toEqual([
      {
        table: "crm_activity_events",
        values: {
          entity_type: "system",
          action: "overdue-alerts.sent",
          metadata: {
            count: 2,
            quoteIds: ["quote-ada", "quote-grace"],
            resendId: "re_123",
          },
        },
      },
    ]);
    expect(ada.meta).toMatchObject({ region: "sb", lastOverdueAlertedAt: NOW.toISOString() });
    expect(grace.meta).toEqual({});
    expect(graceEntry.meta).toMatchObject({ kept: "yes", lastAlertedAt: NOW.toISOString() });
  });

  it("stamps nothing and records the failure when the email is not sent", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ sent: false, error: "mailbox down" });
    const ada = quote();
    const db = createDb({ quotes: [ada] });

    await expect(runOverdueAlerts(db.client, NOW)).rejects.toMatchObject({
      status: 502,
      body: { alerted: 0, emailed: 0, resendId: null },
    });
    expect(sendSms).not.toHaveBeenCalled();
    expect(db.updates).toEqual([]);
    expect(ada.meta).toEqual({ region: "sb" });
    expect(db.inserts).toEqual([
      {
        table: "crm_activity_events",
        values: {
          entity_type: "system",
          action: "overdue-alerts.failed",
          metadata: { count: 1, quoteIds: ["quote-ada"], error: "mailbox down" },
        },
      },
    ]);
    await expect(runOverdueAlerts(db.client, NOW)).rejects.toBeInstanceOf(OverdueAlertsSendError);
  });

  it("does not record a sent event when a stamp update fails", async () => {
    const ada = quote();
    const db = createDb({ quotes: [ada] }, { updateError: "update failed" });

    await expect(runOverdueAlerts(db.client, NOW)).rejects.toThrow("update failed");
    expect(db.inserts).toEqual([]);
    expect(ada.meta).toEqual({ region: "sb" });
  });

  it("respects the cooldown stored on a quote that has no bookkeeping entry", async () => {
    const recent = quote({ meta: { lastOverdueAlertedAt: "2026-11-14T00:00:00.000Z" } });
    const recentDb = createDb({ quotes: [recent] });
    await expect(runOverdueAlerts(recentDb.client, NOW)).resolves.toEqual({ alerted: 0, emailed: 0, resendId: null });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(recentDb.updates).toEqual([]);

    const expired = quote({ meta: { lastOverdueAlertedAt: "2026-11-01T00:00:00.000Z" } });
    const expiredDb = createDb({ quotes: [expired] });
    await expect(runOverdueAlerts(expiredDb.client, NOW)).resolves.toMatchObject({ alerted: 1, emailed: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("sends nothing on a second run inside the cooldown", async () => {
    const ada = quote();
    const db = createDb({ quotes: [ada] });

    await expect(runOverdueAlerts(db.client, NOW)).resolves.toMatchObject({ alerted: 1, emailed: 1 });
    vi.mocked(sendEmail).mockClear();
    const nextDay = new Date("2026-11-16T07:30:00.000Z");

    await expect(runOverdueAlerts(db.client, nextDay)).resolves.toEqual({ alerted: 0, emailed: 0, resendId: null });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendSms).not.toHaveBeenCalled();
  });

  it("returns alerted 0 and sends nothing when no row is overdue", async () => {
    const fresh = quote({ sold_at: "2026-11-14T00:00:00.000Z" });
    const db = createDb({ quotes: [fresh] });

    await expect(runOverdueAlerts(db.client, NOW)).resolves.toEqual({ alerted: 0, emailed: 0, resendId: null });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendSms).not.toHaveBeenCalled();
    expect(db.inserts).toEqual([]);
    expect(db.updates).toEqual([]);
  });
});
