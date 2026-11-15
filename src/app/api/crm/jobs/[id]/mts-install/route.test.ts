import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ requireCrmUser: vi.fn(), upsertJobMtsInstallLink: vi.fn() }));

vi.mock("@/lib/crm/auth", () => ({
  requireCrmUser: mocks.requireCrmUser,
  CrmAuthError: class CrmAuthError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  crmAuthErrorResponse: (error: unknown) => NextResponse.json(
    { message: error instanceof Error ? error.message : "failed" },
    { status: error instanceof Error && "status" in error ? Number(error.status) : 500 }
  ),
}));
vi.mock("@/lib/crm/mts-install-link-server", () => ({ upsertJobMtsInstallLink: mocks.upsertJobMtsInstallLink }));

import { PUT } from "./route";

describe("PUT MTS install link", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts the authenticated summary for that job", async () => {
    const supabase = { service: true };
    mocks.requireCrmUser.mockResolvedValue({ supabase, email: "805 Financial", user: { id: "user-1" } });
    mocks.upsertJobMtsInstallLink.mockResolvedValue({ job_id: "job-1", charge_basis: "invoiced" });
    const body = { match_basis: "contract_number", charge_amount: 500, charge_basis: "invoiced" };
    const request = new NextRequest("http://localhost/api/crm/jobs/job-1/mts-install", {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: "Bearer token" },
      body: JSON.stringify(body),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: "job-1" }) });

    expect(mocks.upsertJobMtsInstallLink).toHaveBeenCalledWith(
      supabase,
      "job-1",
      body,
      { email: "805 Financial", userId: "user-1" }
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ link: { job_id: "job-1", charge_basis: "invoiced" } });
  });
});
