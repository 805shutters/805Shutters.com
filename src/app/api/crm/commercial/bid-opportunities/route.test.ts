import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  upsertProfile: vi.fn(),
  ingest: vi.fn()
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ auth: { getUser: mocks.getUser } }))
}));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServiceClient: vi.fn(() => ({ from: mocks.from }))
}));
vi.mock("@/lib/crm/commercial-bid-opportunities", () => ({
  processCommercialBidOpportunityInbox: mocks.ingest
}));
import { POST } from "./route";

function request(authenticated = true) {
  return new NextRequest("https://example.test/api/crm/commercial/bid-opportunities", {
    method: "POST",
    headers: authenticated ? { authorization: "Bearer test-session" } : {}
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://database.example.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "test-user", email: "jessica@805shutters.com", user_metadata: {} } }, error: null
  });
  mocks.upsertProfile.mockResolvedValue({ error: null });
  mocks.from.mockImplementation((table: string) => {
    if (table !== "crm_profiles") throw new Error(`Unexpected table access: ${table}`);
    return { upsert: mocks.upsertProfile };
  });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected external call"); }));
});
afterEach(() => {
  expect(mocks.ingest).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(mocks.from.mock.calls.some(([table]) => String(table).startsWith("crm_commercial_"))).toBe(false);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("authenticates and preserves the profile upsert before returning the paused response", async () => {
  const req = request();
  const readPayload = vi.spyOn(req, "json");
  const response = await POST(req);
  expect(mocks.getUser).toHaveBeenCalledExactlyOnceWith("test-session");
  expect(mocks.from).toHaveBeenCalledExactlyOnceWith("crm_profiles");
  expect(mocks.upsertProfile).toHaveBeenCalledOnce();
  expect(readPayload).not.toHaveBeenCalled();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    paused: true, reason: "Paused pending revision under Plan v2.0 chat-hub model"
  });
});

it("rejects an unauthenticated request through the unchanged auth helper", async () => {
  const response = await POST(request(false));
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ message: "CRM session is required." });
  expect(mocks.getUser).not.toHaveBeenCalled();
});

it("rejects an invalid session rather than returning the pause response", async () => {
  mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "Invalid token" } });
  const response = await POST(request());
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ message: "CRM session is required." });
});
