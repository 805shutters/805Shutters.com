import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { deliverTechnicalMeasureOfficeEmail } from "@/lib/crm/technical-measure-office-email";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireCrmUser(request);
    const { id } = await context.params;
    return NextResponse.json({ email: await deliverTechnicalMeasureOfficeEmail(supabase, id) });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
