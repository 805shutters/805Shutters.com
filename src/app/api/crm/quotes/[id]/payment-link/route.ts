import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { sendQuotePaymentLinkToCustomer } from "@/lib/crm/public-quote";

export const runtime = "nodejs";

// POST: text and/or email the customer a payment link for the existing public quote page.
// Body (optional): { channels: { email?: boolean, sms?: boolean } } - defaults to both.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      channels?: { email?: boolean; sms?: boolean };
      emailRecipients?: string[];
      phone?: string | null;
      note?: string | null;
    };
    const result = await sendQuotePaymentLinkToCustomer(supabase, id, { email, userId: user.id }, {
      email: body.channels?.email,
      sms: body.channels?.sms,
      emailRecipients: body.emailRecipients,
      phone: body.phone,
      note: body.note,
    });
    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
