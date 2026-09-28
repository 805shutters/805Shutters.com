import { expect, it, vi } from "vitest";
const send = vi.hoisted(() => vi.fn());
vi.mock("@/lib/notify/meta-booking-sms", () => ({ sendMetaBookingSms: send }));
import { POST } from "./route";
it("retires cached click-alert requests without sending any SMS", async () => {
  const response = await POST();
  expect(response.status).toBe(410);
  expect(await response.json()).toEqual({ sent: false, skipped: "booking_required" });
  expect(send).not.toHaveBeenCalled();
});
