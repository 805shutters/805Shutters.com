import { afterEach, expect, it, vi } from "vitest";
import { isBookingDeliveryEnabled } from "./delivery-config";

afterEach(() => vi.unstubAllEnvs());

it.each([
  ["production", undefined, true],
  ["production", "", true],
  ["production", "false", false],
  ["production", "invalid", false],
  ["preview", undefined, false],
  [undefined, undefined, false],
  ["preview", "true", true],
])("delivery configuration: environment=%s override=%s enabled=%s", (environment, override, expected) => {
  vi.stubEnv("VERCEL_ENV", environment);
  vi.stubEnv("BOOKING_DELIVERY_ENABLED", override);
  expect(isBookingDeliveryEnabled()).toBe(expected);
});
