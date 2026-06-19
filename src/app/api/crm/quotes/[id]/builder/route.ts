import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { createLineItem, loadQuoteBuilder } from "@/lib/crm/quote-builder";
import { listQuoteVersions } from "@/lib/crm/quote-groups";

export const runtime = "nodejs";

// GET: load a quote with its line items + designs (the builder view) and its
// sibling whole-quote versions (if any).
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireCrmUser(request);
    const { id } = await context.params;
    const [quote, versions] = await Promise.all([loadQuoteBuilder(supabase, id), listQuoteVersions(supabase, id)]);
    return NextResponse.json({ quote, versions });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

// POST: add a line item (window/opening) to the quote.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const payload = await request.json();
    const quote = await createLineItem(supabase, { ...payload, quote_id: id }, { email, userId: user.id });
    return NextResponse.json({ quote });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
