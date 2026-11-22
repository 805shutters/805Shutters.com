import { NextRequest } from "next/server";
import { requestMatchingData, sendMetaEvent } from "@/lib/booking/meta-schedule";
import { marketingPath } from "@/lib/meta-event-context";
import { isMetaBotOrPrefetch } from "@/lib/meta-user-data";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new Response(null, { status: 403 });
  if (request.headers.get("sec-gpc") === "1" || isMetaBotOrPrefetch(request.headers)) return new Response(null, { status: 204 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return new Response(null, { status: 415 });
  const input = await request.json().catch(() => null);
  const pagePath = marketingPath(input?.pagePath);
  if (!pagePath || !["PageView", "Contact"].includes(input.eventName) ||
      typeof input.eventId !== "string" || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(input.eventId)) {
    return new Response(null, { status: 400 });
  }
  try {
    await sendMetaEvent(input.eventName, {
      eventId: input.eventId, eventTime: Math.floor(Date.now() / 1000), pagePath,
      matching: requestMatchingData(request),
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Meta website event failed", input.eventName, error instanceof Error ? error.message : "META_DELIVERY_FAILURE");
    return new Response(null, { status: 502 });
  }
}
