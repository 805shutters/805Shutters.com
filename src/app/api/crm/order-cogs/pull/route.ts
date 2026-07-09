import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await requireCrmUser(request);
    return NextResponse.json({
      disabled: true,
      message: "Order COGS email processing is disabled. Enter COGS directly in the 805 CRM."
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
