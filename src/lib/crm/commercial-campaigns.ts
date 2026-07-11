import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { commercialConfiguration } from "@/lib/crm/commercial";
import { buildCommercialOutreachMessage, sendCommercialOutreachMessage } from "@/lib/crm/commercial-outreach";
import {
  CommercialAccount,
  CommercialAccountType,
  CommercialCampaign,
  CommercialCampaignEnrollmentStatus,
  CommercialCampaignStats,
  CommercialCampaignWithStats,
  CommercialStatus,
  commercialAccountTypes,
  commercialStatuses
} from "@/lib/crm/commercial-types";

type CrmSupabaseClient = SupabaseClient;

type CampaignEnrollment = {
  id: string;
  campaign_id: string;
  account_id: string;
  status: CommercialCampaignEnrollmentStatus;
  started_at: string | null;
  intro_sent_at: string | null;
  follow_up_sent_at: string | null;
  next_send_at: string | null;
  completed_at: string | null;
  last_error: string | null;
};

type CampaignInput = Pick<
  CommercialCampaign,
  | "name"
  | "account_type"
  | "audience_statuses"
  | "intro_subject"
  | "intro_body"
  | "follow_up_subject"
  | "follow_up_body"
  | "follow_up_delay_days"
  | "daily_limit"
>;

const campaignStatusSet = new Set(["draft", "active", "paused", "completed"]);
const campaignAccountTypeSet = new Set<string>(commercialAccountTypes);
const campaignAudienceStatusSet = new Set<string>(commercialStatuses);
const DAY = 24 * 60 * 60 * 1000;

function asCampaign(row: unknown): CommercialCampaign {
  return row as CommercialCampaign;
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function requiredText(value: unknown, label: string, maxLength: number) {
  const text = cleanText(value, maxLength);
  if (!text) throw new CrmAuthError(400, `${label} is required.`);
  return text;
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(parsed)));
}

export function campaignInput(payload: Record<string, unknown>): CampaignInput {
  const accountType = cleanText(payload.account_type, 80) || "other";
  if (!campaignAccountTypeSet.has(accountType)) throw new CrmAuthError(400, "Choose a valid commercial account type.");

  const audienceStatuses = Array.isArray(payload.audience_statuses)
    ? [...new Set(payload.audience_statuses.filter((status): status is string => typeof status === "string").map((status) => status.trim()))]
    : [];
  if (!audienceStatuses.length || audienceStatuses.some((status) => !campaignAudienceStatusSet.has(status))) {
    throw new CrmAuthError(400, "Choose at least one valid pipeline stage for the campaign audience.");
  }

  return {
    name: requiredText(payload.name, "Campaign name", 160),
    account_type: accountType as CommercialAccountType,
    audience_statuses: audienceStatuses as CommercialStatus[],
    intro_subject: requiredText(payload.intro_subject, "Introduction subject", 240),
    intro_body: requiredText(payload.intro_body, "Introduction message", 10000),
    follow_up_subject: requiredText(payload.follow_up_subject, "Follow-up subject", 240),
    follow_up_body: requiredText(payload.follow_up_body, "Follow-up message", 10000),
    follow_up_delay_days: boundedInteger(payload.follow_up_delay_days, 5, 1, 30),
    daily_limit: boundedInteger(payload.daily_limit, 25, 1, 100)
  };
}

function emptyStats(): CommercialCampaignStats {
  return { total: 0, queued: 0, sent: 0, replied: 0, optedOut: 0, completed: 0, skipped: 0, failed: 0 };
}

function statsForEnrollments(enrollments: CampaignEnrollment[]) {
  return enrollments.reduce((stats, enrollment) => {
    stats.total += 1;
    if (enrollment.status === "queued") stats.queued += 1;
    if (enrollment.status === "sent") stats.sent += 1;
    if (enrollment.status === "replied") stats.replied += 1;
    if (enrollment.status === "opted_out") stats.optedOut += 1;
    if (enrollment.status === "completed") stats.completed += 1;
    if (enrollment.status === "skipped") stats.skipped += 1;
    if (enrollment.status === "failed") stats.failed += 1;
    return stats;
  }, emptyStats());
}

async function requireCampaign(supabase: CrmSupabaseClient, campaignId: string) {
  const { data, error } = await supabase.from("crm_commercial_campaigns").select("*").eq("id", campaignId).maybeSingle();
  if (error) throw new CrmAuthError(502, "Commercial campaigns could not be loaded. Run the campaign migration.");
  if (!data) throw new CrmAuthError(404, "Commercial campaign not found.");
  return asCampaign(data);
}

async function audienceForCampaign(supabase: CrmSupabaseClient, campaign: CommercialCampaign) {
  const { data, error } = await supabase
    .from("crm_commercial_accounts")
    .select("*")
    .eq("account_type", campaign.account_type)
    .in("status", campaign.audience_statuses);
  if (error) throw new CrmAuthError(502, "Campaign audience could not be loaded.");
  return (data || []) as CommercialAccount[];
}

function canReceiveCampaign(account: CommercialAccount) {
  if (account.do_not_email || account.status === "do_not_contact") return false;
  return Boolean(account.email?.trim());
}

export function campaignStopReason(account: CommercialAccount, enrollment: Pick<CampaignEnrollment, "started_at">): "replied" | "opted_out" | "missing_email" | null {
  if (account.do_not_email || account.status === "do_not_contact") return "opted_out";
  if (!account.email?.trim()) return "missing_email";
  if (account.last_replied_at && (!enrollment.started_at || Date.parse(account.last_replied_at) >= Date.parse(enrollment.started_at))) return "replied";
  return null;
}

function dateAfterDays(now: Date, days: number) {
  return new Date(now.getTime() + days * DAY).toISOString();
}

function startOfToday(now: Date) {
  const local = new Date(now);
  local.setHours(0, 0, 0, 0);
  return local.toISOString();
}

function enrollmentStatusForStop(reason: ReturnType<typeof campaignStopReason>): CommercialCampaignEnrollmentStatus {
  if (reason === "replied") return "replied";
  if (reason === "opted_out") return "opted_out";
  return "skipped";
}

export async function loadCommercialCampaigns(supabase: CrmSupabaseClient): Promise<CommercialCampaignWithStats[]> {
  const [{ data: campaignRows, error: campaignError }, { data: enrollmentRows, error: enrollmentError }] = await Promise.all([
    supabase.from("crm_commercial_campaigns").select("*").order("updated_at", { ascending: false }),
    supabase.from("crm_commercial_campaign_enrollments").select("campaign_id,status")
  ]);
  if (campaignError || enrollmentError) throw new CrmAuthError(502, "Commercial campaigns could not be loaded. Run the campaign migration.");

  const statsByCampaign = new Map<string, CommercialCampaignStats>();
  for (const row of (enrollmentRows || []) as Array<Pick<CampaignEnrollment, "campaign_id" | "status">>) {
    const stats = statsByCampaign.get(row.campaign_id) || emptyStats();
    stats.total += 1;
    if (row.status === "queued") stats.queued += 1;
    if (row.status === "sent") stats.sent += 1;
    if (row.status === "replied") stats.replied += 1;
    if (row.status === "opted_out") stats.optedOut += 1;
    if (row.status === "completed") stats.completed += 1;
    if (row.status === "skipped") stats.skipped += 1;
    if (row.status === "failed") stats.failed += 1;
    statsByCampaign.set(row.campaign_id, stats);
  }

  return (campaignRows || []).map((row) => ({ ...asCampaign(row), stats: statsByCampaign.get(String(row.id)) || emptyStats() }));
}

export async function createCommercialCampaign(supabase: CrmSupabaseClient, payload: Record<string, unknown>, actorEmail: string) {
  const campaign = campaignInput(payload);
  const { data, error } = await supabase
    .from("crm_commercial_campaigns")
    .insert({ ...campaign, status: "draft", created_by: actorEmail })
    .select("*")
    .single();
  if (error) throw new CrmAuthError(502, "Commercial campaign could not be saved. Run the campaign migration.");
  return asCampaign(data);
}

export async function updateCommercialCampaign(supabase: CrmSupabaseClient, campaignId: string, payload: Record<string, unknown>) {
  const existing = await requireCampaign(supabase, campaignId);
  if (!campaignStatusSet.has(existing.status)) throw new CrmAuthError(400, "Campaign status is invalid.");
  const campaign = campaignInput(payload);
  const { data, error } = await supabase
    .from("crm_commercial_campaigns")
    .update(campaign)
    .eq("id", campaignId)
    .select("*")
    .single();
  if (error) throw new CrmAuthError(502, "Commercial campaign could not be updated.");
  return asCampaign(data);
}

export async function previewCommercialCampaign(supabase: CrmSupabaseClient, campaignId: string) {
  const campaign = await requireCampaign(supabase, campaignId);
  const [audience, enrollmentResult] = await Promise.all([
    audienceForCampaign(supabase, campaign),
    supabase.from("crm_commercial_campaign_enrollments").select("account_id").eq("campaign_id", campaign.id)
  ]);
  if (enrollmentResult.error) throw new CrmAuthError(502, "Campaign enrollment history could not be loaded.");
  const enrolled = new Set((enrollmentResult.data || []).map((row) => String(row.account_id)));
  const deliverable = audience.filter(canReceiveCampaign);
  const postalAddress = process.env.COMMERCIAL_OUTREACH_POSTAL_ADDRESS?.trim() || "[A valid 805 Shutters postal address is required before sending]";
  const samples = deliverable.slice(0, 3).map((account) => ({
    accountId: account.id,
    companyName: account.company_name,
    to: account.email,
    ...buildCommercialOutreachMessage(account, campaign.intro_subject, campaign.intro_body, postalAddress)
  }));

  return {
    totalMatching: audience.length,
    readyToEnroll: deliverable.filter((account) => !enrolled.has(account.id)).length,
    alreadyEnrolled: deliverable.filter((account) => enrolled.has(account.id)).length,
    missingEmail: audience.filter((account) => !account.email?.trim()).length,
    optedOut: audience.filter((account) => account.do_not_email || account.status === "do_not_contact").length,
    samples
  };
}

export async function activateCommercialCampaign(supabase: CrmSupabaseClient, campaignId: string) {
  const configuration = commercialConfiguration();
  if (!configuration.outboundEmail || !configuration.postalAddress) {
    throw new CrmAuthError(503, "Set commercial email delivery and the business postal address before activating automation.");
  }
  const campaign = await requireCampaign(supabase, campaignId);
  const audience = await audienceForCampaign(supabase, campaign);
  const deliverable = audience.filter(canReceiveCampaign);
  const now = new Date().toISOString();

  if (deliverable.length) {
    const { error: enrollmentError } = await supabase.from("crm_commercial_campaign_enrollments").upsert(
      deliverable.map((account) => ({ campaign_id: campaign.id, account_id: account.id, status: "queued", next_send_at: now })),
      { onConflict: "campaign_id,account_id", ignoreDuplicates: true }
    );
    if (enrollmentError) throw new CrmAuthError(502, "Campaign audience could not be enrolled.");
  }

  const { data, error } = await supabase
    .from("crm_commercial_campaigns")
    .update({ status: "active", launched_at: campaign.launched_at || now, paused_at: null })
    .eq("id", campaign.id)
    .select("*")
    .single();
  if (error) throw new CrmAuthError(502, "Commercial campaign could not be activated.");
  return { campaign: asCampaign(data), enrolled: deliverable.length };
}

export async function pauseCommercialCampaign(supabase: CrmSupabaseClient, campaignId: string) {
  const { data, error } = await supabase
    .from("crm_commercial_campaigns")
    .update({ status: "paused", paused_at: new Date().toISOString() })
    .eq("id", campaignId)
    .select("*")
    .single();
  if (error) throw new CrmAuthError(502, "Commercial campaign could not be paused.");
  return asCampaign(data);
}

async function sentToday(supabase: CrmSupabaseClient, campaignId: string, now: Date) {
  const { data, error } = await supabase
    .from("crm_commercial_campaign_enrollments")
    .select("intro_sent_at,follow_up_sent_at")
    .eq("campaign_id", campaignId);
  if (error) throw new CrmAuthError(502, "Campaign sending history could not be loaded.");
  const start = startOfToday(now);
  return (data || []).reduce((count, row) => count + Number(Boolean(row.intro_sent_at && row.intro_sent_at >= start)) + Number(Boolean(row.follow_up_sent_at && row.follow_up_sent_at >= start)), 0);
}

async function recordCampaignSend(
  supabase: CrmSupabaseClient,
  campaign: CommercialCampaign,
  enrollment: CampaignEnrollment,
  account: CommercialAccount,
  step: "intro" | "follow_up",
  now: Date,
  resendId: string | null
) {
  const nowIso = now.toISOString();
  const followUp = step === "follow_up";
  const { error: enrollmentError } = await supabase
    .from("crm_commercial_campaign_enrollments")
    .update(
      followUp
        ? { status: "completed", follow_up_sent_at: nowIso, next_send_at: null, completed_at: nowIso, last_error: null }
        : { status: "sent", started_at: enrollment.started_at || nowIso, intro_sent_at: nowIso, next_send_at: dateAfterDays(now, campaign.follow_up_delay_days), last_error: null }
    )
    .eq("id", enrollment.id);
  if (enrollmentError) throw new Error(`Campaign delivery state could not be saved: ${enrollmentError.message}`);

  const { error: activityError } = await supabase.from("crm_commercial_activities").insert({
    account_id: account.id,
    activity_type: "email_sent",
    actor_email: campaign.created_by || "commercial-automation",
    subject: step === "intro" ? campaign.intro_subject : campaign.follow_up_subject,
    body_preview: step === "intro" ? campaign.intro_body.slice(0, 5000) : campaign.follow_up_body.slice(0, 5000),
    external_message_id: resendId,
    occurred_at: nowIso,
    meta: { provider: "resend", recipient: account.email, campaignId: campaign.id, campaignName: campaign.name, step, automated: true }
  });
  if (activityError) console.warn("Commercial campaign activity logging", activityError.message);

  const { error: accountError } = await supabase
    .from("crm_commercial_accounts")
    .update({
      status: "contacted",
      last_contacted_at: nowIso,
      next_action: followUp ? "Review commercial campaign response" : "Automated commercial follow-up scheduled",
      next_action_due: followUp ? null : new Date(dateAfterDays(now, campaign.follow_up_delay_days)).toISOString().slice(0, 10)
    })
    .eq("id", account.id);
  if (accountError) console.warn("Commercial campaign account update", accountError.message);
}

export async function runCommercialCampaigns(
  supabase: CrmSupabaseClient,
  options: { now?: Date; campaignId?: string; allowFollowUps?: boolean } = {}
) {
  const now = options.now || new Date();
  const postalAddress = process.env.COMMERCIAL_OUTREACH_POSTAL_ADDRESS?.trim();
  if (!postalAddress) throw new CrmAuthError(503, "Add COMMERCIAL_OUTREACH_POSTAL_ADDRESS before campaign automation sends email.");

  let campaignQuery = supabase.from("crm_commercial_campaigns").select("*").eq("status", "active");
  if (options.campaignId) campaignQuery = campaignQuery.eq("id", options.campaignId);
  const { data: campaignRows, error: campaignError } = await campaignQuery;
  if (campaignError) throw new CrmAuthError(502, "Commercial campaign queue could not be loaded.");

  const result = { sent: 0, introSent: 0, followUpsSent: 0, skipped: 0, replied: 0, optedOut: 0, failed: 0, campaigns: 0 };
  for (const campaignRow of campaignRows || []) {
    const campaign = asCampaign(campaignRow);
    result.campaigns += 1;
    const remaining = campaign.daily_limit - (await sentToday(supabase, campaign.id, now));
    if (remaining <= 0) continue;

    const { data: dueRows, error: dueError } = await supabase
      .from("crm_commercial_campaign_enrollments")
      .select("*")
      .eq("campaign_id", campaign.id)
      .in("status", ["queued", "sent"])
      .lte("next_send_at", now.toISOString())
      .order("next_send_at", { ascending: true })
      .limit(remaining);
    if (dueError) throw new CrmAuthError(502, "Commercial campaign due messages could not be loaded.");

    for (const enrollmentRow of dueRows || []) {
      const enrollment = enrollmentRow as CampaignEnrollment;
      const isFollowUp = enrollment.status === "sent";
      if (isFollowUp && options.allowFollowUps === false) continue;

      const { data: accountRow, error: accountError } = await supabase.from("crm_commercial_accounts").select("*").eq("id", enrollment.account_id).maybeSingle();
      if (accountError || !accountRow) {
        await supabase.from("crm_commercial_campaign_enrollments").update({ status: "skipped", completed_at: now.toISOString(), last_error: "Commercial account could not be loaded." }).eq("id", enrollment.id);
        result.skipped += 1;
        continue;
      }
      const account = accountRow as CommercialAccount;
      const stopReason = campaignStopReason(account, enrollment);
      if (stopReason) {
        await supabase
          .from("crm_commercial_campaign_enrollments")
          .update({ status: enrollmentStatusForStop(stopReason), completed_at: now.toISOString(), next_send_at: null, last_error: stopReason === "missing_email" ? "No email address." : null })
          .eq("id", enrollment.id);
        if (stopReason === "replied") result.replied += 1;
        else if (stopReason === "opted_out") result.optedOut += 1;
        else result.skipped += 1;
        continue;
      }

      const subjectTemplate = isFollowUp ? campaign.follow_up_subject : campaign.intro_subject;
      const bodyTemplate = isFollowUp ? campaign.follow_up_body : campaign.intro_body;
      try {
        const message = buildCommercialOutreachMessage(account, subjectTemplate, bodyTemplate, postalAddress);
        const resendId = await sendCommercialOutreachMessage({ to: account.email as string, ...message });
        await recordCampaignSend(supabase, campaign, enrollment, account, isFollowUp ? "follow_up" : "intro", now, resendId);
        result.sent += 1;
        if (isFollowUp) result.followUpsSent += 1;
        else result.introSent += 1;
      } catch (error) {
        await supabase
          .from("crm_commercial_campaign_enrollments")
          .update({ status: "failed", completed_at: now.toISOString(), last_error: error instanceof Error ? error.message.slice(0, 1000) : "Campaign email failed." })
          .eq("id", enrollment.id);
        result.failed += 1;
      }
    }
    await supabase.from("crm_commercial_campaigns").update({ last_run_at: now.toISOString() }).eq("id", campaign.id);
  }
  return result;
}

export async function campaignEnrollmentStats(supabase: CrmSupabaseClient, campaignId: string) {
  const { data, error } = await supabase.from("crm_commercial_campaign_enrollments").select("*").eq("campaign_id", campaignId);
  if (error) throw new CrmAuthError(502, "Campaign enrollments could not be loaded.");
  return statsForEnrollments((data || []) as CampaignEnrollment[]);
}
