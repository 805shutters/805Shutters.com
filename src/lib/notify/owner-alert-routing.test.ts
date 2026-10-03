import { afterEach, expect, it, vi } from "vitest";
import { isMikeAlertRecipient } from "./owner-alert-routing";
afterEach(() => vi.unstubAllEnvs());
it("matches only the configured personal owner recipient in staff alert lists", () => {
  vi.stubEnv("MIKE_805_SALES_SMS_NUMBER", "+18055550100");
  expect(isMikeAlertRecipient("(805) 555-0100")).toBe(true);
  expect(isMikeAlertRecipient("+18055550101")).toBe(false);
  expect(isMikeAlertRecipient("+18057931853")).toBe(false);
});
it("does not guess a personal recipient when configuration is absent or invalid", () => {
  vi.stubEnv("MIKE_805_SALES_SMS_NUMBER", "");
  expect(isMikeAlertRecipient("8058069344")).toBe(false);
  vi.stubEnv("MIKE_805_SALES_SMS_NUMBER", "invalid");
  expect(isMikeAlertRecipient("invalid")).toBe(false);
});
