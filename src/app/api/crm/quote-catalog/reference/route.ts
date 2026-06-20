import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { buildPricingReference } from "@/lib/quote/ui-catalog";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireCrmUser(request);
    return NextResponse.json({ reference: buildPricingReference() });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
