import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse } from "@/lib/crm/auth";
import { runCommercialCampaigns } from "@/lib/crm/commercial-campaigns";
import { syncCommercialReplies } from "@/lib/crm/commercial-replies";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

function requireCronAccess(request: NextRequest) {
  const secret = process.env.FOLLOW_UP_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) return;
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    throw new CrmAuthError(401, "Commercial campaign cron is not authorized.");
  }
}

async function run() {
  try {
    const supabase = getSupabaseServiceClient();
    if (!supabase) throw new CrmAuthError(503, "Database is not configured.");
    let replySync: Record<string, unknown> = { skipped: true };
    let allowFollowUps = false;
    try {
      replySync = await syncCommercialReplies(supabase, "commercial-automation");
      allowFollowUps = true;
    } catch (error) {
      replySync = { skipped: true, error: error instanceof Error ? error.message : "Reply sync failed." };
    }
    const campaign = await runCommercialCampaigns(supabase, { allowFollowUps });
    return NextResponse.json({ replySync, campaign });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

export async function GET(request: NextRequest) {
  requireCronAccess(request);
  return run();
}

export async function POST(request: NextRequest) {
  requireCronAccess(request);
  return run();
}
