import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { upsertDesign } from "@/lib/crm/quote-builder";

export const runtime = "nodejs";

// POST: create or update a design alternative (price is computed server-side).
// Include `id` in the body to update an existing design; omit it to create.
export async function POST(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const payload = await request.json();
    const quote = await upsertDesign(supabase, payload, { email, userId: user.id });
    return NextResponse.json({ quote });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
