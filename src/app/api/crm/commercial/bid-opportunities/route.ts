import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { processCommercialBidOpportunityInbox } from "@/lib/crm/commercial-bid-opportunities";
import { COMMERCIAL_BID_PULLER_PAUSED, COMMERCIAL_BID_PAUSE_REASON } from "@/lib/crm/commercial-bid-pause";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    if (COMMERCIAL_BID_PULLER_PAUSED) {
      return NextResponse.json({ paused: true, reason: COMMERCIAL_BID_PAUSE_REASON });
    }

    const payload = await request.json().catch(() => ({}));
    return NextResponse.json(
      await processCommercialBidOpportunityInbox(supabase, {
        actorEmail: email,
        maxResults: typeof payload.maxResults === "number" ? payload.maxResults : undefined
      })
    );
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
