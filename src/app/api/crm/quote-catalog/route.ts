import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { buildUiCatalog } from "@/lib/quote/ui-catalog";

export const runtime = "nodejs";

// GET: the selectable product/program/fabric/surcharge/motorization options for
// the builder UI. Auth-gated like the rest of the CRM.
export async function GET(request: NextRequest) {
  try {
    await requireCrmUser(request);
    return NextResponse.json({ catalog: buildUiCatalog() });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
