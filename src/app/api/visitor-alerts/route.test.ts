import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ insert: vi.fn(async (_row: unknown) => ({ error: null })), telegram: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServiceClient: () => ({ from: () => ({ insert: mocks.insert }) }) }));
vi.mock("@/lib/notify/telegram", () => ({ sendTelegramMessage: mocks.telegram }));
import { POST } from "./route";
afterEach(() => vi.clearAllMocks());
it.each([
  [{ utm: { source: "facebook" } }, "Facebook/Instagram"],
  [{ utm: { source: "facebook" }, referrer: "https://l.instagram.com/" }, "Instagram"],
  [{ href: "https://www.805shutters.com/?fbclid=real-click" }, "Facebook/Instagram"],
])("queues Meta visits for the daily report without sending an immediate alert", async (attribution, source) => {
  const response = await POST(new NextRequest("https://www.805shutters.com/api/visitor-alerts/", {
    method: "POST", headers: { origin: "https://www.805shutters.com", "user-agent": "Mozilla/5.0" },
    body: JSON.stringify({ event: "start", path: "/book-consultation/", ...attribution }),
  }));
  expect(await response.json()).toEqual({ sent: false, queued: true });
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ action: "visitor_alert_queued", metadata: expect.objectContaining({ source }) }));
  expect(mocks.telegram).not.toHaveBeenCalled();
});
