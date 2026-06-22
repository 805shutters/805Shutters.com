import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { computeSelectionTotal } from "@/lib/crm/public-quote";
import { crmAuthErrorResponse } from "@/lib/crm/auth";

export const runtime = "nodejs";

// Public (share-token gated): recompute the quote total for a customer's chosen
// subset of line items (the "Purchase some" flow), using the same engine as the
// full quote so the trimmed total the customer sees matches what they're billed.
export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const supabase = getSupabaseServiceClient();
    if (!supabase) return NextResponse.json({ message: "Service temporarily unavailable." }, { status: 503 });
    const { token } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { selectedLineIds?: string[] };
    const result = await computeSelectionTotal(supabase, token, body.selectedLineIds);
    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
