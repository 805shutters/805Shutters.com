import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "./auth";
import { loadCrmDashboardData } from "./backend";
import { buildOperationsItems } from "./operations-overview";
import { collectCrmPages } from "./pagination";
import { isTwilioConfigured, sendSms } from "@/lib/notify/twilio";
import { YELP_PAGE_URL, yelpSmsBody, yelpSmsPhone, type YelpSmsStatus } from "./yelp-sms-shared";

type Actor = { email: string; userId: string };
type Event = { id: string; action: string; created_at: string; metadata: { phone?: string }; after_data: { attemptedAt?: string } | null };
const actions = ["yelp_sms.claimed", "yelp_sms.accepted", "yelp_sms.needs_review"];

// One atomic claim per destination and link, even across jobs/tabs/server instances.
function eventId(phone: string) {
  const hash = createHash("sha256").update(`805:yelp-sms:v1:${phone}:${YELP_PAGE_URL}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function statusOf(event: Event): YelpSmsStatus {
  return { phone: event.metadata.phone!, status: event.action === "yelp_sms.accepted" ? "accepted" : "needs_review",
    attemptedAt: event.after_data?.attemptedAt || event.created_at };
}

export async function listYelpSmsStatuses(supabase: SupabaseClient) {
  const result = await collectCrmPages<Event>((from, to) => supabase.from("crm_activity_events")
    .select("id,action,created_at,metadata,after_data").in("action", actions)
    .order("created_at", { ascending: false }).order("id").range(from, to));
  if (result.error) throw new CrmAuthError(502, "Yelp text history is unavailable. Refresh before sending.");
  return (result.data || []).filter(event => yelpSmsPhone(event.metadata.phone)).map(statusOf);
}

export async function sendCustomerYelpSms(supabase: SupabaseClient, input: unknown, actor: Actor,
  smsSender: typeof sendSms = sendSms) {
  const body = input as { itemId?: unknown; expectedPhone?: unknown } | null;
  if (!body || typeof body.itemId !== "string" || !/^(row|quote|job):[\da-f-]{36}$/i.test(body.itemId)
    || typeof body.expectedPhone !== "string" || !yelpSmsPhone(body.expectedPhone)) {
    throw new CrmAuthError(400, "A job and valid saved customer cell number are required.");
  }
  // Resolve the same exact-linked source as the screen. Never trust a client-supplied destination/name.
  const dashboard = await loadCrmDashboardData(supabase);
  if (dashboard.loadWarnings?.length) throw new CrmAuthError(503, "Customer records are incomplete. Refresh before sending a Yelp text.");
  const item = buildOperationsItems(dashboard).find(candidate => candidate.source.id === body.itemId)?.source;
  if (!item) throw new CrmAuthError(404, "This job is no longer available. Refresh Job Status.");
  const phone = yelpSmsPhone(item.phone);
  if (!phone) throw new CrmAuthError(400, "This customer has no valid saved cell number.");
  if (phone !== yelpSmsPhone(body.expectedPhone)) throw new CrmAuthError(409, "The customer's cell number changed. Refresh and check it before sending.");
  if (!isTwilioConfigured()) throw new CrmAuthError(503, "805 SMS is not configured. No text was sent.");

  const id = eventId(phone);
  const attemptedAt = new Date().toISOString();
  const message = yelpSmsBody(item.customerName);
  const metadata = { phone, itemId: item.id, customerName: item.customerName, url: YELP_PAGE_URL };
  const { error: claimError } = await supabase.from("crm_activity_events").insert({ id, entity_type: "system",
    action: "yelp_sms.claimed", actor_email: actor.email, actor_auth_user_id: actor.userId, metadata,
    after_data: { body: message, attemptedAt } });
  if (claimError && claimError.code !== "23505") throw new CrmAuthError(502, "Could not reserve the Yelp text. No text was sent.");
  const { data: claimed, error: claimReadError } = await supabase.from("crm_activity_events")
    .select("id,action,created_at,metadata,after_data").eq("id", id).single();
  if (claimReadError || !claimed) throw new CrmAuthError(502, "Could not verify the Yelp text record. Refresh before retrying.");
  if (claimError?.code === "23505") return { ...statusOf(claimed as Event), duplicate: true };

  let result;
  try { result = await smsSender({ to: phone, body: message }); }
  catch { result = { sent: false, error: "Provider outcome uncertain; check the SMS log before resending." }; }
  const accepted = Boolean(result.sent && result.sid);
  const action = accepted ? "yelp_sms.accepted" : "yelp_sms.needs_review";
  const { error: saveError } = await supabase.from("crm_activity_events").update({ action,
    after_data: { body: message, attemptedAt, provider: result, status: accepted ? "accepted" : "needs_review" }
  }).eq("id", id).eq("action", "yelp_sms.claimed");
  const { data: saved, error: readError } = await supabase.from("crm_activity_events")
    .select("id,action,created_at,metadata,after_data").eq("id", id).single();
  const verified = !saveError && !readError && saved?.action === action;
  return { phone, attemptedAt, status: accepted ? "accepted" as const : "needs_review" as const, duplicate: false,
    warning: !verified ? "The SMS attempt needs a log check. Do not resend." : !accepted
      ? result.error || result.skipped || "The SMS outcome needs review. Do not resend." : null };
}
