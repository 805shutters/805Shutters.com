import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { isMikePaymentAdminEmail } from "@/lib/crm/allowed-users";
import { loadSquareClearanceReview } from "@/lib/crm/stripe-clearance-review";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    if (!isMikePaymentAdminEmail(email)) {
      throw new CrmAuthError(403, "Only Mike can review Square clearances.");
    }
    const rows = await loadSquareClearanceReview(supabase);
    return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Square clearance review could not be read.") {
      return NextResponse.json({ message: error.message }, { status: 503 });
    }
    return crmAuthErrorResponse(error);
  }
}
