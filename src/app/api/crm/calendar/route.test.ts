import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/crm/auth", () => ({
  requireCrmUser: mocks.auth,
  CrmAuthError: class extends Error { constructor(public status: number, message: string) { super(message); } },
  crmAuthErrorResponse: (error: { status?: number; message: string }) => NextResponse.json({ message: error.message }, { status: error.status || 500 })
}));
vi.mock("@/lib/crm/backend", () => ({ cancelCrmCalendarEvent: vi.fn(), createCrmCalendarEvent: vi.fn(), rescheduleCrmCalendarEvent: vi.fn() }));
vi.mock("@/lib/crm/calendar-read", () => ({ loadCalendarSnapshot: mocks.read }));
import { GET } from "./route";
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ supabase: "authorized-client" }); mocks.read.mockResolvedValue({ events: [], jobs: [] }); });
it("authenticates before reading a private, LA-date-bounded calendar", async () => {
  const request = new NextRequest("http://localhost/api/crm/calendar?start=2026-11-22&end=2026-11-29");
  const response = await GET(request);
  expect(mocks.auth).toHaveBeenCalledWith(request);
  expect(mocks.read).toHaveBeenCalledWith("authorized-client", "2026-11-22T08:00:00.000Z", "2026-11-29T08:00:00.000Z");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("server-timing")).toMatch(/auth;dur=.*data;dur=/);
  expect(await response.json()).toEqual({ events: [], jobs: [] });
});
it("never reads calendar data when authorization fails", async () => {
  mocks.auth.mockRejectedValue({ status: 403, message: "Not allowed" });
  expect((await GET(new NextRequest("http://localhost/api/crm/calendar?start=2026-11-22&end=2026-11-29"))).status).toBe(403);
  expect(mocks.read).not.toHaveBeenCalled();
});
it("rejects an unbounded date range before reading records", async () => {
  expect((await GET(new NextRequest("http://localhost/api/crm/calendar?start=2026-01-01&end=2026-11-29"))).status).toBe(400);
  expect(mocks.read).not.toHaveBeenCalled();
});
