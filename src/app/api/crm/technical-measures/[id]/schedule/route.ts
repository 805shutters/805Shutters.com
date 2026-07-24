import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { setTechnicalMeasureSchedulingStatus } from "@/lib/crm/technical-measures";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email, user, displayName } = await requireCrmUser(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { scheduled?: unknown };
    if (typeof body.scheduled !== "boolean") {
      return NextResponse.json({ message: "Scheduled status is required." }, { status: 400 });
    }
    const form = await setTechnicalMeasureSchedulingStatus(
      supabase,
      id,
      body.scheduled,
      { email, userId: user.id, displayName },
    );
    return NextResponse.json({ form });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
