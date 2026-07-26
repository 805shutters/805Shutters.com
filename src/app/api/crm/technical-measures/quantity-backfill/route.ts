import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import {
  applyTechnicalMeasureQuantityBackfill,
  auditTechnicalMeasureQuantityBackfill,
} from "@/lib/crm/technical-measure-quantity-backfill";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    return NextResponse.json({
      report: await auditTechnicalMeasureQuantityBackfill(supabase),
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    const body = await request.json();
    if (body?.confirmation !== "EXPAND_DRAFT_TECHNICAL_MEASURE_QUANTITIES") {
      return NextResponse.json({ message: "Exact quantity-backfill confirmation is required." }, { status: 400 });
    }
    return NextResponse.json({
      result: await applyTechnicalMeasureQuantityBackfill(supabase, email),
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
