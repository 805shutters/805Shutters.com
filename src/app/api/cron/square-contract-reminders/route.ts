import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse } from "@/lib/crm/auth";
import { dispatchDueSquareContractReminders } from "@/lib/crm/square-contract-reminders";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

function requireCronAccess(request: NextRequest) {
  const secret = process.env.SQUARE_CONTRACT_REMINDER_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) return;
  if ((request.headers.get("authorization") || "") !== `Bearer ${secret}`) {
    throw new CrmAuthError(401, "Square contract reminder cron is not authorized.");
  }
}

async function run(request: NextRequest) {
  try {
    requireCronAccess(request);
    const supabase = getSupabaseServiceClient();
    if (!supabase) throw new CrmAuthError(503, "Database is not configured.");
    return NextResponse.json(await dispatchDueSquareContractReminders(supabase));
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
