import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse } from "@/lib/crm/auth";
import { runPaymentPlanReminders } from "@/lib/crm/payment-plans";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

function requireCronAccess(request: NextRequest) {
  const secret = process.env.FOLLOW_UP_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) throw new CrmAuthError(503, "Payment-plan recovery secret is not configured.");
  const authorization = request.headers.get("authorization") || "";
  if (authorization !== `Bearer ${secret}`) {
    throw new CrmAuthError(401, "Payment-plan reminder cron is not authorized.");
  }
}

async function run() {
  try {
    const supabase = getSupabaseServiceClient();
    if (!supabase) throw new CrmAuthError(503, "Database is not configured.");
    // Saved-card collection has its own authenticated capability.
    const charges = { status: "separate_charge_endpoint" };
    const reminders = await runPaymentPlanReminders(supabase);
    return NextResponse.json({ charges, reminders });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

export async function GET(request: NextRequest) {
  try { requireCronAccess(request); return await run(); } catch(error) { return crmAuthErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  try { requireCronAccess(request); return await run(); } catch(error) { return crmAuthErrorResponse(error); }
}
