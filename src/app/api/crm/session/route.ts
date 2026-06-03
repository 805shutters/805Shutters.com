import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, getAllowedCrmEmails, getVaCrmEmails, requireCrmUser } from "@/lib/crm/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { email, displayName, role } = await requireCrmUser(request);

    return NextResponse.json({
      email,
      displayName,
      role,
      allowedEmails: getAllowedCrmEmails(),
      vaEmails: getVaCrmEmails()
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
