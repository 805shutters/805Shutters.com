import { brandIdentity } from "@/lib/brand-identity";
export const confirmationSample = {
  key: "design-b-2026-10-06",
  to: "+18052985555",
  startAt: "2026-10-06T17:00:00.000Z",
  body: "Sample only — no appointment has been booked. Your free in-home consultation with Jessica is confirmed for Tuesday, October 6, 2026 at 10:00 AM Pacific. 805Shutters.com · 805-806-9344.",
};
export const confirmationSampleMedia = [`${brandIdentity.website}/api/booking/confirmation-image/?${new URLSearchParams({start:confirmationSample.startAt})}`];
