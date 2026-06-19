import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { selectDesign } from "@/lib/crm/quote-builder";

export const runtime = "nodejs";

// POST { designId }: choose which alternative design bills for this window.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const payload = await request.json();
    const designId = typeof payload?.designId === "string" ? payload.designId : "";
    const quote = await selectDesign(supabase, id, designId, { email, userId: user.id });
    return NextResponse.json({ quote });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
