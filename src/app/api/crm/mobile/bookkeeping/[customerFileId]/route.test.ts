import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireCrmUser: vi.fn(),
  loadCrmDashboardData: vi.fn()
}));

vi.mock("@/lib/crm/auth", () => ({
  requireCrmUser: mocks.requireCrmUser,
  crmAuthErrorResponse: (error: unknown) =>
    NextResponse.json(
      { message: error instanceof Error ? error.message : "CRM request failed." },
      { status: 500 }
    )
}));

vi.mock("@/lib/crm/backend", () => ({
  loadCrmDashboardData: mocks.loadCrmDashboardData
}));

import { GET } from "./route";

describe("mobile bookkeeping customer detail hydration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCrmUser.mockResolvedValue({ supabase: { service: true }, email: "jessica@805shutters.com" });
    mocks.loadCrmDashboardData.mockResolvedValue({
      customerFiles: [
        {
          id: "customer-file-2",
          customerName: "Populated Customer",
          phone: "805-555-1212",
          email: "customer@example.com",
          address: "100 Main Street",
          city: "Ventura",
          bookkeepingRows: [
            {
              id: "ledger-2",
              total: 9200,
              depositDue: 4600,
              depositPaid: 4600,
              balancePaid: 1100,
              balance: 3500,
              cogs: 2800,
              mikeProfit: 3100,
              remainingProfitBeforeJessica: 3600,
              manufacturerName: "Norman",
              manufacturerOrderRef: "WO-92",
              notes: "Loaded from the ledger"
            }
          ],
          jobs: []
        }
      ]
    });
  });

  it("returns the exact hydrated file with its authoritative bookkeeping fields", async () => {
    const request = new NextRequest(
      "http://localhost/api/crm/mobile/bookkeeping/customer-file-2",
      { headers: { authorization: "Bearer test-token" } }
    );
    const response = await GET(request, {
      params: Promise.resolve({ customerFileId: "customer-file-2" })
    });

    expect(mocks.requireCrmUser).toHaveBeenCalledWith(request);
    expect(mocks.loadCrmDashboardData).toHaveBeenCalledWith({ service: true });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      file: {
        id: "customer-file-2",
        phone: "805-555-1212",
        address: "100 Main Street",
        bookkeepingRows: [
          {
            total: 9200,
            depositDue: 4600,
            depositPaid: 4600,
            balancePaid: 1100,
            balance: 3500,
            cogs: 2800,
            manufacturerName: "Norman",
            manufacturerOrderRef: "WO-92"
          }
        ]
      }
    });
    expect(Object.hasOwn(payload.file.bookkeepingRows[0], "mikeProfit")).toBe(false);
    expect(Object.hasOwn(payload.file.bookkeepingRows[0], "remainingProfitBeforeJessica")).toBe(false);
  });

  it("keeps Mike-linked fields for Mike's own login", async () => {
    mocks.requireCrmUser.mockResolvedValue({ supabase: { service: true }, email: "805shutters@gmail.com" });
    const request = new NextRequest(
      "http://localhost/api/crm/mobile/bookkeeping/customer-file-2",
      { headers: { authorization: "Bearer test-token" } }
    );
    const response = await GET(request, {
      params: Promise.resolve({ customerFileId: "customer-file-2" })
    });
    const payload = await response.json();

    expect(payload.file.bookkeepingRows[0].mikeProfit).toBe(3100);
    expect(payload.file.bookkeepingRows[0].remainingProfitBeforeJessica).toBe(3600);
  });

  it("returns a visible not-found error instead of another customer's data", async () => {
    const request = new NextRequest(
      "http://localhost/api/crm/mobile/bookkeeping/customer-file-missing",
      { headers: { authorization: "Bearer test-token" } }
    );
    const response = await GET(request, {
      params: Promise.resolve({ customerFileId: "customer-file-missing" })
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      message: "That customer financial file is no longer available."
    });
  });
});
