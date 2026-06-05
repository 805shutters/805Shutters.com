import { NextRequest, NextResponse } from "next/server";
import { createCrmBookkeepingEntry } from "@/lib/crm/backend";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const payload = await request.json();
    const entry = await createCrmBookkeepingEntry(supabase, payload, { email, userId: user.id });

    return NextResponse.json({ entry });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
