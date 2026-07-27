import { NextRequest, NextResponse } from "next/server";
import {
  approvedFeedbackStatus,
  assertTopicApprovalAllowed,
  parseFeedbackCallbackData
} from "@/lib/crm/feedback-workflow";
import type { CrmFeedbackRequest } from "@/lib/crm/feedback-types";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { answerEightOhFiveCallback } from "@/lib/notify/eight-oh-five-telegram";

export const runtime = "nodejs";

type TelegramUpdate = {
  callback_query?: {
    id?: string;
    data?: string;
    from?: { id?: number; username?: string; first_name?: string };
    message?: { message_id?: number; chat?: { id?: number } };
  };
};

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.SHUTTERS_805_TELEGRAM_WEBHOOK_SECRET?.trim();
  const suppliedSecret = request.headers.get("x-telegram-bot-api-secret-token")?.trim();
  if (!configuredSecret || suppliedSecret !== configuredSecret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = await request.json() as TelegramUpdate;
  const callback = update.callback_query;
  const parsed = parseFeedbackCallbackData(callback?.data || "");
  if (!callback?.id || !parsed) return NextResponse.json({ ok: true });

  const expectedChat = process.env.SHUTTERS_805_TELEGRAM_CHAT_ID?.trim();
  const actualChat = String(callback.message?.chat?.id || "");
  if (!expectedChat || actualChat !== expectedChat) {
    await answerEightOhFiveCallback(callback.id, "This chat is not authorized for 805 CRM approvals.");
    return NextResponse.json({ ok: true });
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ ok: false }, { status: 503 });
  const { data } = await supabase
    .from("crm_feedback_requests")
    .select("*")
    .eq("id", parsed.id)
    .eq("company_scope", "805")
    .maybeSingle();
  if (!data) {
    await answerEightOhFiveCallback(callback.id, "This 805 feedback topic no longer exists.");
    return NextResponse.json({ ok: true });
  }

  try {
    assertTopicApprovalAllowed(data as CrmFeedbackRequest, parsed.type, parsed.revision);
    const approvedBy = callback.from?.username
      ? `@${callback.from.username}`
      : callback.from?.first_name || String(callback.from?.id || "Michael");
    const now = new Date().toISOString();
    const approval = {
      company_scope: "805",
      request_id: parsed.id,
      request_revision: parsed.revision,
      approval_type: parsed.type,
      approved_by: approvedBy,
      telegram_chat_id: actualChat,
      telegram_callback_query_id: callback.id,
      telegram_message_id: callback.message?.message_id || null,
      metadata: { telegram_user_id: callback.from?.id || null }
    };
    const { error: approvalError } = await supabase.from("crm_feedback_approvals").insert(approval);
    if (approvalError) throw new Error("Approval was already used or could not be recorded.");

    const patch = parsed.type === "implementation"
      ? {
        status: approvedFeedbackStatus(parsed.type),
        implementation_approved_at: now,
        implementation_approved_by: approvedBy
      }
      : {
        status: approvedFeedbackStatus(parsed.type),
        deployment_approved_at: now,
        deployment_approved_by: approvedBy
      };
    const { data: updated, error: updateError } = await supabase
      .from("crm_feedback_requests")
      .update(patch)
      .eq("id", parsed.id)
      .eq("revision", parsed.revision)
      .eq("status", data.status)
      .select("id")
      .maybeSingle();
    if (updateError || !updated) throw new Error("Topic state changed before approval was recorded.");

    await supabase.from("crm_feedback_messages").insert({
      company_scope: "805",
      request_id: parsed.id,
      author_type: "michael",
      author_email: null,
      body: parsed.type === "implementation"
        ? "Michael approved Hermes to begin implementation for this topic."
        : "Michael approved push/deployment for the completed change on this topic.",
      revision: parsed.revision,
      metadata: { approval_type: parsed.type, telegram_callback_query_id: callback.id }
    });
    await answerEightOhFiveCallback(callback.id, `${parsed.type === "implementation" ? "Implementation" : "Push/deployment"} approved for this 805 topic only.`);
  } catch (error) {
    await answerEightOhFiveCallback(callback.id, error instanceof Error ? error.message : "805 approval could not be recorded.");
  }
  return NextResponse.json({ ok: true });
}
