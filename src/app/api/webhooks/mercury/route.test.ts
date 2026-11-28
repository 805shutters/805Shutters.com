import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { sendSms } from "@/lib/notify/twilio";
import { mercuryPaymentRequestId } from "@/lib/finance/mercury";
import { POST } from "./route";

vi.mock("@/lib/supabase-server", () => ({ getSupabaseServiceClient: vi.fn() }));
vi.mock("@/lib/notify/twilio", () => ({ sendSms: vi.fn() }));

const SECRET = "test-mercury-webhook-secret";
const OWNER = "+18055550101";
const TRANSACTION = "1d3042b6-af63-11f0-89d2-3503f2fcfef7";
const JANE = "bbbbbbbb-2222-4222-8222-222222222222";
const JANE_JOB = "cccccccc-3333-4333-8333-333333333333";
const POSTED_AT = "2026-11-27T18:30:00.000Z";

type Row = Record<string, unknown>;

function quote(id: string, name: string, balanceDue: number, extra: Row = {}) {
  return {
    id,
    job_id: extra.job_id || JANE_JOB,
    customer_name: name,
    status: extra.status || "sold",
    meta: extra.meta || { payment_progress: { balanceDue } },
  };
}

function memoryDb(quotes: Row[] = []) {
  const tables: Record<string, Row[]> = {
    crm_mercury_events: [],
    crm_bank_credits: [],
    crm_quotes: quotes.map((row) => ({ ...row })),
    crm_quote_bookkeeping_payments: [],
  };
  const paymentInserts: Row[] = [];
  const paymentMutations: string[] = [];

  function matched(table: string, filters: Array<(row: Row) => boolean>, slice: [number, number] | null) {
    const rows = (tables[table] || []).filter((row) => filters.every((filter) => filter(row)));
    return slice ? rows.slice(slice[0], slice[1] + 1) : rows;
  }

  function from(table: string) {
    if (!tables[table]) tables[table] = [];
    return {
      async insert(row: Row) {
        if (table === "crm_quote_bookkeeping_payments") paymentMutations.push("insert");
        const duplicate =
          (table === "crm_mercury_events" && tables[table].some((existing) => existing.id === row.id)) ||
          (table === "crm_quote_bookkeeping_payments" && tables[table].some((existing) => existing.id === row.id));
        if (duplicate) return { error: { code: "23505", message: "duplicate" } };
        tables[table].push({ ...row });
        if (table === "crm_quote_bookkeeping_payments") paymentInserts.push(row);
        return { error: null };
      },
      async upsert(row: Row, options?: { onConflict?: string }) {
        const key = options?.onConflict || "id";
        const index = tables[table].findIndex((existing) => existing[key] === row[key]);
        if (index >= 0) tables[table][index] = { ...tables[table][index], ...row };
        else tables[table].push({ ...row });
        return { error: null };
      },
      update(patch: Row) {
        if (table === "crm_quote_bookkeeping_payments") paymentMutations.push("update");
        const filters: Array<(row: Row) => boolean> = [];
        const chain = {
          eq(key: string, value: unknown) {
            filters.push((row) => row[key] === value);
            return chain;
          },
          is(key: string, value: unknown) {
            filters.push((row) => (value === null ? row[key] == null : row[key] === value));
            return chain;
          },
          async select() {
            const rows = matched(table, filters, null);
            for (const row of rows) Object.assign(row, patch);
            return { data: rows.map((row) => ({ ...row })), error: null };
          },
        };
        return chain;
      },
      select() {
        const filters: Array<(row: Row) => boolean> = [];
        let slice: [number, number] | null = null;
        const chain = {
          eq(key: string, value: unknown) {
            filters.push((row) => row[key] === value);
            return chain;
          },
          not(key: string, operator: string, value: string) {
            if (operator === "in") {
              const items = new Set(value.replace(/[()]/g, "").split(",").map((item) => item.trim()));
              filters.push((row) => !items.has(String(row[key] ?? "")));
            }
            return chain;
          },
          range(start: number, end: number) {
            slice = [start, end];
            return chain;
          },
          async maybeSingle() {
            const rows = matched(table, filters, slice);
            return { data: rows[0] ? { ...rows[0] } : null, error: null };
          },
          then(resolve: (value: { data: Row[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
            return Promise.resolve({ data: matched(table, filters, slice).map((row) => ({ ...row })), error: null }).then(resolve, reject);
          },
        };
        return chain;
      },
    };
  }

  return { client: { from } as never, tables, paymentInserts, paymentMutations };
}

function signedRequest(body: unknown, options: { skewSeconds?: number; signature?: string | null; raw?: string } = {}) {
  const raw = options.raw ?? JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000) + (options.skewSeconds ?? 0);
  const digest = createHmac("sha256", SECRET).update(`${timestamp}.${raw}`).digest("hex");
  const signature = options.signature === undefined ? `t=${timestamp},v1=${digest}` : options.signature;
  const headers = new Headers();
  if (signature !== null) headers.set("Mercury-Signature", signature);
  return new NextRequest("https://www.805shutters.com/api/webhooks/mercury", { method: "POST", body: raw, headers });
}

function transaction(operation: "create" | "update", id: string, mergePatch: Row) {
  return { id, resourceType: "transaction", resourceId: TRANSACTION, operationType: operation, mergePatch };
}

const deposit = {
  amount: 1250.5,
  status: "pending",
  kind: "checkDeposit",
  counterpartyName: "Jane Doe",
  accountId: "acct-fixture",
  createdAt: "2026-11-26T18:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.stubEnv("MERCURY_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("MIKE_805_SALES_SMS_NUMBER", OWNER);
  vi.mocked(sendSms).mockResolvedValue({ sent: true, sid: "SMfixture" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("handles the exact non-slash URL with a raw-body hex signature and logs only identity", async () => {
  const db = memoryDb();
  vi.mocked(getSupabaseServiceClient).mockReturnValue(db.client);
  const raw = JSON.stringify(transaction("create", "evt-raw", deposit), null, 2) + "\n";
  const signature = createHmac("sha256", SECRET).update(raw).digest("hex");
  const request = signedRequest(null, { raw, signature });
  expect(request.nextUrl.pathname).toBe("/api/webhooks/mercury");
  const response = await POST(request);
  expect(response.status).toBe(200);
  expect(response.headers.get("location")).toBeNull();
  expect(db.tables.crm_mercury_events).toHaveLength(1);
  expect(console.info).toHaveBeenCalledExactlyOnceWith({ eventType: "transaction.created", transactionId: TRANSACTION });
  expect(sendSms).not.toHaveBeenCalled();
});

it("rejects an invalid hex signature before parsing, database access or logging", async () => {
  const response = await POST(signedRequest(null, { raw: "not JSON", signature: "00".repeat(32) }));
  expect(response.status).toBe(401);
  expect(getSupabaseServiceClient).not.toHaveBeenCalled();
  expect(console.info).not.toHaveBeenCalled();
  expect(sendSms).not.toHaveBeenCalled();
});

it("rejects unsigned requests without reading the body, even when configuration is absent", async () => {
  vi.stubEnv("MERCURY_WEBHOOK_SECRET", "");
  const request = signedRequest(null, { signature: null });
  const readBody = vi.spyOn(request, "arrayBuffer");
  expect((await POST(request)).status).toBe(401);
  expect(readBody).not.toHaveBeenCalled();
  expect(getSupabaseServiceClient).not.toHaveBeenCalled();
  expect(console.info).not.toHaveBeenCalled();
});

it("deduplicates payments by transaction id even when Mercury uses a different event id", async () => {
  const db = memoryDb([quote(JANE, "Jane Doe", 1250.5)]);
  vi.mocked(getSupabaseServiceClient).mockReturnValue(db.client);
  for (const id of ["evt-first", "evt-retry-new-id"]) {
    const raw = JSON.stringify(transaction("update", id, { ...deposit, status: "sent", postedAt: POSTED_AT }));
    const signature = createHmac("sha256", SECRET).update(raw).digest("hex");
    expect((await POST(signedRequest(null, { raw, signature }))).status).toBe(200);
  }
  expect(db.tables.crm_bank_credits).toHaveLength(1);
  expect(db.paymentInserts).toHaveLength(1);
  expect(db.paymentInserts[0].external_id).toBe(TRANSACTION);
  expect(sendSms).not.toHaveBeenCalled();
});

it("accepts a valid signature and ignores unrelated Mercury events", async () => {
  const db = memoryDb();
  vi.mocked(getSupabaseServiceClient).mockReturnValue(db.client);
  const response = await POST(
    signedRequest({ id: "evt-balance", resourceType: "checkingAccount", operationType: "update", mergePatch: { availableBalance: 1 } }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ received: true, ignored: true });
  expect(db.tables.crm_mercury_events).toEqual([]);
  expect(db.paymentInserts).toEqual([]);
  expect(sendSms).not.toHaveBeenCalled();
});

it("rejects a bad signature before it touches the ledger", async () => {
  const db = memoryDb();
  vi.mocked(getSupabaseServiceClient).mockReturnValue(db.client);
  const response = await POST(signedRequest(transaction("create", "evt-1", deposit), { signature: `t=${Math.floor(Date.now() / 1000)},v1=${"ab".repeat(32)}` }));
  expect(response.status).toBe(401);
  expect(getSupabaseServiceClient).not.toHaveBeenCalled();
  expect(sendSms).not.toHaveBeenCalled();
});

it("rejects a stale signature", async () => {
  const response = await POST(signedRequest(transaction("create", "evt-1", deposit), { skewSeconds: -301 }));
  expect(response.status).toBe(401);
  expect(getSupabaseServiceClient).not.toHaveBeenCalled();
});

it("rejects a missing signature", async () => {
  const response = await POST(signedRequest(transaction("create", "evt-1", deposit), { signature: null }));
  expect(response.status).toBe(401);
  expect(getSupabaseServiceClient).not.toHaveBeenCalled();
});

it("fails closed when the webhook secret is unset", async () => {
  vi.stubEnv("MERCURY_WEBHOOK_SECRET", "");
  const response = await POST(signedRequest(transaction("create", "evt-1", deposit)));
  expect(response.status).toBe(503);
  expect(getSupabaseServiceClient).not.toHaveBeenCalled();
  expect(sendSms).not.toHaveBeenCalled();
});

it("keeps a pending check, then matches it once when the deposit is sent", async () => {
  const db = memoryDb([
    quote(JANE, "Jane Doe", 1250.5),
    quote("dddddddd-4444-4444-8444-444444444444", "Jane Doe", 1250.5, { status: "archived" }),
    quote("eeeeeeee-5555-4555-8555-555555555555", "Jane Doe", 1250.5, {
      meta: { deleted_at: "2026-01-01T00:00:00Z", payment_progress: { balanceDue: 1250.5 } },
    }),
    quote("ffffffff-6666-4666-8666-666666666666", "Bob Smith", 1250.5, { job_id: "99999999-7777-4777-8777-777777777777" }),
  ]);
  vi.mocked(getSupabaseServiceClient).mockReturnValue(db.client);
  const pending = await POST(signedRequest(transaction("create", "evt-pending", deposit)));
  expect(pending.status).toBe(200);
  expect(db.tables.crm_bank_credits).toHaveLength(1);
  expect(db.tables.crm_bank_credits[0]).toMatchObject({ status: "pending", match_status: "unmatched", amount: 1250.5 });
  expect(db.paymentInserts).toEqual([]);
  expect(sendSms).not.toHaveBeenCalled();

  const cleared = await POST(
    signedRequest(transaction("update", "evt-cleared", { status: "sent", postedAt: POSTED_AT, counterpartyName: "JANE DOE, JR." })),
  );
  expect(cleared.status).toBe(200);
  expect(await cleared.json()).toMatchObject({ received: true, duplicate: false });
  expect(db.paymentInserts).toHaveLength(1);
  expect(db.paymentInserts[0]).toMatchObject({
    id: mercuryPaymentRequestId(TRANSACTION),
    quote_id: JANE,
    job_id: JANE_JOB,
    payment_type: "check",
    source: "manual",
    amount: 1250.5,
    paid_at: "2026-11-27",
    external_source: "mercury",
    external_id: TRANSACTION,
  });
  expect(db.paymentInserts[0].notes).toContain(TRANSACTION);
  expect(db.tables.crm_bank_credits[0]).toMatchObject({
    match_status: "matched",
    matched_quote_id: JANE,
    matched_payment_id: mercuryPaymentRequestId(TRANSACTION),
    status: "sent",
    counterparty_name: "JANE DOE, JR.",
  });
  expect(db.tables.crm_bank_credits[0].raw).toMatchObject({ amount: 1250.5, kind: "checkDeposit", status: "sent", counterpartyName: "JANE DOE, JR." });
  expect(sendSms).not.toHaveBeenCalled();

  const replay = await POST(
    signedRequest(transaction("update", "evt-cleared", { status: "sent", postedAt: POSTED_AT, counterpartyName: "JANE DOE, JR." })),
  );
  expect(replay.status).toBe(200);
  expect(await replay.json()).toMatchObject({ duplicate: true });
  expect(db.paymentInserts).toHaveLength(1);
  expect(db.paymentMutations).toEqual(["insert"]);
  expect(sendSms).not.toHaveBeenCalled();
});

it("rejects an amount-only match and asks Mike when no name agrees", async () => {
  const db = memoryDb([quote("aaaaaaaa-1111-4111-8111-111111111111", "Bob Smith", 1250.5), quote(JANE, "Jane Doe", 1250.51)]);
  vi.mocked(getSupabaseServiceClient).mockReturnValue(db.client);
  const response = await POST(signedRequest(transaction("create", "evt-none", { ...deposit, status: "sent", postedAt: POSTED_AT })));
  expect(response.status).toBe(200);
  expect(db.paymentInserts).toEqual([]);
  expect(db.tables.crm_bank_credits[0].match_status).toBe("needs_review");
  expect(sendSms).toHaveBeenCalledTimes(1);
  expect(sendSms).toHaveBeenCalledWith(
    expect.objectContaining({
      to: OWNER,
      ownerAlert: true,
      body: expect.stringContaining("Amount: $1,250.50"),
    }),
  );
  const body = vi.mocked(sendSms).mock.calls[0][0].body;
  expect(body).toContain("From: Jane Doe");
  expect(body).toContain("Date: 2026-11-27");
  expect(body).toContain(TRANSACTION);
  const replay = await POST(signedRequest(transaction("create", "evt-none", { ...deposit, status: "sent", postedAt: POSTED_AT })));
  expect(await replay.json()).toMatchObject({ duplicate: true });
  expect(sendSms).toHaveBeenCalledTimes(1);
});

it("does not post a payment when several quotes match the amount and the name", async () => {
  const db = memoryDb([
    quote(JANE, "Jane Doe", 1250.5),
    quote("dddddddd-4444-4444-8444-444444444444", "Jane Doe", 1250.5, { job_id: "99999999-7777-4777-8777-777777777777" }),
  ]);
  vi.mocked(getSupabaseServiceClient).mockReturnValue(db.client);
  const response = await POST(signedRequest(transaction("create", "evt-many", { ...deposit, status: "cleared", postedAt: POSTED_AT })));
  expect(response.status).toBe(200);
  expect(db.paymentInserts).toEqual([]);
  expect(db.tables.crm_bank_credits[0].match_status).toBe("needs_review");
  expect(vi.mocked(sendSms).mock.calls[0][0].body).toContain("2 open quotes");
  expect(vi.mocked(sendSms).mock.calls.every((call) => call[0].to === OWNER && call[0].ownerAlert === true)).toBe(true);
});

it("ignores debits and non-check credits", async () => {
  const db = memoryDb([quote(JANE, "Jane Doe", 40)]);
  vi.mocked(getSupabaseServiceClient).mockReturnValue(db.client);
  expect((await POST(signedRequest(transaction("create", "evt-debit", { ...deposit, amount: -40, status: "sent" })))).status).toBe(200);
  expect((await POST(signedRequest(transaction("create", "evt-zero", { ...deposit, amount: 0, status: "sent" })))).status).toBe(200);
  expect(db.tables.crm_bank_credits).toEqual([]);
  expect(db.paymentInserts).toEqual([]);
  const wire = await POST(
    signedRequest(
      transaction("create", "evt-wire", { ...deposit, amount: 40, status: "sent", postedAt: POSTED_AT, kind: "incomingDomesticWire" }),
    ),
  );
  expect(wire.status).toBe(200);
  expect(db.tables.crm_bank_credits).toHaveLength(1);
  expect(db.tables.crm_bank_credits[0].match_status).toBe("unmatched");
  expect(db.paymentInserts).toEqual([]);
  expect(sendSms).not.toHaveBeenCalled();
});

it("marks a matched deposit reversed and leaves the payment row alone", async () => {
  const db = memoryDb([quote(JANE, "Jane Doe", 1250.5)]);
  vi.mocked(getSupabaseServiceClient).mockReturnValue(db.client);
  expect((await POST(signedRequest(transaction("create", "evt-pay", { ...deposit, status: "sent", postedAt: POSTED_AT })))).status).toBe(200);
  const payment = { ...db.paymentInserts[0] };
  const reversed = await POST(signedRequest(transaction("update", "evt-return", { status: "failed" })));
  expect(reversed.status).toBe(200);
  expect(db.tables.crm_bank_credits[0]).toMatchObject({
    match_status: "reversed",
    status: "failed",
    matched_payment_id: payment.id,
    matched_quote_id: JANE,
  });
  expect(db.tables.crm_quote_bookkeeping_payments).toEqual([expect.objectContaining(payment)]);
  expect(db.paymentMutations).toEqual(["insert"]);
  expect(sendSms).toHaveBeenCalledTimes(1);
  const body = vi.mocked(sendSms).mock.calls[0][0].body;
  expect(body).toContain("Amount: $1,250.50");
  expect(body).toContain("From: Jane Doe");
  expect(body).toContain("Date: 2026-11-27");
  expect(body).toContain("failed");
  const replay = await POST(signedRequest(transaction("update", "evt-return", { status: "failed" })));
  expect(await replay.json()).toMatchObject({ duplicate: true });
  expect(sendSms).toHaveBeenCalledTimes(1);
  expect(db.paymentMutations).toEqual(["insert"]);
});

it("retries the owner text without posting a second payment", async () => {
  const db = memoryDb();
  vi.mocked(getSupabaseServiceClient).mockReturnValue(db.client);
  vi.mocked(sendSms).mockResolvedValueOnce({ sent: false, error: "down" }).mockResolvedValueOnce({ sent: true, sid: "SMfixture" });
  const event = transaction("create", "evt-retry", { ...deposit, status: "sent", postedAt: POSTED_AT });
  expect((await POST(signedRequest(event))).status).toBe(503);
  expect(db.tables.crm_bank_credits[0].match_status).toBe("needs_review");
  expect((await POST(signedRequest(event))).status).toBe(200);
  expect(db.paymentInserts).toEqual([]);
  expect(sendSms).toHaveBeenCalledTimes(2);
  expect(vi.mocked(sendSms).mock.calls.every((call) => call[0].to === OWNER && call[0].ownerAlert === true)).toBe(true);
});
