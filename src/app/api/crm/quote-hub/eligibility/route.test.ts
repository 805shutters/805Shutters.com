import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({auth:vi.fn(), eligible:vi.fn()}));
vi.mock("@/lib/crm/auth", async original => ({...await original<typeof import("@/lib/crm/auth")>(),requireCrmUser:mocks.auth}));
vi.mock("@/lib/crm/quote-hub-eligibility-server", () => ({loadFollowUpEligibleQuoteIds:mocks.eligible}));
import { GET } from "./route";
import { CrmAuthError } from "@/lib/crm/auth";
describe("follow-up eligibility route", () => {
  beforeEach(() => {vi.clearAllMocks();mocks.auth.mockResolvedValue({supabase:{}});mocks.eligible.mockResolvedValue(["safe"]);});
  it("returns only verified eligible identities without caching", async () => {
    const response=await GET(new NextRequest("http://localhost/api/crm/quote-hub/eligibility"));
    expect(await response.json()).toEqual({eligibleQuoteIds:["safe"]});
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("requires CRM authorization before reading customer sale history", async () => {
    mocks.auth.mockRejectedValue(new CrmAuthError(403,"Not allowed"));
    expect((await GET(new NextRequest("http://localhost/api/crm/quote-hub/eligibility"))).status).toBe(403);
    expect(mocks.eligible).not.toHaveBeenCalled();
  });
  it("does not return an allowlist when the history check fails", async () => {
    mocks.eligible.mockRejectedValue(new CrmAuthError(502,"Unavailable"));
    expect((await GET(new NextRequest("http://localhost/api/crm/quote-hub/eligibility"))).status).toBe(502);
  });
});
