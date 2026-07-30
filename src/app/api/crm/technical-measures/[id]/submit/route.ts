import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { submitTechnicalMeasureWithoutAddendum } from "@/lib/crm/technical-measures";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email, user, displayName } = await requireCrmUser(request);
    const { id } = await context.params;
    const body = await request.json().catch(() => ({})) as {
      installationDurationMinutes?: unknown;
    };
    const form = await submitTechnicalMeasureWithoutAddendum(
      supabase,
      id,
      { email, userId: user.id, displayName },
      body,
    );
    return NextResponse.json({ form });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
