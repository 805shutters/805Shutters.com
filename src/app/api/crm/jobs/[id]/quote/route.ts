import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { createQuoteForJob } from "@/lib/crm/quote-builder";

export const runtime = "nodejs";

// POST: get-or-create the draft quote for a scheduled job (consultation → quote).
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const result = await createQuoteForJob(supabase, id, { email, userId: user.id });
    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
