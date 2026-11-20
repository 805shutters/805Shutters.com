import { NextRequest } from "next/server";
import { META_DATASET_ID } from "./tracking-config";
import {
  buildMetaUserData,
  cleanEventId,
  metaClickFromRequest,
  metaTestEventCode,
  publicEventSourceUrl,
  type MetaUserData,
} from "./meta-user-data";

type MetaLeadEvent = {
  eventId: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  interest?: string | null;
  pagePath?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  fbclid?: string | null;
};

const LEAD_SOURCE = "https://www.805shutters.com/free-window-treatment-consultation/";

// No Limited Data Use / data_processing_options flag is configured. Nothing
// here adds or strips one; there is no existing California LDU setting to keep.
export async function postMetaEvent(input: {
  eventName: "Lead" | "Schedule" | "PageView" | "Contact";
  eventId: string;
  eventTime: number;
  eventSourceUrl: string;
  userData: MetaUserData;
  testCode?: string;
  confirmAcceptance: boolean;
}) {
  const token = process.env.META_CAPI_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("META_TOKEN_MISSING");
  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/v23.0/${META_DATASET_ID}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [{
          event_name: input.eventName,
          event_time: input.eventTime,
          event_id: input.eventId,
          action_source: "website",
          event_source_url: input.eventSourceUrl,
          user_data: input.userData,
        }],
        ...(input.testCode ? { test_event_code: input.testCode } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error("META_NETWORK_FAILURE");
  }
  if (!response.ok) throw new Error(`META_HTTP_${response.status}`);
  if (!input.confirmAcceptance) return;
  const body = await response.json().catch(() => null);
  if (body?.events_received !== 1) throw new Error("META_ACCEPTANCE_UNCONFIRMED");
}

export async function sendMetaLeadEvent(request: NextRequest, lead: MetaLeadEvent) {
  const token = process.env.META_CAPI_ACCESS_TOKEN?.trim();
  if (!token) {
    console.error("Meta Lead not sent", { code: "META_TOKEN_MISSING" });
    return;
  }
  const eventId = cleanEventId(lead.eventId);
  if (!eventId) return;
  const userData = buildMetaUserData({
    email: lead.email,
    phone: lead.phone,
    click: metaClickFromRequest(request, lead),
  });
  if (!userData.em && !userData.ph) return;
  const pageUrl = lead.pagePath
    ? publicEventSourceUrl(`https://www.805shutters.com${lead.pagePath}`, LEAD_SOURCE)
    : publicEventSourceUrl(request.headers.get("referer"), LEAD_SOURCE);
  await postMetaEvent({
    eventName: "Lead",
    eventId,
    eventTime: Math.floor(Date.now() / 1000),
    eventSourceUrl: pageUrl,
    userData,
    testCode: metaTestEventCode(false),
    confirmAcceptance: false,
  });
}

export async function sendMetaBrowserEvent(
  request: NextRequest,
  input: { eventName: "PageView" | "Contact"; eventId: unknown; pageUrl?: unknown; fbp?: unknown; fbc?: unknown; fbclid?: unknown },
) {
  const eventId = cleanEventId(input.eventId);
  if (!eventId) throw new Error("META_EVENT_INVALID");
  const fallback = "https://www.805shutters.com/";
  await postMetaEvent({
    eventName: input.eventName,
    eventId,
    eventTime: Math.floor(Date.now() / 1000),
    eventSourceUrl: publicEventSourceUrl(typeof input.pageUrl === "string" ? input.pageUrl : request.headers.get("referer"), fallback),
    userData: metaClickFromRequest(request, input),
    testCode: metaTestEventCode(false),
    confirmAcceptance: true,
  });
}
