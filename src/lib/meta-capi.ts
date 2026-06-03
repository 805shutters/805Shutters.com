import { createHash } from "crypto";
import { NextRequest } from "next/server";

type MetaLeadEvent = {
  eventId: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  interest?: string | null;
  pagePath?: string | null;
};

function hashValue(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  return createHash("sha256").update(normalized).digest("hex");
}

function clientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim();
  }
  return request.headers.get("x-real-ip") || undefined;
}

function eventSourceUrl(request: NextRequest, pagePath?: string | null) {
  const referrer = request.headers.get("referer");
  if (referrer) {
    return referrer;
  }
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.805shutters.com";
  return `${baseUrl}${pagePath || "/free-window-treatment-consultation/"}`;
}

export async function sendMetaLeadEvent(request: NextRequest, lead: MetaLeadEvent) {
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  const pixelId = process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID;

  if (!accessToken || !pixelId) {
    return;
  }

  const endpoint = new URL(`https://graph.facebook.com/v20.0/${pixelId}/events`);
  endpoint.searchParams.set("access_token", accessToken);

  const testEventCode = process.env.META_CAPI_TEST_EVENT_CODE;
  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: "Lead",
        event_time: Math.floor(Date.now() / 1000),
        event_id: lead.eventId,
        action_source: "website",
        event_source_url: eventSourceUrl(request, lead.pagePath),
        user_data: {
          client_ip_address: clientIp(request),
          client_user_agent: request.headers.get("user-agent") || undefined,
          em: hashValue(lead.email),
          ph: hashValue(lead.phone),
          fbp: request.cookies.get("_fbp")?.value,
          fbc: request.cookies.get("_fbc")?.value
        },
        custom_data: {
          content_name: "Free Window Treatment Consultation",
          content_category: "window_treatments",
          currency: "USD",
          value: 1,
          city: lead.city || undefined,
          interest: lead.interest || undefined
        }
      }
    ]
  };

  if (testEventCode) {
    payload.test_event_code = testEventCode;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Meta CAPI Lead event failed: ${response.status} ${body}`);
  }
}
