import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { ensureShareToken } from "@/lib/crm/public-quote";

export const runtime = "nodejs";

// POST: create (or fetch) the customer-facing share link for a quote.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const share = await ensureShareToken(supabase, id, { email, userId: user.id });
    return NextResponse.json(share);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
