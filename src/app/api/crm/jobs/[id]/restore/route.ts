import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { restoreDeletedCrmJob } from "@/lib/crm/backend";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const payload = await request.json() as { deleted_at?: string };
    const result = await restoreDeletedCrmJob(supabase, id, payload.deleted_at || "", { email, userId: user.id });
    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
