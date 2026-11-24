import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse } from "@/lib/crm/auth";
export const runtime = "nodejs";
// Deliberately absent from vercel.json. Existing mandates need an explicit owner-reviewed scheduler.
export async function POST(request: NextRequest) {
  try {
    const secret = process.env.PAYMENT_PLAN_CHARGE_SECRET;
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
      throw new CrmAuthError(401, "Saved-card collection is not authorized.");
    return NextResponse.json(
      { message: "Legacy saved-card collection is retired. Collect installments through Stripe checkout." },
      { status: 410 },
    );
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
