import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { loadTechnicalMeasureForm, saveTechnicalMeasureDraft } from "@/lib/crm/technical-measures";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireCrmUser(request);
    const { id } = await context.params;
    return NextResponse.json({ form: await loadTechnicalMeasureForm(supabase, id) });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email, user, displayName } = await requireCrmUser(request);
    const { id } = await context.params;
    const body = await request.json();
    const form = await saveTechnicalMeasureDraft(supabase, id, body, { email, userId: user.id, displayName });
    return NextResponse.json({ form });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
