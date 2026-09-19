import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse } from "@/lib/crm/auth";
import { syncSquareFinance } from "@/lib/crm/square-finance";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 120;

function requireCronAccess(request: NextRequest) {
  const secret = process.env.SQUARE_PAYMENT_EMAIL_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) throw new CrmAuthError(503, "Square recovery secret is not configured.");
  if ((request.headers.get("authorization") || "") !== `Bearer ${secret}`) {
    throw new CrmAuthError(401, "Square payment email cron is not authorized.");
  }
}

async function run(request: NextRequest) {
  try {
    requireCronAccess(request);
    const supabase = getSupabaseServiceClient();
    if (!supabase) throw new CrmAuthError(503, "Dedicated Supabase database is not configured.");
    return NextResponse.json(await syncSquareFinance(supabase));
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
