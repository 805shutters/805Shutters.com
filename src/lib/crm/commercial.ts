import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import {
  CommercialAccount,
  CommercialActivity,
  CommercialActivityType,
  CommercialPriority,
  CommercialStatus,
  CommercialWorkspaceData,
  commercialAccountTypes,
  commercialStatuses
} from "@/lib/crm/commercial-types";

type CrmSupabaseClient = SupabaseClient;
type CommercialActor = { email: string; userId?: string };

const accountTypeSet = new Set<string>(commercialAccountTypes);
const statusSet = new Set<string>(commercialStatuses);
const prioritySet = new Set<string>(["low", "normal", "high", "strategic"]);
const licenseStatusSet = new Set<string>(["not_applicable", "unverified", "active", "inactive", "expired", "suspended"]);
const activityTypeSet = new Set<string>([
  "created",
  "research",
  "note",
  "call",
  "email_sent",
  "reply_received",
  "meeting",
  "bid_invite",
  "bid_submitted",
  "status_change",
  "opt_out"
]);

const editableAccountFields = new Set([
  "company_name",
  "account_type",
  "status",
  "priority",
  "assigned_to",
  "contact_name",
  "contact_title",
  "email",
  "phone",
  "website",
  "address",
  "city",
  "state",
  "postal_code",
  "license_number",
  "license_classifications",
  "license_status",
  "license_verified_at",
  "source_type",
  "source_name",
  "source_url",
  "source_checked_at",
  "external_id",
  "next_action",
  "next_action_due",
  "estimated_value",
  "notes",
  "tags",
  "do_not_email",
  "meta"
]);

function cleanText(value: unknown, maxLength = 500) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function requiredText(value: unknown, message: string, maxLength = 300) {
  const cleaned = cleanText(value, maxLength);
  if (!cleaned) throw new CrmAuthError(400, message);
  return cleaned;
}

function cleanEmail(value: unknown) {
  const email = cleanText(value, 320)?.toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new CrmAuthError(400, `Invalid commercial contact email: ${email}`);
  }
  return email;
}

function cleanUrl(value: unknown) {
  const raw = cleanText(value, 1200);
  if (!raw) return null;
  try {
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported protocol");
    return url.toString();
  } catch {
    throw new CrmAuthError(400, `Invalid website or source URL: ${raw}`);
  }
}

function stringArray(value: unknown, maxItems = 30) {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,;|]/) : [];
  return [...new Set(items.map((item) => cleanText(item, 120)).filter((item): item is string => Boolean(item)))].slice(0, maxItems);
}

function money(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.max(Math.round(amount * 100) / 100, 0) : 0;
}

function accountPayload(payload: Record<string, unknown>, partial = false) {
  const output: Record<string, unknown> = {};
  const include = (key: string) => !partial || Object.prototype.hasOwnProperty.call(payload, key);

  if (include("company_name")) output.company_name = requiredText(payload.company_name, "Company name is required.");
  if (include("account_type")) {
    const value = cleanText(payload.account_type) || "other";
    if (!accountTypeSet.has(value)) throw new CrmAuthError(400, "Unknown commercial account type.");
    output.account_type = value;
  }
  if (include("status")) {
    const value = cleanText(payload.status) || "new";
    if (!statusSet.has(value)) throw new CrmAuthError(400, "Unknown commercial status.");
    output.status = value;
  }
  if (include("priority")) {
    const value = cleanText(payload.priority) || "normal";
    if (!prioritySet.has(value)) throw new CrmAuthError(400, "Unknown commercial priority.");
    output.priority = value;
  }
  if (include("license_status")) {
    const value = cleanText(payload.license_status) || "not_applicable";
    if (!licenseStatusSet.has(value)) throw new CrmAuthError(400, "Unknown license status.");
    output.license_status = value;
  }

  for (const key of [
    "assigned_to",
    "contact_name",
    "contact_title",
    "phone",
    "address",
    "city",
    "state",
    "postal_code",
    "license_number",
    "source_type",
    "source_name",
    "external_id",
    "next_action"
  ]) {
    if (include(key)) output[key] = cleanText(payload[key], key === "next_action" ? 1000 : 300);
  }

  if (include("notes")) output.notes = cleanText(payload.notes, 5000);
  if (include("email")) output.email = cleanEmail(payload.email);
  if (include("website")) output.website = cleanUrl(payload.website);
  if (include("source_url")) output.source_url = cleanUrl(payload.source_url);
  if (include("license_classifications")) output.license_classifications = stringArray(payload.license_classifications);
  if (include("tags")) output.tags = stringArray(payload.tags);
  if (include("estimated_value")) output.estimated_value = money(payload.estimated_value);
  if (include("do_not_email")) output.do_not_email = Boolean(payload.do_not_email);
  if (include("next_action_due")) output.next_action_due = cleanText(payload.next_action_due, 10);
  if (include("license_verified_at")) output.license_verified_at = cleanText(payload.license_verified_at, 40);
  if (include("source_checked_at")) output.source_checked_at = cleanText(payload.source_checked_at, 40);
  if (include("meta")) output.meta = payload.meta && typeof payload.meta === "object" && !Array.isArray(payload.meta) ? payload.meta : {};

  if (!partial) {
    output.account_type ||= "other";
    output.status ||= "new";
    output.priority ||= "normal";
    output.assigned_to ||= "Unassigned";
    output.state ||= "CA";
    output.source_type ||= "manual";
    output.license_status ||= "not_applicable";
    output.license_classifications ||= [];
    output.tags ||= [];
    output.meta ||= {};
  }

  return output;
}

function commercialSummary(accounts: CommercialAccount[]) {
  const today = new Date().toISOString().slice(0, 10);
  return accounts.reduce<CommercialWorkspaceData["summary"]>(
    (summary, account) => {
      summary.total += 1;
      if (account.status === "ready") summary.readyToContact += 1;
      if (["contacted", "replied", "meeting", "bid_invited", "bidding", "won"].includes(account.status)) summary.contacted += 1;
      if (["replied", "meeting", "bid_invited", "bidding", "won"].includes(account.status)) summary.replies += 1;
      if (["bid_invited", "bidding"].includes(account.status)) summary.activeBids += 1;
      if (account.status === "won") summary.wins += 1;
      if (!["won", "not_fit", "do_not_contact"].includes(account.status)) summary.pipelineValue += Number(account.estimated_value || 0);
      if (account.next_action_due && account.next_action_due < today && !["won", "not_fit", "do_not_contact"].includes(account.status)) summary.overdue += 1;
      if (!account.email) summary.missingEmail += 1;
      return summary;
    },
    { total: 0, readyToContact: 0, contacted: 0, replies: 0, activeBids: 0, wins: 0, pipelineValue: 0, overdue: 0, missingEmail: 0 }
  );
}

function commercialConfiguration() {
  return {
    outboundEmail: Boolean(process.env.RESEND_API_KEY && (process.env.RESEND_FROM || process.env.BOOKING_EMAIL_FROM)),
    replySync: Boolean(
      process.env.GMAIL_ACCESS_TOKEN_BROKER_URL ||
        (process.env.GMAIL_805_CLIENT_ID && process.env.GMAIL_805_CLIENT_SECRET && process.env.GMAIL_805_REFRESH_TOKEN)
    ),
    postalAddress: Boolean(process.env.COMMERCIAL_OUTREACH_POSTAL_ADDRESS?.trim()),
    googlePlaces: Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim())
  };
}

export async function loadCommercialWorkspace(supabase: CrmSupabaseClient): Promise<CommercialWorkspaceData> {
  const [{ data: accountRows, error: accountError }, { data: activityRows, error: activityError }] = await Promise.all([
    supabase.from("crm_commercial_accounts").select("*").order("updated_at", { ascending: false }),
    supabase.from("crm_commercial_activities").select("*").order("occurred_at", { ascending: false }).limit(400)
  ]);

  if (accountError) throw new CrmAuthError(502, "Commercial accounts could not be loaded. Run the commercial CRM migration.");
  if (activityError) throw new CrmAuthError(502, "Commercial activity could not be loaded. Run the commercial CRM migration.");

  const accounts = (accountRows || []) as CommercialAccount[];
  return {
    accounts,
    activities: (activityRows || []) as CommercialActivity[],
    summary: commercialSummary(accounts),
    configuration: commercialConfiguration()
  };
}

async function recordActivity(
  supabase: CrmSupabaseClient,
  input: {
    accountId: string;
    activityType: CommercialActivityType;
    actorEmail?: string | null;
    subject?: string | null;
    bodyPreview?: string | null;
    externalMessageId?: string | null;
    gmailMessageId?: string | null;
    gmailThreadId?: string | null;
    occurredAt?: string | null;
    meta?: Record<string, unknown>;
  }
) {
  const { data, error } = await supabase
    .from("crm_commercial_activities")
    .insert({
      account_id: input.accountId,
      activity_type: input.activityType,
      actor_email: input.actorEmail || null,
      subject: cleanText(input.subject, 500),
      body_preview: cleanText(input.bodyPreview, 5000),
      external_message_id: cleanText(input.externalMessageId, 500),
      gmail_message_id: cleanText(input.gmailMessageId, 500),
      gmail_thread_id: cleanText(input.gmailThreadId, 500),
      occurred_at: input.occurredAt || new Date().toISOString(),
      meta: input.meta || {}
    })
    .select("*")
    .single();

  if (error) throw new CrmAuthError(502, `Commercial activity could not be saved: ${error.message}`);
  return data as CommercialActivity;
}

export async function createCommercialAccount(
  supabase: CrmSupabaseClient,
  payload: Record<string, unknown>,
  actor: CommercialActor
) {
  const input = accountPayload(payload);
  const { data, error } = await supabase.from("crm_commercial_accounts").insert(input).select("*").single();
  if (error) {
    if (error.code === "23505") throw new CrmAuthError(409, "That prospect is already in the commercial ledger.");
    throw new CrmAuthError(502, `Commercial prospect could not be created: ${error.message}`);
  }

  await recordActivity(supabase, {
    accountId: data.id,
    activityType: "created",
    actorEmail: actor.email,
    bodyPreview: `Added ${data.company_name} to the commercial ledger.`
  });
  return data as CommercialAccount;
}

export async function importCommercialAccounts(
  supabase: CrmSupabaseClient,
  rows: Array<Record<string, unknown>>,
  actor: CommercialActor
) {
  if (!Array.isArray(rows) || !rows.length) throw new CrmAuthError(400, "Import rows are required.");
  if (rows.length > 1000) throw new CrmAuthError(400, "Import no more than 1,000 prospects at a time.");

  const { data: existingRows, error: existingError } = await supabase
    .from("crm_commercial_accounts")
    .select("id,company_name,city,email,source_name,external_id");
  if (existingError) throw new CrmAuthError(502, "Existing commercial prospects could not be checked.");

  const keyOf = (row: Record<string, unknown>) => {
    const external = cleanText(row.external_id)?.toLowerCase();
    const source = cleanText(row.source_name)?.toLowerCase();
    if (external && source) return `external:${source}:${external}`;
    const email = cleanText(row.email)?.toLowerCase();
    if (email) return `email:${email}`;
    return `name:${cleanText(row.company_name)?.toLowerCase() || ""}:${cleanText(row.city)?.toLowerCase() || ""}`;
  };
  const existingKeys = new Set((existingRows || []).map((row) => keyOf(row)));
  const prepared: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const row of rows) {
    const input = accountPayload(row);
    const key = keyOf(input);
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }
    existingKeys.add(key);
    prepared.push(input);
  }

  if (!prepared.length) return { imported: 0, skipped, accounts: [] as CommercialAccount[] };
  const { data, error } = await supabase.from("crm_commercial_accounts").insert(prepared).select("*");
  if (error) throw new CrmAuthError(502, `Commercial import failed: ${error.message}`);

  const accounts = (data || []) as CommercialAccount[];
  const activityRows = accounts.map((account) => ({
    account_id: account.id,
    activity_type: "created",
    actor_email: actor.email,
    body_preview: `Imported ${account.company_name} from ${account.source_name || account.source_type || "a public source"}.`,
    occurred_at: new Date().toISOString(),
    meta: { import: true }
  }));
  if (activityRows.length) await supabase.from("crm_commercial_activities").insert(activityRows);
  return { imported: accounts.length, skipped, accounts };
}

export async function updateCommercialAccount(
  supabase: CrmSupabaseClient,
  id: string,
  payload: Record<string, unknown>,
  actor: CommercialActor
) {
  const keys = Object.keys(payload);
  if (!keys.length || keys.some((key) => !editableAccountFields.has(key))) throw new CrmAuthError(400, "Unsupported commercial account update.");

  const { data: current, error: currentError } = await supabase.from("crm_commercial_accounts").select("*").eq("id", id).maybeSingle();
  if (currentError || !current) throw new CrmAuthError(404, "Commercial prospect not found.");

  const patch = accountPayload(payload, true);
  if (patch.do_not_email === true) patch.status = "do_not_contact";
  const { data, error } = await supabase.from("crm_commercial_accounts").update(patch).eq("id", id).select("*").single();
  if (error) throw new CrmAuthError(502, `Commercial prospect could not be updated: ${error.message}`);

  if (patch.status && patch.status !== current.status) {
    await recordActivity(supabase, {
      accountId: id,
      activityType: patch.status === "do_not_contact" ? "opt_out" : "status_change",
      actorEmail: actor.email,
      bodyPreview: `Status changed from ${current.status} to ${patch.status}.`,
      meta: { from: current.status, to: patch.status }
    });
  }
  return data as CommercialAccount;
}

export async function addCommercialActivity(
  supabase: CrmSupabaseClient,
  payload: Record<string, unknown>,
  actor: CommercialActor
) {
  const accountId = requiredText(payload.account_id, "Commercial prospect is required.");
  const activityType = requiredText(payload.activity_type, "Activity type is required.") as CommercialActivityType;
  if (!activityTypeSet.has(activityType)) throw new CrmAuthError(400, "Unknown commercial activity type.");

  const activity = await recordActivity(supabase, {
    accountId,
    activityType,
    actorEmail: actor.email,
    subject: cleanText(payload.subject, 500),
    bodyPreview: cleanText(payload.body_preview, 5000),
    occurredAt: cleanText(payload.occurred_at, 40),
    meta: payload.meta && typeof payload.meta === "object" && !Array.isArray(payload.meta) ? (payload.meta as Record<string, unknown>) : {}
  });

  const accountPatch: Record<string, unknown> = {};
  if (["call", "email_sent", "meeting", "bid_invite", "bid_submitted"].includes(activityType)) accountPatch.last_contacted_at = activity.occurred_at;
  if (activityType === "reply_received") accountPatch.last_replied_at = activity.occurred_at;
  const nextStatus: Partial<Record<CommercialActivityType, CommercialStatus>> = {
    email_sent: "contacted",
    reply_received: "replied",
    meeting: "meeting",
    bid_invite: "bid_invited",
    bid_submitted: "bidding",
    opt_out: "do_not_contact"
  };
  if (nextStatus[activityType]) accountPatch.status = nextStatus[activityType];
  if (activityType === "opt_out") accountPatch.do_not_email = true;
  if (Object.keys(accountPatch).length) await supabase.from("crm_commercial_accounts").update(accountPatch).eq("id", accountId);
  return activity;
}

export function isCommercialPriority(value: string): value is CommercialPriority {
  return prioritySet.has(value);
}
