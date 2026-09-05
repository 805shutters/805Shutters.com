import { NextRequest, NextResponse } from "next/server";
import { requireCrmUser, crmAuthErrorResponse } from "@/lib/crm/auth";
import { saveOwnedAction } from "@/lib/crm/owned-actions";
export async function POST(request: NextRequest) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    return NextResponse.json({
      action: await saveOwnedAction(supabase, await request.json(), email),
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
