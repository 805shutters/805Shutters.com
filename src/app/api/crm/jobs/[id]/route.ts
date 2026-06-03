import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";

export const runtime = "nodejs";

const allowedPatchFields = new Set([
  "status",
  "priority",
  "customer_name",
  "phone",
  "email",
  "address",
  "city",
  "product_interest",
  "sales_owner",
  "next_action",
  "next_action_due",
  "appointment_start",
  "appointment_end",
  "estimated_total",
  "deposit_paid",
  "notes"
]);

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    const { id } = await context.params;
    const payload = await request.json();
    const patch: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(payload)) {
      if (allowedPatchFields.has(key)) patch[key] = value === "" ? null : value;
    }

    if (!Object.keys(patch).length) {
      return NextResponse.json({ message: "No supported CRM job fields provided." }, { status: 400 });
    }

    patch.meta = {
      ...(typeof payload.meta === "object" && payload.meta ? payload.meta : {}),
      lastUpdatedBy: email
    };

    const { data, error } = await supabase.from("crm_jobs").update(patch).eq("id", id).select("*").single();

    if (error) {
      return NextResponse.json({ message: "CRM job could not be updated." }, { status: 502 });
    }

    return NextResponse.json({ job: data });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
