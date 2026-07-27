import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { sendEightOhFiveFeedbackApproval } from "@/lib/notify/eight-oh-five-telegram";

export const runtime = "nodejs";

function authorized(request: NextRequest) {
  const configured = process.env.HERMES_805_SHARED_SECRET?.trim();
  const supplied = request.headers.get("x-hermes-secret")?.trim();
  const company = request.headers.get("x-hermes-company")?.trim();
  return Boolean(configured && supplied && configured === supplied && company === "805");
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!authorized(request)) return NextResponse.json({ message: "Hermes integration is not authorized." }, { status: 401 });
  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ message: "CRM database is not configured." }, { status: 503 });

  const { id } = await context.params;
  const body = await request.json() as {
    action?: "submit_clarification" | "submit_assessment" | "begin_implementation" | "submit_completed_proposal" | "begin_deployment" | "mark_completed";
    revision?: number;
    claimToken?: string;
    externalEventId?: string;
    message?: string;
    assessment?: Record<string, unknown>;
    proposedWork?: Record<string, unknown>;
    verificationEvidence?: Record<string, unknown>;
  };
  const { data: topic } = await supabase
    .from("crm_feedback_requests")
    .select("*")
    .eq("id", id)
    .eq("company_scope", "805")
    .maybeSingle();
  if (!topic) return NextResponse.json({ message: "Feedback topic was not found." }, { status: 404 });
  if (body.revision !== topic.revision) return NextResponse.json({ message: "Topic revision is stale." }, { status: 409 });
  if (body.externalEventId?.trim()) {
    const { data: priorEvent } = await supabase
      .from("crm_feedback_messages")
      .select("id")
      .eq("request_id", id)
      .eq("external_event_id", body.externalEventId.trim())
      .maybeSingle();
    if (priorEvent) return NextResponse.json({ request: topic, duplicate: true });
  }
  if (!body.claimToken || body.claimToken !== topic.hermes_claim_token) {
    return NextResponse.json({ message: "Hermes claim is missing or stale." }, { status: 409 });
  }
  if (!body.externalEventId?.trim()) {
    return NextResponse.json({ message: "A stable externalEventId is required." }, { status: 400 });
  }

  if (body.action === "submit_clarification" || body.action === "submit_assessment") {
    if (topic.status !== "clarifying") {
      return NextResponse.json({ message: `Topic is ${topic.status}; expected clarifying.` }, { status: 409 });
    }
    if (!body.message?.trim()) return NextResponse.json({ message: "Hermes message is required." }, { status: 400 });
    if (body.action === "submit_assessment" && (!body.assessment || !body.proposedWork)) {
      return NextResponse.json({ message: "Structured assessment and proposed work are required." }, { status: 400 });
    }

    const { error: messageError } = await supabase.from("crm_feedback_messages").insert({
      company_scope: "805",
      request_id: id,
      author_type: "hermes",
      body: body.message.trim(),
      revision: topic.revision,
      external_event_id: body.externalEventId.trim(),
      metadata: { action: body.action }
    });
    if (messageError) {
      if (messageError.code === "23505") return NextResponse.json({ request: topic, duplicate: true });
      return NextResponse.json({ message: "Hermes message could not be saved." }, { status: 502 });
    }
    const ready = body.action === "submit_assessment";
    const { data: updated, error: updateError } = await supabase
      .from("crm_feedback_requests")
      .update({
        status: ready ? "ready_for_implementation_approval" : "clarifying",
        hermes_assessment: ready ? body.assessment : null,
        proposed_work: ready ? body.proposedWork : null,
        hermes_claim_token: null,
        hermes_claimed_at: null,
        hermes_claimed_by: null
      })
      .eq("id", id)
      .eq("revision", topic.revision)
      .eq("hermes_claim_token", body.claimToken)
      .select("*")
      .maybeSingle();
    if (updateError || !updated) return NextResponse.json({ message: "Hermes topic update lost its claim." }, { status: 409 });
    if (ready) {
      const notification = await sendEightOhFiveFeedbackApproval({
        id,
        revision: topic.revision,
        type: "implementation",
        title: topic.title,
        summary: JSON.stringify({ assessment: body.assessment, proposedWork: body.proposedWork }, null, 2)
      });
      await supabase.from("crm_feedback_requests").update({
        willie_message_id: notification.messageId || null,
        willie_notification_error: notification.sent ? null : notification.error || notification.skipped || "Notification failed"
      }).eq("id", id).eq("revision", topic.revision);
    }
    return NextResponse.json({ request: updated });
  }

  const transitions = {
    begin_implementation: { from: "implementation_approved", to: "implementing" },
    submit_completed_proposal: { from: "implementing", to: "ready_for_deployment_approval" },
    begin_deployment: { from: "deployment_approved", to: "deploying" },
    mark_completed: { from: "deploying", to: "completed" }
  } as const;
  const transition = body.action ? transitions[body.action] : null;
  if (!transition) return NextResponse.json({ message: "Unsupported Hermes action." }, { status: 400 });
  const transitionAction = body.action as keyof typeof transitions;
  if (topic.status !== transition.from) {
    return NextResponse.json({ message: `Topic is ${topic.status}; expected ${transition.from}.` }, { status: 409 });
  }
  if (body.action === "submit_completed_proposal" && !body.verificationEvidence) {
    return NextResponse.json({ message: "Verification evidence is required before deployment review." }, { status: 400 });
  }
  const defaultMessages = {
    begin_implementation: "Hermes began implementation after Michael's topic-specific approval.",
    submit_completed_proposal: "Hermes completed the proposed change and submitted verification evidence for deployment approval.",
    begin_deployment: "Hermes began push/deployment after Michael's separate topic-specific approval.",
    mark_completed: "Hermes completed and verified the approved deployment."
  };
  const { error: eventError } = await supabase.from("crm_feedback_messages").insert({
    company_scope: "805",
    request_id: id,
    author_type: "hermes",
    body: body.message?.trim() || defaultMessages[transitionAction],
    revision: topic.revision,
    metadata: { action: body.action },
    external_event_id: body.externalEventId.trim()
  });
  if (eventError) {
    if (eventError.code === "23505") return NextResponse.json({ request: topic, duplicate: true });
    return NextResponse.json({ message: "Hermes transition event could not be saved." }, { status: 502 });
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: transition.to,
    ...(body.assessment ? { hermes_assessment: body.assessment } : {}),
    ...(body.proposedWork ? { proposed_work: body.proposedWork } : {}),
    ...(body.verificationEvidence ? { verification_evidence: body.verificationEvidence } : {}),
    ...(body.action === "submit_completed_proposal" ? { implementation_completed_at: now } : {}),
    ...(body.action === "mark_completed" ? { completed_at: now } : {}),
    ...(["submit_completed_proposal", "mark_completed"].includes(body.action || "")
      ? { hermes_claim_token: null, hermes_claimed_at: null, hermes_claimed_by: null }
      : {})
  };
  const { data: updated, error } = await supabase
    .from("crm_feedback_requests")
    .update(patch)
    .eq("id", id)
    .eq("revision", topic.revision)
    .eq("hermes_claim_token", body.claimToken)
    .select("*")
    .maybeSingle();
  if (error || !updated) return NextResponse.json({ message: "Topic transition could not be saved." }, { status: 502 });

  if (body.action === "submit_completed_proposal") {
    const notification = await sendEightOhFiveFeedbackApproval({
      id,
      revision: topic.revision,
      type: "deployment",
      title: topic.title,
      summary: JSON.stringify({
        proposedWork: body.proposedWork || topic.proposed_work,
        verificationEvidence: body.verificationEvidence
      }, null, 2)
    });
    await supabase.from("crm_feedback_requests").update({
      willie_message_id: notification.messageId || null,
      willie_notification_error: notification.sent ? null : notification.error || notification.skipped || "Notification failed"
    }).eq("id", id).eq("revision", topic.revision);
  }

  return NextResponse.json({ request: updated });
}
