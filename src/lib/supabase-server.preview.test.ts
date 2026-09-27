import { afterEach, expect, it, vi } from "vitest";
const createClient = vi.hoisted(() => vi.fn(() => ({ isolated: true })));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
import { getSupabaseServiceClient } from "./supabase-server";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it.each(["https://evuxqsaucmvgyuvjpqlo.supabase.co", "invalid-url", ""])("blocks preview server access to %s", url => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-key");
  expect(getSupabaseServiceClient()).toBeNull();
  expect(createClient).not.toHaveBeenCalled();
});
it("allows an isolated staging URL in preview", () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://staging.example.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-key");
  expect(getSupabaseServiceClient()).toEqual({ isolated: true });
});
