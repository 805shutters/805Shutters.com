import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireCrmUser: vi.fn(),
  loadCrmDashboardData: vi.fn()
}));

vi.mock("@/lib/crm/auth", () => ({
  requireCrmUser: mocks.requireCrmUser,
  crmAuthErrorResponse: (error: unknown) =>
    NextResponse.json({ message: error instanceof Error ? error.message : "CRM request failed." }, { status: 500 })
}));

vi.mock("@/lib/crm/backend", () => ({
  createCrmJob: vi.fn(),
  loadCrmDashboardData: mocks.loadCrmDashboardData
}));

import { GET, dynamic, revalidate, runtime } from "./route";

describe("GET CRM dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCrmUser.mockResolvedValue({ supabase: { service: true }, email: "805shutters@gmail.com" });
    mocks.loadCrmDashboardData.mockResolvedValue({ bookkeepingRows: [] });
  });

  it("always returns current private financial data without caching", async () => {
    const request = new NextRequest("http://localhost/api/crm/jobs/", {
      headers: { authorization: "Bearer test-token" }
    });
    const response = await GET(request);

    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
    expect(revalidate).toBe(0);
    expect(mocks.requireCrmUser).toHaveBeenCalledWith(request);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(await response.json()).toEqual({ bookkeepingRows: [] });
  });
});
