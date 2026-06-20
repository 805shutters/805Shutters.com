import { NextRequest, NextResponse } from "next/server";
import {
  createCrmAvailabilitySlot,
  deleteCrmAvailabilitySlot,
  listCrmAvailabilitySlots
} from "@/lib/crm/backend";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    const month = request.nextUrl.searchParams.get("month") || "";

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ message: "Month must be YYYY-MM." }, { status: 400 });
    }

    const slots = await listCrmAvailabilitySlots(supabase, month);
    return NextResponse.json({ slots });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const payload = await request.json();
    const slot = await createCrmAvailabilitySlot(supabase, payload, { email, userId: user.id });
    return NextResponse.json({ slot });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const payload = await request.json();
    const result = await deleteCrmAvailabilitySlot(supabase, payload, { email, userId: user.id });
    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
