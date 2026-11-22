import { isIP } from "node:net";
import type { NextRequest } from "next/server";
import { marketingPath, metaOrigin } from "../meta-event-context";
import { createHash } from "node:crypto";
import { resolveFbc } from "@/lib/meta-click";
import { metaTestEventCode } from "@/lib/meta-user-data";

import { META_DATASET_ID } from "@/lib/tracking-config";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/** Normalize the two contact identifiers before hashing. */
export function scheduleMatchingData(email: string, phone: string) {
  const normalizedEmail = email.trim().toLowerCase();
  let normalizedPhone = phone.replace(/\D/g, "");
  if (normalizedPhone.length === 10) normalizedPhone = `1${normalizedPhone}`;
  return {
    ...(normalizedEmail ? { em: [hash(normalizedEmail)] } : {}),
    ...(normalizedPhone ? { ph: [hash(normalizedPhone)] } : {}),
  };
}

type Matching = ReturnType<typeof scheduleMatchingData> & {
  fbc?: string;
  fbp?: string;
  client_ip_address?: string;
  client_user_agent?: string;
};

function browserFields(input: Matching) {
  const result: Matching = {};
  if (typeof input.fbc === "string" && /^fb\.\d+\.\d{10,13}\.[A-Za-z0-9_-]{1,500}$/.test(input.fbc)) result.fbc = input.fbc;
  if (typeof input.fbp === "string" && /^fb\.\d+\.\d{10,13}\.\d{1,30}$/.test(input.fbp)) result.fbp = input.fbp;
  if (input.client_ip_address && isIP(input.client_ip_address)) result.client_ip_address = input.client_ip_address;
  if (typeof input.client_user_agent === "string" && input.client_user_agent.trim()) result.client_user_agent = input.client_user_agent.slice(0, 512);
  return result;
}

export function requestMatchingData(
  request: NextRequest,
  body?: { fbp?: unknown; fbc?: unknown; fbclid?: unknown },
  nowMs = Date.now(),
) {
  const text = (value: unknown) => (typeof value === "string" ? value : undefined);
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return browserFields({
    fbc: resolveFbc(
      [
        { fbc: request.cookies.get("_fbc")?.value, fbclid: request.cookies.get("805_fbclid")?.value },
        { fbc: text(body?.fbc), fbclid: text(body?.fbclid) },
      ],
      nowMs,
    ),
    fbp: request.cookies.get("_fbp")?.value || text(body?.fbp),
    client_ip_address: forwarded || request.headers.get("x-real-ip")?.trim(),
    client_user_agent: request.headers.get("user-agent") ?? undefined,
  });
}

export type SchedulePayload = {
  eventId: string;
  eventTime: number;
  matching: Matching;
  pagePath?: string;
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
  return sendMetaEvent("Schedule", payload);
}

export async function sendMetaEvent(eventName: "Schedule" | "Lead" | "Contact" | "PageView", payload: SchedulePayload) {
  const token = process.env.META_CAPI_ACCESS_TOKEN?.trim();
  const testCode = metaTestEventCode(isMetaVerificationMatching(payload.matching));
  if (!token) throw new Error("META_TOKEN_MISSING");
  if (process.env.VERCEL_ENV === "preview" && !testCode)
    throw new Error("META_PREVIEW_TEST_CODE_MISSING");
  if (!payload.eventId || !Number.isInteger(payload.eventTime))
    throw new Error("META_EVENT_INVALID");
  // Reconstruct the allowlist: never spread persisted data into a Meta request.
  const userData = browserFields(payload.matching);
  for (const key of ["em", "ph"] as const) {
    const values = payload.matching?.[key];
    if (Array.isArray(values) && values.length === 1 && /^[a-f0-9]{64}$/.test(values[0]))
      userData[key] = values;
  }
  if (!Object.keys(userData).length || ((eventName === "Schedule" || eventName === "Lead") && !userData.em && !userData.ph)) throw new Error("META_MATCHING_INVALID");
  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/v23.0/${META_DATASET_ID}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [{ event_name: eventName, event_id: payload.eventId,
          event_time: payload.eventTime, action_source: "website",
          event_source_url: metaOrigin + (marketingPath(payload.pagePath) ?? "/book-consultation/"),
          user_data: userData }],
        ...(testCode ? { test_event_code: testCode } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch { throw new Error("META_NETWORK_FAILURE"); }
  if (!response.ok) throw new Error(`META_HTTP_${response.status}`);
  const body = await response.json().catch(() => null);
  if (body?.events_received !== 1) throw new Error("META_ACCEPTANCE_UNCONFIRMED");
  return { eventName, eventId: payload.eventId, eventsReceived: 1,
    acceptedAt: new Date().toISOString(), testEvent: Boolean(testCode) };
}
