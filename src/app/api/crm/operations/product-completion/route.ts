import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { completeProductMilestone } from "@/lib/crm/product-completion";

export async function POST(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    return NextResponse.json(await completeProductMilestone(supabase, await request.json().catch(() => null), { email, userId: user.id }));
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
