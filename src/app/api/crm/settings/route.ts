import { NextRequest, NextResponse } from "next/server";
import { updateCrmSettings } from "@/lib/crm/backend";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const payload = await request.json();
    const settings = await updateCrmSettings(supabase, payload, { email, userId: user.id });

    return NextResponse.json({ settings });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
