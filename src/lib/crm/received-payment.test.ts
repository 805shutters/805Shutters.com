import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { insertReceivedPayment } from "./received-payment";

const requestId = "aaaaaaaa-1111-4111-8111-111111111111";
const quoteId = "bbbbbbbb-2222-4222-8222-222222222222";
const jobId = "cccccccc-3333-4333-8333-333333333333";
const entryId = "dddddddd-4444-4444-8444-444444444444";
const payment = {
  quote_id: quoteId, job_id: jobId, payment_label: "Deposit payment", payment_type: "check",
  amount: 750.25, paid_at: "2026-09-03", notes: "Check 123", source: "crm_quote", meta: { createdBy: "805@805shutters.com" }
};

function database(options: { errorCode?: string; missingDuplicate?: boolean; lookupError?: boolean; failAfterInsertOnce?: boolean } = {}) {
  const records = new Map<string, Record<string, unknown>>();
  const inserts: Record<string, unknown>[] = [];
  const reads: string[] = [];
  let failurePending = options.failAfterInsertOnce;
  const from = vi.fn((table: string) => {
    expect(table).toBe("crm_quote_bookkeeping_payments");
    return {
      insert: async (record: Record<string, unknown>) => {
        inserts.push(record);
        if (options.errorCode) return { error: { code: options.errorCode, message: "Insert failed" } };
        const id = typeof record.id === "string" ? record.id : `generated-${inserts.length}`;
        if (records.has(id) || options.missingDuplicate) return { error: { code: "23505", message: "Duplicate key" } };
        records.set(id, { quote_id: null, job_id: null, bookkeeping_entry_id: null, ...record });
        if (failurePending) {
          failurePending = false;
          return { error: { code: "503", message: "Response lost after insert" } };
        }
        return { error: null };
      },
      select: () => ({
        eq: (key: string, id: string) => {
          expect(key).toBe("id");
          reads.push(id);
          return { maybeSingle: async () => ({ data: records.get(id) || null, error: options.lookupError ? { message: "Lookup unavailable" } : null }) };
        }
      })
    };
  });
  return { client: { from } as unknown as SupabaseClient, records, inserts, reads, from };
}

describe("retry-safe received payment records", () => {
  it("uses the stable request UUID as the payment primary key", async () => {
    const db = database();
    expect(await insertReceivedPayment(db.client, payment, requestId)).toEqual({ reused: false });
    expect(db.records.get(requestId)).toMatchObject({ ...payment, id: requestId });
    expect(db.reads).toHaveLength(0);
  });

  it("acknowledges identical retries without recording another payment", async () => {
    const db = database();
    await insertReceivedPayment(db.client, payment, requestId);
    expect(await insertReceivedPayment(db.client, payment, requestId)).toEqual({ reused: true });
    expect(db.records.size).toBe(1);
    expect(db.reads).toEqual([requestId]);
  });

  it("deduplicates simultaneous requests at the primary-key boundary", async () => {
    const db = database();
    const results = await Promise.all([insertReceivedPayment(db.client, payment, requestId), insertReceivedPayment(db.client, payment, requestId)]);
    expect(results).toEqual([{ reused: false }, { reused: true }]);
    expect(db.records.size).toBe(1);
  });

  it("safely retries when the first response was lost after the payment was stored", async () => {
    const db = database({ failAfterInsertOnce: true });
    await expect(insertReceivedPayment(db.client, payment, requestId)).rejects.toMatchObject({ status: 502 });
    expect(db.records.size).toBe(1);
    expect(await insertReceivedPayment(db.client, payment, requestId)).toEqual({ reused: true });
    expect(db.records.size).toBe(1);
  });

  it("supports standalone bookkeeping-entry payments", async () => {
    const db = database();
    const entryPayment = { ...payment, quote_id: null, job_id: null, bookkeeping_entry_id: entryId, source: "manual" };
    await insertReceivedPayment(db.client, entryPayment, requestId);
    expect(await insertReceivedPayment(db.client, entryPayment, requestId)).toEqual({ reused: true });
    expect(db.records.size).toBe(1);
  });

  it("compares numeric database amounts and equivalent database date values", async () => {
    const db = database();
    const isoPayment = { ...payment, paid_at: "2026-09-03T12:00:00Z" };
    await insertReceivedPayment(db.client, isoPayment, requestId);
    Object.assign(db.records.get(requestId)!, { amount: "750.25", paid_at: "2026-09-03" });
    expect(await insertReceivedPayment(db.client, isoPayment, requestId)).toEqual({ reused: true });
  });

  it.each([
    { quote_id: entryId }, { job_id: entryId }, { bookkeeping_entry_id: entryId },
    { amount: 750.26 }, { payment_label: "Balance payment" }, { payment_type: "cash" },
    { paid_at: "2026-09-04" }, { notes: "Different check" }, { source: "manual" }
  ])("rejects request-ID reuse for different receipt details: %j", async (changed) => {
    const db = database();
    await insertReceivedPayment(db.client, payment, requestId);
    await expect(insertReceivedPayment(db.client, { ...payment, ...changed }, requestId)).rejects.toMatchObject({ status: 409 });
    expect(db.records.size).toBe(1);
    expect(db.records.get(requestId)).toMatchObject(payment);
  });

  it.each([null, "", "not-a-uuid", 7, {}])("rejects invalid request IDs before inserting: %j", async (invalid) => {
    const db = database();
    await expect(insertReceivedPayment(db.client, payment, invalid)).rejects.toMatchObject({ status: 400 });
    expect(db.from).not.toHaveBeenCalled();
  });

  it("normalizes the request UUID without changing payment metadata", async () => {
    const db = database();
    await insertReceivedPayment(db.client, payment, ` ${requestId.toUpperCase()} `);
    expect(db.records.has(requestId)).toBe(true);
    expect(db.records.get(requestId)?.meta).toEqual(payment.meta);
  });

  it("recognizes case-equivalent UUID target links returned canonically by the database", async () => {
    const db = database();
    await insertReceivedPayment(db.client, payment, requestId);
    expect(await insertReceivedPayment(db.client, { ...payment, quote_id: quoteId.toUpperCase(), job_id: jobId.toUpperCase() }, requestId)).toEqual({ reused: true });
    expect(db.records.size).toBe(1);
  });

  it("preserves ordinary generated-ID inserts for existing callers without a token", async () => {
    const db = database();
    await insertReceivedPayment(db.client, payment);
    await insertReceivedPayment(db.client, payment);
    expect(db.records.size).toBe(2);
    expect(db.inserts[0]).not.toHaveProperty("id");
    expect(db.reads).toHaveLength(0);
  });

  it("does not swallow other database errors", async () => {
    const db = database({ errorCode: "23503" });
    await expect(insertReceivedPayment(db.client, payment, requestId, "Receipt failed to save.")).rejects.toMatchObject({ status: 502, message: "Receipt failed to save." });
    expect(db.reads).toHaveLength(0);
  });

  it("does not treat an unresolvable unique conflict as a successful retry", async () => {
    const db = database({ missingDuplicate: true });
    await expect(insertReceivedPayment(db.client, payment, requestId)).rejects.toMatchObject({ status: 502 });
    expect(db.records.size).toBe(0);
  });

  it("fails closed when duplicate receipt verification is unavailable", async () => {
    const db = database({ lookupError: true });
    await insertReceivedPayment(db.client, payment, requestId);
    await expect(insertReceivedPayment(db.client, payment, requestId)).rejects.toMatchObject({ status: 502 });
    expect(db.records.size).toBe(1);
  });
});

function guardedDatabase(options: { paid?: number; creditIn?: number; creditOut?: number; readFailure?: boolean; failAfterInsertOnce?: boolean } = {}) {
  const db = database({ failAfterInsertOnce: options.failAfterInsertOnce });
  const from = (table: string) => {
    const base = table === "crm_quote_bookkeeping_payments" ? db.client.from(table) : null;
    return {
      insert: base?.insert.bind(base),
      select: (columns: string) => ({ eq: (key: string, value: string) => {
        if (key === "id") return base!.select(columns).eq(key, value);
        if (options.readFailure) return Promise.resolve({ data: null, error: { message: "Unavailable" } });
        const amount = table === "crm_quote_bookkeeping_payments"
          ? (options.paid || 0) + [...db.records.values()].filter(row => row[key] === value).reduce((sum, row) => sum + Number(row.amount), 0)
          : key.startsWith("to_") ? options.creditIn || 0 : options.creditOut || 0;
        return Promise.resolve({ data: [{ amount }], error: null });
      } })
    };
  };
  return { ...db, client: { from } as unknown as SupabaseClient };
}

describe("outstanding-balance receipt protection", () => {
  const receipt = { ...payment, amount: 611.07, payment_label: "Balance payment" };
  const guard = { total: 1222.14, expectedBalance: 611.07 };

  it("records the balance once and rejects the same receipt from a newly opened stale editor", async () => {
    const db = guardedDatabase({ paid: 611.07 });
    expect(await insertReceivedPayment(db.client, receipt, requestId, undefined, guard)).toEqual({ reused: false });
    await expect(insertReceivedPayment(db.client, receipt, entryId, undefined, guard)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("balance changed") });
    expect(db.records.size).toBe(1);
  });

  it("accepts an identical retry after a lost response even though the balance is now zero", async () => {
    const db = guardedDatabase({ paid: 611.07, failAfterInsertOnce: true });
    await expect(insertReceivedPayment(db.client, receipt, requestId, undefined, guard)).rejects.toMatchObject({ status: 502 });
    expect(await insertReceivedPayment(db.client, receipt, requestId, undefined, guard)).toEqual({ reused: true });
    expect(db.records.size).toBe(1);
    await expect(insertReceivedPayment(db.client, { ...receipt, amount: 600 }, requestId, undefined, guard)).rejects.toMatchObject({ status: 409 });
  });

  it("includes credits and added charges in the live balance for standalone ledger entries", async () => {
    const db = guardedDatabase({ paid: 500, creditIn: 50, creditOut: 25 });
    const entryReceipt = { ...receipt, quote_id: null, bookkeeping_entry_id: entryId, amount: 475, source: "manual" };
    await insertReceivedPayment(db.client, entryReceipt, requestId, undefined, { total: 1000, expectedBalance: 475 });
    expect(db.records.size).toBe(1);
  });

  it("allows a partial payment without permitting an amount above the outstanding balance", async () => {
    const db = guardedDatabase({ paid: 611.07 });
    await expect(insertReceivedPayment(db.client, { ...receipt, amount: 611.08 }, requestId, undefined, guard)).rejects.toMatchObject({ status: 409 });
    expect(db.records.size).toBe(0);
    await insertReceivedPayment(db.client, { ...receipt, amount: 200 }, requestId, undefined, guard);
    expect(db.records.size).toBe(1);
  });

  it.each([0, -1, null, "611.07", NaN])("rejects an invalid expected outstanding balance: %s", async expectedBalance => {
    const db = guardedDatabase({ paid: 611.07 });
    await expect(insertReceivedPayment(db.client, receipt, requestId, undefined, { total: 1222.14, expectedBalance })).rejects.toMatchObject({ status: 400 });
    expect(db.records.size).toBe(0);
  });

  it("fails closed if current ledger reads fail or the request token is missing", async () => {
    const db = guardedDatabase({ paid: 611.07, readFailure: true });
    await expect(insertReceivedPayment(db.client, receipt, requestId, undefined, guard)).rejects.toMatchObject({ status: 502 });
    await expect(insertReceivedPayment(db.client, receipt, undefined, undefined, guard)).rejects.toMatchObject({ status: 400 });
    expect(db.records.size).toBe(0);
  });
});
