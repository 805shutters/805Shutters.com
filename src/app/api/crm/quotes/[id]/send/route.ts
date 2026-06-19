import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { sendQuoteToCustomer } from "@/lib/crm/public-quote";

export const runtime = "nodejs";

// POST: text + email the customer their quote link and mark the quote "sent".
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const result = await sendQuoteToCustomer(supabase, id, { email, userId: user.id });
    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
