import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, getAllowedCrmEmails, requireCrmUser } from "@/lib/crm/auth";

import { isKenCrmEmail } from "@/lib/crm/allowed-users";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { email, displayName } = await requireCrmUser(request);

    return NextResponse.json({
      email,
      displayName,
      allowedEmails: isKenCrmEmail(email) ? [email] : getAllowedCrmEmails()
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
