import { NextRequest, NextResponse } from "next/server";
import {
  requireCrmUser,
  crmAuthErrorResponse,
  CrmAuthError,
} from "@/lib/crm/auth";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const body = await request.json();
    if (
      !["standard", "in_house_three_month_v1"].includes(body.schedule) ||
      !Number.isSafeInteger(body.revision) ||
      !/^[\da-f-]{36}$/i.test(body.requestId || "")
    )
      throw new CrmAuthError(400, "Choose a valid payment schedule.");
    const { data, error } = await supabase.rpc("save_in_house_quote_schedule", {
      p_id: id,
      p_revision: body.revision,
      p_schedule: body.schedule,
      p_actor: user.id,
      p_request: body.requestId,
    });
    if (error) throw new CrmAuthError(409, error.message);
    const { data: saved, error: readError } = await supabase.from("sales_quotes")
      .select("id,quote_v2_revision").eq("id", data).single();
    if (readError || !saved) throw new CrmAuthError(409, "Saved payment terms could not be verified. Retry this request before sending.");
    if (saved.id === id && Number(saved.quote_v2_revision) !== body.revision + 1) throw new CrmAuthError(409, "This quote changed after saving payment terms. Close and reopen Send to review it.");
    return NextResponse.json({ quoteId: saved.id, revision: Number(saved.quote_v2_revision) });
  } catch (e) {
    return crmAuthErrorResponse(e);
  }
}
