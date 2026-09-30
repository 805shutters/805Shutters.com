import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { requireCrmUser } from "./auth";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), upsert: vi.fn(), service: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServiceClient: mocks.service }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-key");
  mocks.getUser.mockResolvedValue({ data: { user: { id: "ken", email: "khill31@msn.com" } }, error: null });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.service.mockReturnValue({ from: () => ({ upsert: mocks.upsert }) });
});
describe("authenticated Ken boundary", () => {
  it("rejects dashboard reads before accessing service-role data", async () => {
    await expect(requireCrmUser(new NextRequest("https://805.test/api/crm/jobs", { headers: { authorization: "Bearer ken-session" } }))).rejects.toMatchObject({ status: 403 });
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("allows the payoff endpoint", async () => {
    await expect(requireCrmUser(new NextRequest("https://805.test/api/crm/ken-payoff", { headers: { authorization: "Bearer ken-session" } }))).resolves.toMatchObject({ email: "khill31@msn.com" });
  });
  it("rejects writes even to the payoff endpoint", async () => {
    await expect(requireCrmUser(new NextRequest("https://805.test/api/crm/ken-payoff", { method: "POST", headers: { authorization: "Bearer ken-session" } }))).rejects.toMatchObject({ status: 403 });
    expect(mocks.service).not.toHaveBeenCalled();
  });
});
