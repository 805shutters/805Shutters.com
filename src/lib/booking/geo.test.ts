import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { geocodeBookingAddress } from "./geo";
import { GET } from "@/app/api/booking/availability/route";

const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServiceClient: () => ({ rpc: state.rpc }),
}));

beforeEach(() => {
  vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key-never-log");
  vi.spyOn(console, "error").mockImplementation(() => {});
  state.rpc.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const request = () => GET(new NextRequest(
  "https://example.test/api/booking/availability?month=2026-10&windowCount=5&address=601%20Carmen%20Drive",
));

describe("booking address service failures", () => {
  it.each([403, 429, 500])("returns service unavailable for Google HTTP %i without blaming the address", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        message: "private address and test-key-never-log",
        details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "BILLING_DISABLED" }],
      },
    }), { status })));
    const response = await request();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      message: "We couldn't check appointment availability right now. Please try again shortly or call/text 805-806-9344 to book.",
    });
    expect(state.rpc).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(`[booking] Google Places text search failed (HTTP ${status}; BILLING_DISABLED)`);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("test-key-never-log");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private address");
  });

  it("handles non-JSON upstream errors as service failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Bad gateway", { status: 502 })));
    expect((await request()).status).toBe(503);
    expect(console.error).toHaveBeenCalledWith("[booking] Google Places text search failed (HTTP 502; UNKNOWN)");
  });

  it("keeps genuine address misses as customer-correctable errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ places: [] })));
    const response = await request();
    expect(response.status).toBe(400);
    expect((await response.json()).message).toContain("complete, unambiguous street address");
  });

  it("still resolves a unique street address", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ places: [{
      formattedAddress: "601 Carmen Drive, Camarillo, CA",
      addressComponents: [{ types: ["street_number"] }, { types: ["route"] }],
      location: { latitude: 34.2, longitude: -119 },
    }] })));
    expect(await geocodeBookingAddress("601 Carmen Drive")).toEqual({
      configured: true,
      point: { lat: 34.2, lng: -119 },
      formattedAddress: "601 Carmen Drive, Camarillo, CA",
    });
  });
});
