import { NextRequest, NextResponse } from "next/server";
import { completeMeasureNeededForJob, requestMeasureNeededForJob } from "@/lib/crm/measure-needed";
import { CrmAuthError, crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { action?: string };
    const actor = { email, userId: user.id };

    if (body.action === "measured") {
      return NextResponse.json(await completeMeasureNeededForJob(supabase, id, actor));
    }

    if (!body.action || body.action === "request") {
      return NextResponse.json(await requestMeasureNeededForJob(supabase, id, actor, "manual"));
    }

    throw new CrmAuthError(400, "Unsupported measure-needed action.");
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
