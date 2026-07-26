import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { evaluateFeedbackWithHermes } from "@/lib/crm/feedback-hermes";
import { activeCrmFeedbackStatuses, type CrmFeedbackMessage, type CrmFeedbackRequest } from "@/lib/crm/feedback-types";
import { sendWillieFeedbackApproval } from "@/lib/notify/willie-telegram";

export const runtime = "nodejs";
const JESSICA_EMAIL = "jessica@805shutters.com";

async function listFeedback(supabase: Awaited<ReturnType<typeof requireCrmUser>>["supabase"]) {
  const { data: requests, error } = await supabase
    .from("crm_feedback_requests")
    .select("*")
    .in("status", activeCrmFeedbackStatuses)
    .order("updated_at", { ascending: false });
  if (error) throw new CrmAuthError(502, "Feedback requests could not be loaded. Run the CRM feedback migration.");

  const ids = (requests || []).map((item) => item.id);
  const { data: messages, error: messageError } = ids.length
    ? await supabase
      .from("crm_feedback_messages")
      .select("*")
      .in("request_id", ids)
      .order("created_at", { ascending: true })
    : { data: [], error: null };
  if (messageError) throw new CrmAuthError(502, "Feedback conversation could not be loaded.");

  const grouped = new Map<string, CrmFeedbackMessage[]>();
  for (const message of (messages || []) as CrmFeedbackMessage[]) {
    grouped.set(message.request_id, [...(grouped.get(message.request_id) || []), message]);
  }
  return (requests || []).map((request) => ({
    ...request,
    messages: grouped.get(request.id) || []
  })) as CrmFeedbackRequest[];
}

async function evaluateAndSave(
  supabase: Awaited<ReturnType<typeof requireCrmUser>>["supabase"],
  request: CrmFeedbackRequest
) {
  const { data: messages } = await supabase
    .from("crm_feedback_messages")
    .select("*")
    .eq("request_id", request.id)
    .order("created_at", { ascending: true });
  const decision = await evaluateFeedbackWithHermes({
    title: request.title,
    description: request.description,
    conversation: (messages || []).map((item) => ({ author_type: item.author_type, body: item.body }))
  });
  const status = decision.clear ? "ready_for_implementation_approval" : "clarifying";
  const { error: updateError } = await supabase
    .from("crm_feedback_requests")
    .update({
      status,
      hermes_assessment: decision.assessment || null,
      proposed_work: decision.proposedWork || null,
      willie_message_id: null,
      willie_notification_error: null
    })
    .eq("id", request.id)
    .eq("revision", request.revision);
  if (updateError) throw new CrmAuthError(502, "Hermes assessment could not be saved.");

  await supabase.from("crm_feedback_messages").insert({
    request_id: request.id,
    author_type: "hermes",
    author_email: null,
    body: decision.reply,
    revision: request.revision,
    metadata: { clear: decision.clear }
  });

  if (decision.clear) {
    const summary = JSON.stringify({
      assessment: decision.assessment || {},
      proposedWork: decision.proposedWork || {}
    }, null, 2);
    const notification = await sendWillieFeedbackApproval({
      id: request.id,
      revision: request.revision,
      type: "implementation",
      title: request.title,
      summary
    });
    await supabase.from("crm_feedback_requests").update({
      willie_message_id: notification.messageId || null,
      willie_notification_error: notification.sent ? null : notification.error || notification.skipped || "Notification failed"
    }).eq("id", request.id).eq("revision", request.revision);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    return NextResponse.json({ requests: await listFeedback(supabase) });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    if (email !== JESSICA_EMAIL) throw new CrmAuthError(403, "Only Jessica can submit from this feedback panel.");
    const body = await request.json() as { title?: string; description?: string };
    const title = String(body.title || "").trim();
    const description = String(body.description || "").trim();
    if (title.length < 3 || title.length > 160) throw new CrmAuthError(400, "Use a title between 3 and 160 characters.");
    if (description.length < 10 || description.length > 10000) throw new CrmAuthError(400, "Add a detailed description between 10 and 10,000 characters.");

    const { data, error } = await supabase.from("crm_feedback_requests").insert({
      created_by: user.id,
      created_by_email: email,
      title,
      description,
      status: "clarifying",
      revision: 1
    }).select("*").single();
    if (error || !data) throw new CrmAuthError(502, "Feedback request could not be saved.");
    await supabase.from("crm_feedback_messages").insert({
      request_id: data.id,
      author_type: "jessica",
      author_email: email,
      body: description,
      revision: 1,
      metadata: { submission: true, title }
    });
    await evaluateAndSave(supabase, { ...data, messages: [] } as CrmFeedbackRequest);
    return NextResponse.json({ requests: await listFeedback(supabase) }, { status: 201 });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
