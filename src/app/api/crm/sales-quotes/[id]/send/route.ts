import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { sendSalesQuoteToCustomer, type SendSalesQuoteOptions } from "@/lib/crm/sales-quote-send";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  let quoteId: string | undefined;
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    quoteId = id;
    const body = (await request.json().catch(() => ({}))) as SendSalesQuoteOptions;
    const result = await sendSalesQuoteToCustomer(supabase, id, { email, userId: user.id }, body);
    console.info("quote_send_result", { quoteId, email: result.email, sms: result.sms });
    return NextResponse.json(result);
  } catch (error) {
    if (quoteId) console.warn("quote_send_failed", { quoteId, status: error instanceof CrmAuthError ? error.status : 500,
      message: error instanceof CrmAuthError ? error.message : "Unexpected quote send error" });
    return crmAuthErrorResponse(error);
  }
}
