import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { buildPricingReference } from "@/lib/quote/ui-catalog";
import { buildPricingRestrictionReference } from "@/lib/quote/restriction-reference";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireCrmUser(request);
    return NextResponse.json({
      reference: {
        ...buildPricingReference(),
        restrictions: buildPricingRestrictionReference(),
      },
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
