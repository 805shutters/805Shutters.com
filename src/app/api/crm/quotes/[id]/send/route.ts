import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { sendQuoteToCustomer } from "@/lib/crm/public-quote";

export const runtime = "nodejs";

// POST: text and/or email the customer their quote link and mark the quote "sent".
// Body (optional): { channels: { email?: boolean, sms?: boolean } } — defaults to both.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { channels?: { email?: boolean; sms?: boolean }; expectedRecipients?: { email?: string | null; sms?: string | null } };
    const result = await sendQuoteToCustomer(supabase, id, { email, userId: user.id }, { ...body.channels, expectedRecipients: body.expectedRecipients });
    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
