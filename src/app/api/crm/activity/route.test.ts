import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireCrmUser: vi.fn(),
  loadCrmActivitySnapshot: vi.fn()
}));

vi.mock("@/lib/crm/auth", () => ({
  requireCrmUser: mocks.requireCrmUser,
  crmAuthErrorResponse: (error: unknown) =>
    NextResponse.json({ message: error instanceof Error ? error.message : "CRM request failed." }, { status: 500 })
}));

vi.mock("@/lib/crm/backend", () => ({
  loadCrmActivitySnapshot: mocks.loadCrmActivitySnapshot
}));

import { GET, dynamic, revalidate, runtime } from "./route";

describe("GET CRM activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCrmUser.mockResolvedValue({ supabase: { service: true } });
    mocks.loadCrmActivitySnapshot.mockResolvedValue({ activityEvents: [], payments: [], warnings: [] });
  });

  it("requires CRM authorization and returns a private no-store snapshot", async () => {
    const request = new NextRequest("http://localhost/api/crm/activity", {
      headers: { authorization: "Bearer test-token" }
    });
    const response = await GET(request);

    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
    expect(revalidate).toBe(0);
    expect(mocks.requireCrmUser).toHaveBeenCalledWith(request);
    expect(mocks.loadCrmActivitySnapshot).toHaveBeenCalledWith({ service: true }, { after: undefined, page: undefined, report: false, raw: false });
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(await response.json()).toEqual({ activityEvents: [], payments: [], warnings: [] });
  });
  it("rejects an invalid cursor before reading history", async () => {
    const response = await GET(new NextRequest("http://localhost/api/crm/activity?page=invalid"));
    expect(response.status).toBe(400);
    expect(mocks.loadCrmActivitySnapshot).not.toHaveBeenCalled();
  });

  it("forwards a validated incremental refresh after authorization", async () => {
    await GET(new NextRequest("http://localhost/api/crm/activity?after=2026-11-22T00:00:00Z&raw=1"));
    expect(mocks.loadCrmActivitySnapshot).toHaveBeenCalledWith({ service: true }, expect.objectContaining({ after: "2026-11-22T00:00:00Z", raw: true }));
  });

});
