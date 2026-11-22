import { readFileSync } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { CrmAuthError } from "@/lib/crm/auth";

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/crm/auth", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/crm/auth")>(), requireCrmUser: mocks.auth }));
vi.mock("@/lib/crm/customer-signed-contract-email", () => ({ processCustomerSignedContractEmailOutbox: vi.fn(() => { throw new Error("must not enqueue"); }) }));
vi.mock("@/lib/notify/email", () => ({ sendEmail: vi.fn(() => { throw new Error("must not send"); }) }));
import { processCustomerSignedContractEmailOutbox } from "@/lib/crm/customer-signed-contract-email";
import { sendEmail } from "@/lib/notify/email";
import { POST } from "./route";

const ID = "6f1c2b7e-8a4d-4e1a-9c3b-2d5e6f708192";
type Row = {
  id: string; status: string; delivery_status: string | null; delivery_error: string | null; created_at: string;
  attention_resolved_at: string | null; attention_resolved_by: string | null; attention_resolved_note: string | null;
};
function blocked(overrides: Partial<Row> = {}): Row {
  return {
    id: ID, status: "blocked", delivery_status: null, delivery_error: null, created_at: "2026-09-27T22:30:13.477Z",
    attention_resolved_at: null, attention_resolved_by: null, attention_resolved_note: null, ...overrides,
  };
}
function database(initial: Row | null, options: { race?: boolean } = {}) {
  const row = initial ? { ...initial } : null;
  const updates: Array<Record<string, unknown>> = [];
  const tables: string[] = [];
  let mode: "read" | "write" = "read";
  const query = {
    select() { return query; },
    eq() { return query; },
    is(column: string, value: unknown) {
      if (mode === "write" && column === "attention_resolved_at" && value === null && row?.attention_resolved_at) return { ...query, maybeSingle: async () => ({ data: null, error: null }) };
      return query;
    },
    update(payload: Record<string, unknown>) { mode = "write"; updates.push(payload); return query; },
    insert() { throw new Error("insert"); },
    upsert() { throw new Error("upsert"); },
    delete() { throw new Error("delete"); },
    maybeSingle: async () => {
      if (mode === "write") {
        mode = "read";
        if (!row) return { data: null, error: null };
        if (options.race) {
          row.attention_resolved_at = "2026-11-15T18:00:00.000Z";
          row.attention_resolved_by = "first@805shutters.com";
          row.attention_resolved_note = "already";
          return { data: null, error: null };
        }
        Object.assign(row, updates.at(-1));
        return { data: { id: row.id, attention_resolved_at: row.attention_resolved_at, attention_resolved_by: row.attention_resolved_by, attention_resolved_note: row.attention_resolved_note }, error: null };
      }
      return { data: row ? { ...row } : null, error: null };
    },
  };
  return {
    updates, tables, row,
    from(table: string) {
      tables.push(table);
      if (table !== "crm_customer_signed_contract_email_outbox") throw new Error(`unexpected table ${table}`);
      mode = "read";
      return query;
    },
    rpc() { throw new Error("rpc"); },
  };
}
function post(body: unknown) {
  return POST(new NextRequest("http://localhost/api/crm/customer-email-status/resolve", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
  mocks.auth.mockResolvedValue({ supabase: database(blocked()), email: "805shutters@gmail.com", user: { id: "staff-1" } });
});

it("requires a CRM session and does not touch the outbox", async () => {
  const actual = await vi.importActual<typeof import("@/lib/crm/auth")>("@/lib/crm/auth");
  mocks.auth.mockImplementation(request => actual.requireCrmUser(request));
  const response = await post({ id: ID });
  expect(response.status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
  expect(processCustomerSignedContractEmailOutbox).not.toHaveBeenCalled();
  expect(sendEmail).not.toHaveBeenCalled();
});

it("changes only the resolution columns and does not send or enqueue", async () => {
  const db = database(blocked());
  mocks.auth.mockResolvedValue({ supabase: db, email: "805shutters@gmail.com", user: { id: "staff-1" } });
  const response = await post({ id: ID, note: "  Called the customer  " });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, idempotent: false, id: ID, attention_resolved_by: "805shutters@gmail.com", attention_resolved_note: "Called the customer" });
  expect(db.updates).toEqual([{
    attention_resolved_at: expect.any(String),
    attention_resolved_by: "805shutters@gmail.com",
    attention_resolved_note: "Called the customer",
  }]);
  expect(Object.keys(db.updates[0]).sort()).toEqual(["attention_resolved_at", "attention_resolved_by", "attention_resolved_note"]);
  expect(db.tables.every(table => table === "crm_customer_signed_contract_email_outbox")).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
  expect(processCustomerSignedContractEmailOutbox).not.toHaveBeenCalled();
  expect(sendEmail).not.toHaveBeenCalled();
});

it("is idempotent and keeps the first resolution", async () => {
  const db = database(blocked());
  mocks.auth.mockResolvedValue({ supabase: db, email: "805shutters@gmail.com", user: { id: "staff-1" } });
  expect((await post({ id: ID, note: "First" })).status).toBe(200);
  const saved = db.updates[0].attention_resolved_at;
  const again = await post({ id: ID, note: "Different note" });
  expect(again.status).toBe(200);
  expect(await again.json()).toMatchObject({ idempotent: true, attention_resolved_at: saved, attention_resolved_by: "805shutters@gmail.com", attention_resolved_note: "First" });
  expect(db.updates).toHaveLength(1);
  expect(fetch).not.toHaveBeenCalled();
});

it("returns the existing resolution without writing when the row is already handled", async () => {
  const db = database(blocked({ attention_resolved_at: "2026-11-15T18:00:00.000Z", attention_resolved_by: "805shutters@gmail.com", attention_resolved_note: "Done" }));
  mocks.auth.mockResolvedValue({ supabase: db, email: "jessica@805shutters.com", user: { id: "staff-2" } });
  const response = await post({ id: ID, note: "Again" });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ idempotent: true, attention_resolved_by: "805shutters@gmail.com", attention_resolved_note: "Done" });
  expect(db.updates).toHaveLength(0);
});

it("rejects a delivered row and a row that is not in an attention state", async () => {
  for (const row of [
    blocked({ status: "accepted", delivery_status: "delivered" }),
    blocked({ status: "pending", created_at: new Date().toISOString() }),
  ]) {
    const db = database(row);
    mocks.auth.mockResolvedValue({ supabase: db, email: "805shutters@gmail.com", user: { id: "staff-1" } });
    expect((await post({ id: ID })).status).toBe(409);
    expect(db.updates).toHaveLength(0);
  }
  expect(fetch).not.toHaveBeenCalled();
  expect(processCustomerSignedContractEmailOutbox).not.toHaveBeenCalled();
});

it("rejects a missing or invalid email id", async () => {
  const db = database(null);
  mocks.auth.mockResolvedValue({ supabase: db, email: "805shutters@gmail.com", user: { id: "staff-1" } });
  expect((await post({ id: ID })).status).toBe(404);
  expect((await post({ id: "not-an-id" })).status).toBe(400);
  expect(db.updates).toHaveLength(0);
  mocks.auth.mockRejectedValue(new CrmAuthError(401, "CRM session is required."));
  expect((await post({ id: ID })).status).toBe(401);
});

it("keeps the first writer when a second resolution loses the race", async () => {
  const db = database(blocked(), { race: true });
  mocks.auth.mockResolvedValue({ supabase: db, email: "805shutters@gmail.com", user: { id: "staff-1" } });
  const response = await post({ id: ID, note: "Second" });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ idempotent: true, attention_resolved_by: "first@805shutters.com", attention_resolved_note: "already" });
  expect(db.updates).toHaveLength(1);
  expect(fetch).not.toHaveBeenCalled();
});

it("adds nullable attention columns and does not change existing rows", () => {
  const sql = readFileSync("supabase/migrations/20261115173957_customer_email_attention_resolution.sql", "utf8").replace(/--.*$/gm, "").toLowerCase();
  expect(sql).toContain("alter table public.crm_customer_signed_contract_email_outbox");
  expect(sql).toContain("add column attention_resolved_at timestamptz");
  expect(sql).toContain("add column attention_resolved_by text");
  expect(sql).toContain("add column attention_resolved_note text");
  expect(sql).not.toMatch(/\bnot null\b/);
  expect(sql).not.toMatch(/\b(drop|update|delete|insert|truncate)\b/);
  expect(sql.match(/alter table/g)).toHaveLength(1);
});
