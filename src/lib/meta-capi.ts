import { NextRequest } from "next/server";

import { requestMatchingData, scheduleMatchingData, sendMetaEvent } from "./booking/meta-schedule";

type MetaLeadEvent = {
  eventId: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  interest?: string | null;
  pagePath?: string | null;
};

export async function sendMetaLeadEvent(request: NextRequest, lead: MetaLeadEvent) {
  if (request.headers.get("sec-gpc") === "1") return;
  return sendMetaEvent("Lead", {
    eventId: lead.eventId,
    eventTime: Math.floor(Date.now() / 1000),
    pagePath: lead.pagePath || "/free-window-treatment-consultation/",
    matching: { ...scheduleMatchingData(lead.email || "", lead.phone || ""), ...requestMatchingData(request) },
  });
}
