import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import type { CrmFeedbackRequest } from "@/lib/crm/feedback-types";

export const runtime = "nodejs";
const JESSICA_EMAIL = "jessica@805shutters.com";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    if (email !== JESSICA_EMAIL) throw new CrmAuthError(403, "Only Jessica can revise this request.");
    const { id } = await context.params;
    const body = await request.json() as { title?: string; description?: string; details?: string };
    const { data: existing, error } = await supabase
      .from("crm_feedback_requests").select("*").eq("id", id).maybeSingle();
    if (error || !existing) throw new CrmAuthError(404, "Feedback topic was not found.");
    if (existing.status !== "clarifying") {
      throw new CrmAuthError(409, "This topic has left clarification. Create a new revision only while Hermes is clarifying.");
    }

    const title = String(body.title ?? existing.title).trim();
    const description = String(body.description ?? existing.description).trim();
    const details = String(body.details || "").trim();
    if (title.length < 3 || title.length > 160) throw new CrmAuthError(400, "Use a title between 3 and 160 characters.");
    if (description.length < 10 || description.length > 10000) throw new CrmAuthError(400, "Add a detailed description.");
    if (!details && title === existing.title && description === existing.description) {
      throw new CrmAuthError(400, "Edit the request or add clarification details before resubmitting.");
    }
    const revision = Number(existing.revision) + 1;
    const { data: updated, error: updateError } = await supabase
      .from("crm_feedback_requests")
      .update({
        title,
        description,
        revision,
        hermes_assessment: null,
        proposed_work: null,
        willie_message_id: null,
        willie_notification_error: null
      })
      .eq("id", id).eq("revision", existing.revision).select("*").maybeSingle();
    if (updateError || !updated) throw new CrmAuthError(409, "This topic changed. Refresh before resubmitting.");

    await supabase.from("crm_feedback_messages").insert({
      request_id: id,
      author_type: "jessica",
      author_email: email,
      body: details || description,
      revision,
      metadata: { resubmission: true, title, full_description: description }
    });

    await supabase.from("crm_feedback_requests").update({
      status: "clarifying",
      hermes_claim_token: null,
      hermes_claimed_at: null,
      hermes_claimed_by: null
    }).eq("id", id).eq("revision", revision);
    return NextResponse.json({ request: { ...updated, status: "clarifying" } as CrmFeedbackRequest });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
