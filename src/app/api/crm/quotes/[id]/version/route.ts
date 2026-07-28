import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { createQuoteVersion } from "@/lib/crm/quote-groups";

export const runtime = "nodejs";

// POST: create a new whole-quote version (alternative) in this quote's group.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { copyCurrent?: unknown };
    const copyCurrent = body.copyCurrent !== false;
    const result = await createQuoteVersion(
      supabase,
      id,
      { email, userId: user.id },
      { copyCurrent },
    );
    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
