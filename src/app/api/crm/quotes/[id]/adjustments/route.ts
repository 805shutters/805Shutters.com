import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { updateQuoteAdjustments } from "@/lib/crm/quote-builder";

export const runtime = "nodejs";

// PATCH: set discount/tax/deposit percentages + extra fees on a quote.
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const payload = await request.json();
    const quote = await updateQuoteAdjustments(supabase, id, payload, { email, userId: user.id });
    return NextResponse.json({ quote });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
