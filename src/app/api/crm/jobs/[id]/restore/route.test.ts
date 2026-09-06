import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ requireCrmUser: vi.fn(), restoreDeletedCrmJob: vi.fn() }));

vi.mock("@/lib/crm/auth", () => ({
  requireCrmUser: mocks.requireCrmUser,
  crmAuthErrorResponse: (error: unknown) => NextResponse.json({ message: error instanceof Error ? error.message : "failed" }, { status: 500 })
}));
vi.mock("@/lib/crm/backend", () => ({ restoreDeletedCrmJob: mocks.restoreDeletedCrmJob }));

import { POST } from "./route";

describe("POST restore deleted CRM job", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes the authenticated actor, id, and known deletion timestamp to guarded recovery", async () => {
    const supabase = { service: true };
    const actor = { email: "805@805shutters.com", user: { id: "user-1" } };
    mocks.requireCrmUser.mockResolvedValue({ supabase, ...actor });
    mocks.restoreDeletedCrmJob.mockResolvedValue({ job: { id: "job-1" } });
    const request = new NextRequest("http://localhost/api/crm/jobs/job-1/restore", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer token" },
      body: JSON.stringify({ deleted_at: "2026-09-06T17:00:00.000Z" })
    });

    const response = await POST(request, { params: Promise.resolve({ id: "job-1" }) });

    expect(mocks.requireCrmUser).toHaveBeenCalledWith(request);
    expect(mocks.restoreDeletedCrmJob).toHaveBeenCalledWith(
      supabase,
      "job-1",
      "2026-09-06T17:00:00.000Z",
      { email: actor.email, userId: actor.user.id }
    );
    expect(await response.json()).toEqual({ job: { id: "job-1" } });
  });
});
