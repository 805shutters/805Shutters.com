import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse } from "@/lib/crm/auth";
import { processCommercialBidOpportunityInbox } from "@/lib/crm/commercial-bid-opportunities";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

// Paused 2026-09-25 pending revision under 805 Commercial Growth Plan v2.0 (chat-hub model).
// Leads are tracked in the Commercial Growth chat; the CRM receives confirmed jobs only.
// Do not re-enable without owner approval.
const COMMERCIAL_BID_PULLER_PAUSED = true;

function requireCronAccess(request: NextRequest) {
  const secret = process.env.COMMERCIAL_BID_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) return;
  if ((request.headers.get("authorization") || "") !== `Bearer ${secret}`) {
    throw new CrmAuthError(401, "Commercial bid monitor is not authorized.");
  }
}

async function run(request: NextRequest) {
  if (COMMERCIAL_BID_PULLER_PAUSED) {
    return NextResponse.json({
      paused: true,
      reason: "Paused pending revision under Plan v2.0 chat-hub model"
    });
  }

  try {
    requireCronAccess(request);
    const supabase = getSupabaseServiceClient();
    if (!supabase) throw new CrmAuthError(503, "Dedicated Supabase database is not configured.");
    return NextResponse.json(await processCommercialBidOpportunityInbox(supabase));
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
