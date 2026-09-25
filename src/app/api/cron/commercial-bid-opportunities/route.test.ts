import { NextRequest } from "next/server";
import { afterEach, expect, it, vi } from "vitest";
import { processCommercialBidOpportunityInbox } from "@/lib/crm/commercial-bid-opportunities";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { GET, POST } from "./route";

vi.mock("@/lib/crm/commercial-bid-opportunities", () => ({
  processCommercialBidOpportunityInbox: vi.fn()
}));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServiceClient: vi.fn()
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("pauses GET and POST before authentication, database access, or Gmail ingestion", async () => {
  const fetchMock = vi.fn(() => {
    throw new Error("Paused route must not make external calls");
  });
  vi.stubGlobal("fetch", fetchMock);

  for (const handler of [GET, POST]) {
    const request = new NextRequest("https://example.test/api/cron/commercial-bid-opportunities");
    const readAuthHeader = vi.spyOn(request.headers, "get");
    const response = await handler(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      paused: true,
      reason: "Paused pending revision under Plan v2.0 chat-hub model"
    });
    expect(readAuthHeader).not.toHaveBeenCalled();
  }

  expect(getSupabaseServiceClient).not.toHaveBeenCalled();
  expect(processCommercialBidOpportunityInbox).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});
