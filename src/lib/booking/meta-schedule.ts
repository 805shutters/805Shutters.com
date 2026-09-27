import { createHash } from "node:crypto";

import { META_DATASET_ID } from "@/lib/tracking-config";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/** Only these two approved customer fields may leave the server for Schedule. */
export function scheduleMatchingData(email: string, phone: string) {
  const normalizedEmail = email.trim().toLowerCase();
  let normalizedPhone = phone.replace(/\D/g, "");
  if (normalizedPhone.length === 10) normalizedPhone = `1${normalizedPhone}`;
  return {
    ...(normalizedEmail ? { em: [hash(normalizedEmail)] } : {}),
    ...(normalizedPhone ? { ph: [hash(normalizedPhone)] } : {}),
  };
}

export type SchedulePayload = {
  eventId: string;
  eventTime: number;
  matching: { em?: string[]; ph?: string[] };
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

export async function sendMetaScheduleEvent(payload: SchedulePayload) {
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  const testCode = process.env.VERCEL_ENV === "preview" || isMetaVerificationMatching(payload.matching)
    ? process.env.META_CAPI_TEST_EVENT_CODE : undefined;
  if (!token) throw new Error("META_TOKEN_MISSING");
  if (process.env.VERCEL_ENV === "preview" && !testCode)
    throw new Error("META_PREVIEW_TEST_CODE_MISSING");
  if (!payload.eventId || !Number.isInteger(payload.eventTime))
    throw new Error("META_EVENT_INVALID");
  // Reconstruct the allowlist: never spread persisted data into a Meta request.
  const userData: { em?: string[]; ph?: string[] } = {};
  for (const key of ["em", "ph"] as const) {
    const values = payload.matching?.[key];
    if (Array.isArray(values) && values.length === 1 && /^[a-f0-9]{64}$/.test(values[0]))
      userData[key] = values;
  }
  if (!userData.em && !userData.ph) throw new Error("META_MATCHING_INVALID");
  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/v23.0/${META_DATASET_ID}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [{ event_name: "Schedule", event_id: payload.eventId,
          event_time: payload.eventTime, action_source: "website",
          event_source_url: "https://www.805shutters.com/book-consultation/",
          user_data: userData }],
        ...(testCode ? { test_event_code: testCode } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch { throw new Error("META_NETWORK_FAILURE"); }
  if (!response.ok) throw new Error(`META_HTTP_${response.status}`);
  const body = await response.json().catch(() => null);
  if (body?.events_received !== 1) throw new Error("META_ACCEPTANCE_UNCONFIRMED");
  return { eventName: "Schedule", eventId: payload.eventId, eventsReceived: 1,
    acceptedAt: new Date().toISOString(), testEvent: Boolean(testCode) };
}
