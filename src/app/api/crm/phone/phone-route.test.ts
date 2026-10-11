import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";
const mocked = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/crm/auth", () => ({
  requireCrmUser: mocked.auth,
  crmAuthErrorResponse: () =>
    NextResponse.json({ error: "Not authorized" }, { status: 401 }),
}));
import { GET, POST } from "./[...path]/route";
const context = (...path: string[]) => ({ params: Promise.resolve({ path }) });
beforeEach(() => {
  vi.stubEnv(
    "VOICE_805_STAFF_EMAILS_JSON",
    JSON.stringify({
      "805shutters@gmail.com": "mike",
      "khill31@msn.com": "mike",
    }),
  );
  vi.stubEnv("VOICE_805_SERVICE_ORIGIN", "https://phone.example");
  vi.stubEnv("VOICE_805_CONTROL_KEY", "k".repeat(40));
  mocked.auth.mockResolvedValue({
    email: "805shutters@gmail.com",
    supabase: {},
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("Call Center server authorization and CRM linking", () => {
  it("requires authenticated 805 CRM identity before touching the phone service", async () => {
    mocked.auth.mockRejectedValue(new Error("unauthorized"));
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(
      (
        await GET(
          new NextRequest("http://localhost/api/crm/phone/state"),
          context("state"),
        )
      ).status,
    ).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("loads an exact linked customer beyond the dashboard list without exposing metadata", async () => {
    const single = vi.fn(async () => ({
      data: {
        id: "00000000-0000-4000-8000-000000000010",
        display_name: "Older customer",
        phone: "8055550100",
        email: null,
        meta: { private_note: "not exposed" },
      },
      error: null,
    }));
    const eq = vi.fn(() => ({ single }));
    mocked.auth.mockResolvedValue({
      email: "805shutters@gmail.com",
      supabase: { from: () => ({ select: () => ({ eq }) }) },
    });
    const response = await GET(
      new NextRequest(
        "http://localhost/api/crm/phone/customers/00000000-0000-4000-8000-000000000010",
      ),
      context("customers", "00000000-0000-4000-8000-000000000010"),
    );
    expect(response.status).toBe(200);
    expect(eq).toHaveBeenCalledWith(
      "id",
      "00000000-0000-4000-8000-000000000010",
    );
    expect(await response.json()).toEqual({
      id: "00000000-0000-4000-8000-000000000010",
      display_name: "Older customer",
      phone: "8055550100",
      email: null,
    });
  });
  it("denies Ken even if a phone mapping is accidentally supplied", async () => {
    mocked.auth.mockResolvedValue({ email: "khill31@msn.com" });
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(
      (
        await GET(
          new NextRequest("http://localhost/api/crm/phone/state"),
          context("state"),
        )
      ).status,
    ).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("signs the exact staff actor and payload using a server-only key", async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const h = init.headers as Record<string, string>;
      expect(h["X-805-Actor"]).toBe("mike");
      expect(h["X-805-Signature"]).toBe(
        createHmac("sha256", "k".repeat(40))
          .update(
            `GET\n/control\n${h["X-805-Time"]}\n${h["X-805-Nonce"]}\nmike\n`,
          )
          .digest("base64"),
      );
      return Response.json({ calls: [], messages: [] });
    });
    vi.stubGlobal("fetch", fetcher);
    expect(
      (
        await GET(
          new NextRequest("http://localhost/api/crm/phone/state"),
          context("state"),
        )
      ).status,
    ).toBe(200);
  });
  it("does not infer a unique customer from only the first page of customer records", async () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      id: `a${i}`,
      display_name: `Customer ${i}`,
      phone: i === 0 ? "8055550100" : "8055550200",
    }));
    const range = vi.fn(async (start: number) => ({
      data:
        start === 0
          ? rows
          : [
              {
                id: "duplicate",
                display_name: "Shared number",
                phone: "+18055550100",
              },
            ],
      error: null,
    }));
    mocked.auth.mockResolvedValue({
      email: "805shutters@gmail.com",
      supabase: {
        from: () => ({ select: () => ({ order: () => ({ range }) }) }),
      },
    });
    const fetcher = vi.fn(async (_url: string, init: RequestInit) =>
      init.method === "GET"
        ? Response.json({
            calls: [{ id: "call1", from: "+18055550100" }],
            messages: [],
          })
        : Response.json({ updated: 1 }),
    );
    vi.stubGlobal("fetch", fetcher);
    expect(
      (
        await POST(
          new NextRequest("http://localhost/api/crm/phone/sync", {
            method: "POST",
          }),
          context("sync"),
        )
      ).status,
    ).toBe(200);
    expect(range).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(String(fetcher.mock.calls[1][1].body)).links[0],
    ).toMatchObject({ customerId: null, status: "ambiguous" });
  });
  it("does not persist matches if any customer page fails", async () => {
    mocked.auth.mockResolvedValue({
      email: "805shutters@gmail.com",
      supabase: {
        from: () => ({
          select: () => ({
            order: () => ({
              range: async () => ({
                data: null,
                error: { message: "query failed" },
              }),
            }),
          }),
        }),
      },
    });
    const fetcher = vi.fn(async () =>
      Response.json({ calls: [], messages: [] }),
    );
    vi.stubGlobal("fetch", fetcher);
    await POST(
      new NextRequest("http://localhost/api/crm/phone/sync", {
        method: "POST",
      }),
      context("sync"),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
