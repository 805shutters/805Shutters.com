import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { setTechnicalMeasureArchived } from "@/lib/crm/technical-measures";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email, user, displayName } = await requireCrmUser(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { archived?: unknown };
    if (typeof body.archived !== "boolean") {
      return NextResponse.json({ message: "Choose whether to archive or restore this technical measure." }, { status: 400 });
    }
    const form = await setTechnicalMeasureArchived(supabase, id, body.archived, {
      email,
      userId: user.id,
      displayName,
    });
    return NextResponse.json({ form });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
