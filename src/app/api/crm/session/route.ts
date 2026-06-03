import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, getAllowedCrmEmails, requireCrmUser } from "@/lib/crm/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { email, displayName } = await requireCrmUser(request);

    return NextResponse.json({
      email,
      displayName,
      allowedEmails: getAllowedCrmEmails()
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
