import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { completeProductMilestone } from "@/lib/crm/product-completion";

import { saveProductOrderCost } from "@/lib/crm/save-product-order-cost";

export async function POST(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const body = await request.json().catch(() => null);
    return NextResponse.json(await (body?.invoice ? saveProductOrderCost : completeProductMilestone)(supabase, body, { email, userId: user.id }));
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
