import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { loadPaymentRequestPreview } from "@/lib/crm/payment-request-preview";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireCrmUser(request);
    const paymentType = request.nextUrl.searchParams.get("paymentType");
    if (paymentType !== "deposit" && paymentType !== "balance") {
      throw new CrmAuthError(400, "Choose either a deposit or balance payment link.");
    }
    const { id } = await context.params;
    const preview = await loadPaymentRequestPreview(supabase, id, paymentType);
    return NextResponse.json(preview, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
