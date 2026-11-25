import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { syncStripeFinance } from "@/lib/crm/stripe-finance";
import { CrmAuthError, crmAuthErrorResponse } from "@/lib/crm/auth";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET(request: NextRequest) {
  try {
    const secret =
      process.env.STRIPE_PAYMENT_CRON_SECRET || process.env.CRON_SECRET;
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
      throw new CrmAuthError(401, "Recovery is not authorized.");
    if (process.env.STRIPE_SYNC_ENABLED !== "true")
      return NextResponse.json({ status: "disabled" });
    const db = getSupabaseServiceClient();
    if (!db) throw new CrmAuthError(503, "Database unavailable.");
    const result = await syncStripeFinance(db);
    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
export const POST = GET;
