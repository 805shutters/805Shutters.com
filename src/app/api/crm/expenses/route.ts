import { NextRequest, NextResponse } from "next/server";
import { createCrmJobExpense } from "@/lib/crm/backend";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const payload = await request.json();
    const expense = await createCrmJobExpense(supabase, payload, { email, userId: user.id });

    return NextResponse.json({ expense });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
