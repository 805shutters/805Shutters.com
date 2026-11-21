import { NextRequest, NextResponse } from "next/server";
import { runPaymentPlanCharges } from "@/lib/crm/payment-plans";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { CrmAuthError, crmAuthErrorResponse } from "@/lib/crm/auth";
export const runtime = "nodejs";
// Deliberately absent from vercel.json. Existing mandates need an explicit owner-reviewed scheduler.
export async function POST(request: NextRequest) {
  try {
    const secret = process.env.PAYMENT_PLAN_CHARGE_SECRET;
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
      throw new CrmAuthError(401, "Saved-card collection is not authorized.");
    if (process.env.LEGACY_SQUARE_AUTOPAY_ENABLED !== "true")
      throw new CrmAuthError(
        409,
        "Legacy card mandates require review before scheduled collection.",
      );
    const db = getSupabaseServiceClient();
    if (!db) throw new CrmAuthError(503, "Database unavailable.");
    return NextResponse.json(await runPaymentPlanCharges(db));
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
