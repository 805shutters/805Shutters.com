import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { CrmAuthError, isKenCrmRequestAllowed } from "@/lib/crm/auth";

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/crm/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/crm/auth")>()),
  requireQuoteFrontDoorActor: mocks.auth,
}));

import { GET as lookupCustomers } from "./customers/route";
import { POST as nextField } from "./next-field/route";
import { POST as validateTap } from "./validate/route";
import { POST as readBack } from "./read-back/route";
import { POST as saveDraft } from "./draft/route";
import { GET as listDrafts } from "./drafts/route";

const catalog = "order-form:norman:roller:v1";

function database() {
  const calls: Array<{ type: string; table?: string; fn?: string }> = [];
  const filter = (table: string) => {
    const api = {
      eq: () => api,
      is: () => api,
      or: () => api,
      in: () => api,
      order: () => api,
      limit: async () => {
        calls.push({ type: "select", table });
        return { data: [], error: null };
      },
    };
    return api;
  };
  const client = {
    rpc: async (fn: string) => {
      calls.push({ type: "rpc", fn });
      if (fn === "quote_next_required_field") {
        return {
          data: {
            status: "complete", reason: null, field_key: null, input_kind: null, required: null, ask_order: null,
            choices: [], invalidated: [], kept: { room_location: "Office" }, optional_field: null, catalog_version: catalog,
          },
          error: null,
        };
      }
      return { data: { ok: false, status: "blocked", reason: "unknown manufacturer or category", choices: [] }, error: null };
    },
    from(table: string) {
      return {
        select: () => filter(table),
        insert: (row: Record<string, unknown>) => {
          calls.push({ type: "insert", table });
          expect(row.status).toBe("draft");
          return { select: () => ({ single: async () => ({ data: { id: "draft-route" }, error: null }) }) };
        },
      };
    },
  };
  return { client, calls };
}

function post(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("quote front door routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires a CRM staff session and keeps Ken off the draft route", async () => {
    mocks.auth.mockRejectedValue(new CrmAuthError(401, "CRM session is required."));
    expect((await nextField(post("/api/crm/quote-front-door/next-field", {}))).status).toBe(401);
    expect((await saveDraft(post("/api/crm/quote-front-door/draft", {}))).status).toBe(401);
    expect((await listDrafts(new NextRequest("http://localhost/api/crm/quote-front-door/drafts"))).status).toBe(401);
    expect(isKenCrmRequestAllowed("khill31@msn.com", "GET", "/api/crm/quote-front-door/drafts")).toBe(false);
    expect(isKenCrmRequestAllowed("khill31@msn.com", "POST", "/api/crm/quote-front-door/draft")).toBe(false);
    expect(isKenCrmRequestAllowed("805shutters@gmail.com", "POST", "/api/crm/quote-front-door/draft")).toBe(true);
  });

  it("returns the next field and saves a draft that was not sent", async () => {
    const db = database();
    mocks.auth.mockResolvedValue({
      supabase: db.client,
      email: "805shutters@gmail.com",
      userId: "11111111-1111-4111-8111-111111111111",
      kind: "staff",
    });
    const lookup = await lookupCustomers(new NextRequest("http://localhost/api/crm/quote-front-door/customers?name=Jane%20Smith"));
    expect(lookup.status).toBe(200);
    expect(await lookup.json()).toMatchObject({ candidates: [], created: false });

    const asked = await nextField(post("/api/crm/quote-front-door/next-field", {
      manufacturer: "Norman", category: "roller", spec: { answers: { room_location: "Office" }, multiplier: "2.5" },
    }));
    expect(asked.status).toBe(200);
    expect(await asked.json()).toMatchObject({ phase: "ready", multiplier: "2.5", status: "complete" });

    const read = await readBack(post("/api/crm/quote-front-door/read-back", {
      manufacturer: "Norman", category: "roller", spec: { answers: { room_location: "Office" }, multiplier: "2.5" },
    }));
    expect(read.status).toBe(200);
    expect((await read.json()).summary).toBe("Norman roller\nRoom: Office\nMultiplier: 2.5");

    const blocked = await validateTap(post("/api/crm/quote-front-door/validate", {
      manufacturer: "Sundance", category: "sundance_roller", fieldKey: "room_location", value: "Office", spec: {},
    }));
    expect(blocked.status).toBe(200);
    expect(await blocked.json()).toMatchObject({ ok: false, status: "blocked" });

    const saved = await saveDraft(post("/api/crm/quote-front-door/draft", {
      manufacturer: "Norman",
      category: "roller",
      spec: { answers: { room_location: "Office" }, multiplier: "2.5" },
      customer: { name: "New Person", phone: "805-555-0177", confirmNewCustomer: true },
    }));
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({
      saved: true,
      sent: false,
      quote: { id: "draft-route", status: "draft", sent: false },
    });
    expect(db.calls.filter((call) => call.type === "insert").map((call) => call.table)).toEqual(["crm_quote_front_door_drafts"]);
    expect(db.calls.some((call) => call.table === "crm_customers" && call.type === "insert")).toBe(false);
    expect(db.calls.filter((call) => call.fn === "quote_validate_tapped_value")).toHaveLength(1);
  });
});
