import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse } from "@/lib/crm/auth";
import { runStaleQuoteNudges } from "@/lib/crm/follow-ups";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

function requireCronAccess(request: NextRequest) {
  const secret = process.env.FOLLOW_UP_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) return;
  const authorization = request.headers.get("authorization") || "";
  if (authorization !== `Bearer ${secret}`) {
    throw new CrmAuthError(401, "Stale-quotes cron is not authorized.");
  }
}

async function run() {
  try {
    const supabase = getSupabaseServiceClient();
    if (!supabase) throw new CrmAuthError(503, "Database is not configured.");
    const result = await runStaleQuoteNudges(supabase);
    return NextResponse.json(result);
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
