import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireCrmUser: vi.fn(),
  repair: vi.fn(),
}));

vi.mock("@/lib/crm/auth", () => ({
  requireCrmUser: mocks.requireCrmUser,
  crmAuthErrorResponse: (error: unknown) =>
    NextResponse.json(
      { message: error instanceof Error ? error.message : "CRM request failed." },
      { status: 500 },
    ),
}));
vi.mock("@/lib/crm/historical-partial-repair", () => ({
  repairHistoricalPartialAcceptance: mocks.repair,
}));

import { POST } from "./route";

describe("POST historical partial repair", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCrmUser.mockResolvedValue({
      supabase: { service: true },
      email: "805@805shutters.com",
      user: { id: "actor-id" },
    });
    mocks.repair.mockResolvedValue({ mode: "dryRun" });
  });

  it("authenticates and passes the exact request to the guarded repair service", async () => {
    const body = { mode: "dryRun", selectedLineIds: ["line-id"] };
    const request = new NextRequest("http://localhost/api/crm/quotes/quote-id/historical-partial-repair", {
      method: "POST",
      headers: { authorization: "Bearer session", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const response = await POST(request, { params: Promise.resolve({ id: "quote-id" }) });
    expect(mocks.requireCrmUser).toHaveBeenCalledWith(request);
    expect(mocks.repair).toHaveBeenCalledWith(
      { service: true },
      "quote-id",
      body,
      { email: "805@805shutters.com", userId: "actor-id" },
    );
    expect(response.status).toBe(200);
  });
});
