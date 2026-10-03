import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse } from "@/lib/crm/auth";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { runPaymentPlans } from "@/lib/crm/in-house-plan-processor";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET || process.env.FOLLOW_UP_CRON_SECRET;
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
      throw new CrmAuthError(401, "Not authorized.");
    const db = getSupabaseServiceClient();
    if (!db) throw new CrmAuthError(503, "Database unavailable.");
    return NextResponse.json(await runPaymentPlans(db));
  } catch (e) {
    return crmAuthErrorResponse(e);
  }
}
export const POST = GET;
