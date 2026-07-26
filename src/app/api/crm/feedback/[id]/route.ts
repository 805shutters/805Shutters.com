import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { evaluateFeedbackWithHermes } from "@/lib/crm/feedback-hermes";
import type { CrmFeedbackRequest } from "@/lib/crm/feedback-types";
import { sendWillieFeedbackApproval } from "@/lib/notify/willie-telegram";

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

    const { data: conversation } = await supabase
      .from("crm_feedback_messages").select("author_type,body").eq("request_id", id).order("created_at");
    const decision = await evaluateFeedbackWithHermes({
      title,
      description,
      conversation: conversation || []
    });
    const status = decision.clear ? "ready_for_implementation_approval" : "clarifying";
    await supabase.from("crm_feedback_requests").update({
      status,
      hermes_assessment: decision.assessment || null,
      proposed_work: decision.proposedWork || null
    }).eq("id", id).eq("revision", revision);
    await supabase.from("crm_feedback_messages").insert({
      request_id: id,
      author_type: "hermes",
      body: decision.reply,
      revision,
      metadata: { clear: decision.clear }
    });

    if (decision.clear) {
      const notification = await sendWillieFeedbackApproval({
        id,
        revision,
        type: "implementation",
        title,
        summary: JSON.stringify({ assessment: decision.assessment, proposedWork: decision.proposedWork }, null, 2)
      });
      await supabase.from("crm_feedback_requests").update({
        willie_message_id: notification.messageId || null,
        willie_notification_error: notification.sent ? null : notification.error || notification.skipped || "Notification failed"
      }).eq("id", id).eq("revision", revision);
    }
    return NextResponse.json({ request: { ...updated, status } as CrmFeedbackRequest });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
