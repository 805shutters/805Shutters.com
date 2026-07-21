import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { listTechnicalMeasureForms } from "@/lib/crm/technical-measures";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    const forms = await listTechnicalMeasureForms(supabase, request.nextUrl.searchParams.get("jobId"));
    return NextResponse.json({ forms });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
