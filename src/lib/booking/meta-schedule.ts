import { postMetaEvent } from "@/lib/meta-capi";
import {
  clickUserData,
  metaTestEventCode,
  publicEventSourceUrl,
  scheduleMatchingData,
  type MetaUserData,
} from "@/lib/meta-user-data";

export { scheduleMatchingData };

export type SchedulePayload = {
  eventId: string;
  eventTime: number;
  eventSourceUrl?: string;
  matching: { em?: string[]; ph?: string[] };
  fbc?: string;
  fbp?: string;
  client_ip_address?: string;
  client_user_agent?: string;
};

/** An operator-configured reserved contact isolates a production verification run. */
export function isMetaVerificationMatching(matching: SchedulePayload["matching"]) {
  const expected = process.env.META_CAPI_VERIFICATION_EMAIL_SHA256;
  return process.env.VERCEL_ENV === "production" && !!process.env.META_CAPI_TEST_EVENT_CODE &&
    !!expected && /^[a-f0-9]{64}$/.test(expected) && matching.em?.[0] === expected;
}

export function isSyntheticBookingVerification(email: string, phone: string) {
  return email.trim().toLowerCase().endsWith("@example.invalid") &&
    /^(?:1)?[2-9]\d{2}55501\d{2}$/.test(phone.replace(/\D/g, "")) &&
    isMetaVerificationMatching(scheduleMatchingData(email, phone));
}

const SCHEDULE_SOURCE = "https://www.805shutters.com/book-consultation/";

export async function sendMetaScheduleEvent(payload: SchedulePayload) {
  const token = process.env.META_CAPI_ACCESS_TOKEN?.trim();
  const verification = isMetaVerificationMatching(payload.matching);
  const testCode = metaTestEventCode(verification);
  if (!token) throw new Error("META_TOKEN_MISSING");
  if (process.env.VERCEL_ENV === "preview" && !testCode)
    throw new Error("META_PREVIEW_TEST_CODE_MISSING");
  if (!payload.eventId || !Number.isInteger(payload.eventTime))
    throw new Error("META_EVENT_INVALID");
  // Hashes stay on the allowlist. Click signals are separate, unhashed fields.
  const userData: MetaUserData = {};
  for (const key of ["em", "ph"] as const) {
    const values = payload.matching?.[key];
    if (Array.isArray(values) && values.length === 1 && /^[a-f0-9]{64}$/.test(values[0]))
      userData[key] = values;
  }
  Object.assign(userData, clickUserData(payload));
  if (!userData.em && !userData.ph) throw new Error("META_MATCHING_INVALID");
  await postMetaEvent({
    eventName: "Schedule",
    eventId: payload.eventId,
    eventTime: payload.eventTime,
    eventSourceUrl: publicEventSourceUrl(payload.eventSourceUrl, SCHEDULE_SOURCE),
    userData,
    testCode,
    confirmAcceptance: true,
  });
  return { eventName: "Schedule", eventId: payload.eventId, eventsReceived: 1,
    acceptedAt: new Date().toISOString(), testEvent: Boolean(testCode) };
}
