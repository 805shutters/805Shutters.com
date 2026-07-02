import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { sendQuotePaymentLinkToCustomer } from "@/lib/crm/public-quote";
import {
  sendSalesQuotePaymentLinkToCustomer,
  type SendSalesQuoteOptions,
} from "@/lib/crm/sales-quote-send";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as SendSalesQuoteOptions;
    let result;
    try {
      result = await sendSalesQuotePaymentLinkToCustomer(supabase, id, { email, userId: user.id }, body);
    } catch (error) {
      if (!(error instanceof CrmAuthError) || error.status !== 404) throw error;
      result = await sendQuotePaymentLinkToCustomer(supabase, id, { email, userId: user.id }, {
        email: body.channels?.email,
        sms: body.channels?.sms,
        emailRecipients: body.emails,
        phone: body.phone,
        note: body.note,
      });
    }
    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
