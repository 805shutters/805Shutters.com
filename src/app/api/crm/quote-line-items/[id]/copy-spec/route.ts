import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { copySpecToLineItems } from "@/lib/crm/quote-builder";

export const runtime = "nodejs";

// POST: copy one window's selected-design spec + per-line discount to matching
// product windows in the same quote. Target dimensions stay unchanged.
// Body: { targetIds: string[] }.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { targetIds?: string[] };
    const quote = await copySpecToLineItems(
      supabase,
      id,
      Array.isArray(body.targetIds) ? body.targetIds : [],
      { email, userId: user.id },
    );
    return NextResponse.json({ quote });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
