import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { listTechnicalMeasureForms, reconcileSoldTechnicalMeasureForms } from "@/lib/crm/technical-measures";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { supabase, email, user, displayName } = await requireCrmUser(request);
    const jobId = request.nextUrl.searchParams.get("jobId");
    const reconciliation = await reconcileSoldTechnicalMeasureForms(
      supabase,
      { email, userId: user.id, displayName },
      jobId,
    );
    const forms = await listTechnicalMeasureForms(supabase, jobId);
    return NextResponse.json({ forms, reconciliation });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
