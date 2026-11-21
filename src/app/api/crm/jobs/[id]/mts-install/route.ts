import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, CrmAuthError, requireCrmUser } from "@/lib/crm/auth";
import { upsertJobMtsInstallLink } from "@/lib/crm/mts-install-link-server";

export const runtime = "nodejs";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      throw new CrmAuthError(400, "MTS install link payload must be an object.");
    }
    const link = await upsertJobMtsInstallLink(supabase, id, payload, { email, userId: user.id });
    return NextResponse.json({ link });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
