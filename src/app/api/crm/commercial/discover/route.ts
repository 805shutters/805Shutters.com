import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { discoverCommercialProspects } from "@/lib/crm/commercial-discovery";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await requireCrmUser(request);
    const payload = (await request.json()) as { searchId?: string; area?: string };
    return NextResponse.json(await discoverCommercialProspects(payload.searchId || "", payload.area || ""));
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
