import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ requireCrmUser: vi.fn(), listDeletedCrmJobs: vi.fn() }));

vi.mock("@/lib/crm/auth", () => ({
  requireCrmUser: mocks.requireCrmUser,
  crmAuthErrorResponse: (error: unknown) => NextResponse.json({ message: error instanceof Error ? error.message : "failed" }, { status: 500 })
}));
vi.mock("@/lib/crm/backend", () => ({ listDeletedCrmJobs: mocks.listDeletedCrmJobs }));

import { GET } from "./route";

describe("GET deleted CRM jobs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires CRM auth and returns only the recovery contract without caching", async () => {
    const supabase = { service: true };
    const jobs = [{ id: "job-1", customer_name: "Mike Shepherd", product_interest: "Shutters", deleted_at: "2026-09-06T17:00:00.000Z" }];
    mocks.requireCrmUser.mockResolvedValue({ supabase });
    mocks.listDeletedCrmJobs.mockResolvedValue(jobs);
    const request = new NextRequest("http://localhost/api/crm/jobs/deleted", { headers: { authorization: "Bearer token" } });

    const response = await GET(request);

    expect(mocks.requireCrmUser).toHaveBeenCalledWith(request);
    expect(mocks.listDeletedCrmJobs).toHaveBeenCalledWith(supabase);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(await response.json()).toEqual({ jobs });
  });
});
