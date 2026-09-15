import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse } from "@/lib/crm/auth";
import { runWeeklySalesSms } from "@/lib/crm/weekly-sales-sms";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
      throw new CrmAuthError(401, "Weekly sales cron is not authorized.");
    }
    const supabase = getSupabaseServiceClient();
    if (!supabase) throw new CrmAuthError(503, "Database is not configured.");
    const result = await runWeeklySalesSms(supabase);
    return NextResponse.json(result, { status: result.failed ? 502 : 200 });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
