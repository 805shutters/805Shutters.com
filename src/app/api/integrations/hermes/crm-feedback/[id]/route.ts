import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { sendWillieFeedbackApproval } from "@/lib/notify/willie-telegram";

export const runtime = "nodejs";

function authorized(request: NextRequest) {
  const configured = process.env.HERMES_805_SHARED_SECRET?.trim();
  const supplied = request.headers.get("x-hermes-secret")?.trim();
  return Boolean(configured && supplied && configured === supplied);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!authorized(request)) return NextResponse.json({ message: "Hermes integration is not authorized." }, { status: 401 });
  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ message: "CRM database is not configured." }, { status: 503 });

  const { id } = await context.params;
  const body = await request.json() as {
    action?: "begin_implementation" | "submit_completed_proposal" | "begin_deployment" | "mark_completed";
    revision?: number;
    message?: string;
    assessment?: Record<string, unknown>;
    proposedWork?: Record<string, unknown>;
    verificationEvidence?: Record<string, unknown>;
  };
  const { data: topic } = await supabase.from("crm_feedback_requests").select("*").eq("id", id).maybeSingle();
  if (!topic) return NextResponse.json({ message: "Feedback topic was not found." }, { status: 404 });
  if (body.revision !== topic.revision) return NextResponse.json({ message: "Topic revision is stale." }, { status: 409 });

  const transitions = {
    begin_implementation: { from: "implementation_approved", to: "implementing" },
    submit_completed_proposal: { from: "implementing", to: "ready_for_deployment_approval" },
    begin_deployment: { from: "deployment_approved", to: "deploying" },
    mark_completed: { from: "deploying", to: "completed" }
  } as const;
  const transition = body.action ? transitions[body.action] : null;
  if (!transition) return NextResponse.json({ message: "Unsupported Hermes action." }, { status: 400 });
  if (topic.status !== transition.from) {
    return NextResponse.json({ message: `Topic is ${topic.status}; expected ${transition.from}.` }, { status: 409 });
  }
  if (body.action === "submit_completed_proposal" && !body.verificationEvidence) {
    return NextResponse.json({ message: "Verification evidence is required before deployment review." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: transition.to,
    ...(body.assessment ? { hermes_assessment: body.assessment } : {}),
    ...(body.proposedWork ? { proposed_work: body.proposedWork } : {}),
    ...(body.verificationEvidence ? { verification_evidence: body.verificationEvidence } : {}),
    ...(body.action === "submit_completed_proposal" ? { implementation_completed_at: now } : {}),
    ...(body.action === "mark_completed" ? { completed_at: now } : {})
  };
  const { data: updated, error } = await supabase
    .from("crm_feedback_requests").update(patch).eq("id", id).eq("revision", topic.revision).select("*").maybeSingle();
  if (error || !updated) return NextResponse.json({ message: "Topic transition could not be saved." }, { status: 502 });

  if (body.message) {
    await supabase.from("crm_feedback_messages").insert({
      request_id: id,
      author_type: "hermes",
      body: body.message,
      revision: topic.revision,
      metadata: { action: body.action }
    });
  }

  if (body.action === "submit_completed_proposal") {
    const notification = await sendWillieFeedbackApproval({
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
