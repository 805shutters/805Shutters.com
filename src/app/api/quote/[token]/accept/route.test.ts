import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { CrmAuthError } from "@/lib/crm/auth";
const mocks = vi.hoisted(() => ({ accept: vi.fn(), status: vi.fn(), after: vi.fn(), client: {} }));
vi.mock("next/server", async original => ({ ...await original<typeof import("next/server")>(), after: mocks.after }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServiceClient: () => mocks.client }));
vi.mock("@/lib/crm/public-quote", () => ({ acceptPublicQuote: mocks.accept, publicQuoteSigningStatus: mocks.status }));
import { GET, POST } from "./route";
const context = { params: Promise.resolve({ token: "synthetic-token" }) };
const valid = { printedName: "Synthetic Customer", signature: "Synthetic Customer", acknowledgedTotal: 450 };
const request = (body: unknown) => new NextRequest("http://localhost/api/quote/synthetic-token/accept", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); });
describe("public acceptance boundary", () => {
  it.each([{}, { ...valid, signature: " " }, { ...valid, acknowledgedTotal: null }, { ...valid, selectedLineIds: [42] }, { ...valid, acknowledgedTotal: 0 }])("rejects malformed consent without signing: %j", async body => {
    const response = await POST(request(body), context);
    expect(response.status).toBe(400);
    expect(mocks.accept).not.toHaveBeenCalled();
    expect(mocks.status).not.toHaveBeenCalled();
  });
  it("returns saved success", async () => {
    mocks.accept.mockResolvedValueOnce({ ok: true, alreadySigned: false });
    expect(await (await POST(request(valid), context)).json()).toEqual({ ok: true, alreadySigned: false });
  });
  it("confirms a saved signature after downstream failure and schedules idempotent convergence", async () => {
    mocks.accept.mockRejectedValueOnce(new CrmAuthError(502, "artifact failed")).mockResolvedValueOnce({ ok: true, alreadySigned: true });
    mocks.status.mockResolvedValueOnce({ signed: true, signedAt: "2026-09-24T01:00:00Z" });
    const response = await POST(request(valid), context);
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ ok: true, followUpPending: true });
    expect(mocks.after).toHaveBeenCalledTimes(1);
    await mocks.after.mock.calls[0][0]();
    expect(mocks.accept).toHaveBeenCalledTimes(2);
  });
  it("never converts an unconfirmed database failure to success", async () => {
    mocks.accept.mockRejectedValueOnce(new CrmAuthError(502, "save failed"));
    mocks.status.mockResolvedValueOnce({ signed: false, signedAt: null });
    expect((await POST(request(valid), context)).status).toBe(502);
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("keeps conflicts as conflicts without scheduling a new acceptance", async () => {
    mocks.accept.mockRejectedValueOnce(new CrmAuthError(409, "different option signed"));
    expect((await POST(request(valid), context)).status).toBe(409);
    expect(mocks.status).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("provides uncached read-only confirmation", async () => {
    mocks.status.mockResolvedValueOnce({ signed: true, signedAt: "2026-09-24T01:00:00Z" });
    const response = await GET(new NextRequest("http://localhost"), context);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await response.json()).signed).toBe(true);
    expect(mocks.accept).not.toHaveBeenCalled();
  });
});
