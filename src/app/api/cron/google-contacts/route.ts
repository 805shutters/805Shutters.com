import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse } from "@/lib/crm/auth";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { processContactsQueue } from "@/lib/crm/google-contacts-sync";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) throw new CrmAuthError(401,"Contacts cron is not authorized.");
    const supabase = getSupabaseServiceClient();
    if (!supabase) throw new CrmAuthError(503,"805 database is unavailable.");
    return NextResponse.json(await processContactsQueue(supabase));
  } catch (error) { return crmAuthErrorResponse(error); }
}
