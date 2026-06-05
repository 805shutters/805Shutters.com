import { NextRequest, NextResponse } from "next/server";
import { updateCrmJob } from "@/lib/crm/backend";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const payload = await request.json();
    const job = await updateCrmJob(supabase, id, payload, { email, userId: user.id });

    return NextResponse.json({ job });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
