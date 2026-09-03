import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { updateJobTrackingStage } from "@/lib/crm/job-tracking-workflow";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const body: unknown = await request.json().catch(() => {
      throw new CrmAuthError(400, "A valid job tracking update is required.");
    });
    return NextResponse.json(await updateJobTrackingStage(supabase, body, { email, userId: user.id }));
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
