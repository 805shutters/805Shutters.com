import { afterEach, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

it("does not expose configuration outside Preview", async () => {
  vi.stubEnv("VERCEL_ENV", "production");
  const response = await GET();
  expect(response.status).toBe(404);
  expect(await response.text()).toBe("");
});

it("reports presence without returning secret values and rejects production isolation", async () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("META_CAPI_ACCESS_TOKEN", "synthetic-token");
  vi.stubEnv("META_CAPI_TEST_EVENT_CODE", "synthetic-code");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-anon");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://evuxqsaucmvgyuvjpqlo.supabase.co");
  vi.stubEnv("BOOKING_DELIVERY_ENABLED", "false");
  const response = await GET();
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({
    dataset: "549342503537516", capiTokenPresent: true, testEventCodePresent: true,
    isolatedDatabase: false, databaseKeysPresent: true, customerNotificationsEnabled: false,
  });
});
