import { NextRequest, NextResponse } from "next/server";
import { submitConsultation } from "@/app/api/booking/route";
import { explicitManualOverride } from "@/lib/booking/manual-override";
import { BookingError } from "@/lib/booking/scheduling";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    const payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json(
        { message: "Booking details are required." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const override = explicitManualOverride(payload);
    return await submitConsultation(supabase, request, payload, override);
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json(
        { message: error.message },
        {
          status: error.status,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
    return crmAuthErrorResponse(error);
  }
}
