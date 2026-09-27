import { NextRequest } from "next/server";
import { META_DATASET_ID } from "./tracking-config";
import { scheduleMatchingData } from "./booking/meta-schedule";

type MetaLeadEvent = {
  eventId: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  interest?: string | null;
  pagePath?: string | null;
};

export async function sendMetaLeadEvent(_request: NextRequest, lead: MetaLeadEvent) {
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!token) return;
  const matching = scheduleMatchingData(lead.email || "", lead.phone || "");
  if (!matching.em && !matching.ph) return;
  const testCode = process.env.VERCEL_ENV === "preview"
    ? process.env.META_CAPI_TEST_EVENT_CODE : undefined;
  const response = await fetch(`https://graph.facebook.com/v23.0/${META_DATASET_ID}/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      data: [{ event_name: "Lead", event_time: Math.floor(Date.now() / 1000),
        event_id: lead.eventId, action_source: "website",
        event_source_url: "https://www.805shutters.com/free-window-treatment-consultation/",
        user_data: matching }],
      ...(testCode ? { test_event_code: testCode } : {}),
    }),
    signal: AbortSignal.timeout(10000),
  }).catch(() => { throw new Error("META_NETWORK_FAILURE"); });
  if (!response.ok) throw new Error(`META_HTTP_${response.status}`);
}
