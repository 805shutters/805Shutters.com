import { NextRequest, NextResponse } from "next/server";
import type { CrmFeedbackMessage } from "@/lib/crm/feedback-types";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
const CLAIM_LEASE_MS = 10 * 60 * 1000;
const ELIGIBLE_STATUSES = ["clarifying", "implementation_approved", "deployment_approved"];

function authorized(request: NextRequest) {
  const configured = process.env.HERMES_805_SHARED_SECRET?.trim();
  const supplied = request.headers.get("x-hermes-secret")?.trim();
  const company = request.headers.get("x-hermes-company")?.trim();
  return Boolean(configured && supplied && configured === supplied && company === "805");
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ message: "Hermes integration is not authorized." }, { status: 401 });
  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ message: "CRM database is not configured." }, { status: 503 });

  const requestedLimit = Number(new URL(request.url).searchParams.get("limit") || 20);
  const limit = Math.min(Math.max(Number.isInteger(requestedLimit) ? requestedLimit : 20, 1), 50);
  const { data: topics, error } = await supabase
    .from("crm_feedback_requests")
    .select("*")
    .eq("company_scope", "805")
    .in("status", ELIGIBLE_STATUSES)
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) return NextResponse.json({ message: "Hermes queue could not be loaded." }, { status: 502 });

  const topicIds = (topics || []).filter((topic) => topic.status === "clarifying").map((topic) => topic.id);
  const { data: messages } = topicIds.length
    ? await supabase
      .from("crm_feedback_messages")
      .select("request_id,revision,author_type")
      .in("request_id", topicIds)
      .order("created_at", { ascending: false })
    : { data: [] };
  const currentHermesRevisions = new Set(
    (messages || [])
      .filter((message) => message.author_type === "hermes")
      .map((message) => `${message.request_id}:${message.revision}`)
  );
  const allIds = (topics || []).map((topic) => topic.id);
  const { data: allMessages } = allIds.length
    ? await supabase.from("crm_feedback_messages").select("*").in("request_id", allIds).order("created_at")
    : { data: [] };
  const messagesByRequest = new Map<string, CrmFeedbackMessage[]>();
  for (const message of (allMessages || []) as CrmFeedbackMessage[]) {
    messagesByRequest.set(message.request_id, [...(messagesByRequest.get(message.request_id) || []), message]);
  }
  const requests = (topics || [])
    .filter((topic) => topic.status !== "clarifying" || !currentHermesRevisions.has(`${topic.id}:${topic.revision}`))
    .map((topic) => ({
      ...topic,
      messages: messagesByRequest.get(topic.id) || [],
      claimLeaseExpiresAt: topic.hermes_claimed_at
        ? new Date(Date.parse(topic.hermes_claimed_at) + CLAIM_LEASE_MS).toISOString()
        : null
    }));
  return NextResponse.json({ requests });
}

export async function PATCH(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ message: "Hermes integration is not authorized." }, { status: 401 });
  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ message: "CRM database is not configured." }, { status: 503 });
  const body = await request.json() as {
    action?: "claim" | "renew_claim";
    id?: string;
    revision?: number;
    claimedBy?: string;
  };
  if (body.action !== "claim" && body.action !== "renew_claim") {
    return NextResponse.json({ message: "Unsupported queue action." }, { status: 400 });
  }
  const topicId = String(body.id || "");
  const revision = Number(body.revision);
  const workerId = String(body.claimedBy || "").trim().slice(0, 200);
  if (!topicId || !Number.isInteger(revision) || !workerId) {
    return NextResponse.json({ message: "topicId, revision, and workerId are required." }, { status: 400 });
  }

  const { data: claimedRows, error } = await supabase.rpc("claim_crm_feedback_request", {
    p_request_id: topicId,
    p_revision: revision,
    p_claimed_by: workerId,
    p_company_scope: "805"
  });
  const claimed = Array.isArray(claimedRows) ? claimedRows[0] : null;
  if (error || !claimed) return NextResponse.json({ message: "Topic is stale, ineligible, or already has a live claim." }, { status: 409 });

  const { data: messages } = await supabase
    .from("crm_feedback_messages")
    .select("*")
    .eq("request_id", topicId)
    .order("created_at", { ascending: true });
  return NextResponse.json({
    request: { ...claimed, messages: (messages || []) as CrmFeedbackMessage[] },
    claimToken: claimed.hermes_claim_token,
    leaseExpiresAt: new Date(Date.parse(claimed.hermes_claimed_at) + CLAIM_LEASE_MS).toISOString()
  });
}
