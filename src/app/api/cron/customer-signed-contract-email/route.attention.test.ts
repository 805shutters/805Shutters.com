import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, filters: [] as unknown[] }));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServiceClient: () => ({
    from(table: string) {
      let selected = "";
      let unresolvedOnly = false;
      const query: Record<string, unknown> = {};
      for (const key of ["eq", "gte", "or", "order", "in"]) {
        query[key] = (...args: unknown[]) => {
          if (table === "crm_customer_signed_contract_email_outbox" && selected.includes("attention_resolved_at")) state.filters.push([key, ...args]);
          return query;
        };
      }
      query.is = (column: string, value: unknown) => {
        if (table === "crm_customer_signed_contract_email_outbox" && selected.includes("attention_resolved_at")) state.filters.push(["is", column, value]);
        if (column === "attention_resolved_at" && value === null) unresolvedOnly = true;
        return query;
      };
      query.select = (fields: string) => { selected = fields; return query; };
      query.single = async () => ({ data: { enabled_from: "2026-09-24T00:00:00.000Z" }, error: null });
      query.limit = async () => {
        if (table === "crm_activity_events") return { data: [{ created_at: new Date().toISOString(), action: "customer-email.succeeded" }], error: null };
        if (selected === "provider_message_id") return { data: [{ provider_message_id: "provider" }], error: null };
        const rows = unresolvedOnly ? state.rows.filter(row => !row.attention_resolved_at) : state.rows;
        return { data: rows, error: null };
      };
      return query;
    },
    rpc: async () => ({ data: 0, error: null }),
  }),
}));
vi.mock("@/lib/crm/customer-signed-contract-email", () => ({ processCustomerSignedContractEmailOutbox: vi.fn() }));
vi.mock("@/lib/crm/internal-signed-contract-copy", () => ({ processInternalSignedContractCopyOutbox: vi.fn() }));
vi.mock("@/lib/crm/integration-health", () => ({ observeIntegration: vi.fn() }));
import { processCustomerSignedContractEmailOutbox } from "@/lib/crm/customer-signed-contract-email";
import { processInternalSignedContractCopyOutbox } from "@/lib/crm/internal-signed-contract-copy";
import { observeIntegration } from "@/lib/crm/integration-health";
import { GET } from "./route";

const failed = {
  id: "6f1c2b7e-8a4d-4e1a-9c3b-2d5e6f708192", kind: "signed_contract", status: "accepted", recipient: "missing",
  created_at: "2026-10-05T20:40:47.801Z", provider_accepted_at: "2026-10-05T20:41:00.000Z", delivery_status: "bounced",
  delivery_checked_at: "2026-10-05T20:50:00.000Z", delivery_error: null, last_error: null,
  attention_resolved_at: null, attention_resolved_by: null, attention_resolved_note: null,
};

beforeEach(() => {
  state.rows = [];
  state.filters = [];
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "worker");
  vi.stubEnv("APPOINTMENT_REMINDER_CRON_SECRET", "watchdog");
  vi.stubEnv("RESEND_API_KEY", "controlled-test-key");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "provider", last_event: "delivered" }), { status: 200 })));
});

function health() {
  return GET(new NextRequest("https://www.805shutters.com/api/cron/customer-signed-contract-email/?check=health", {
    headers: { authorization: "Bearer watchdog" },
  }));
}

it("returns ok when every attention row is resolved", async () => {
  state.rows = [{ ...failed, attention_resolved_at: "2026-11-15T18:00:00.000Z", attention_resolved_by: "805shutters@gmail.com" }];
  const response = await health();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, attention: 0, activated: true });
  expect(state.filters).toContainEqual(["is", "attention_resolved_at", null]);
  expect(processCustomerSignedContractEmailOutbox).not.toHaveBeenCalled();
  expect(processInternalSignedContractCopyOutbox).not.toHaveBeenCalled();
  expect(observeIntegration).not.toHaveBeenCalled();
});

it("returns 503 while an unresolved failed row is still counted", async () => {
  state.rows = [failed];
  const response = await health();
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ ok: false, attention: 1 });
  expect(processCustomerSignedContractEmailOutbox).not.toHaveBeenCalled();
  expect(processInternalSignedContractCopyOutbox).not.toHaveBeenCalled();
});
