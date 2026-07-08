// Post-install Google-review request automation. When a job first reaches a
// completed-install status ("installed", "invoiced", or "closed"), text the
// customer a review link once. "closed" is included because in practice jobs
// often move straight from "ordered" to "closed" without passing through the
// install statuses, which left completed customers never asked. One-shot per
// job: the outcome (sent or skipped) is stamped into job.meta so a customer
// can never be asked twice, even if multiple callers fire on the same
// transition.
//
// The feature is enabled by setting GOOGLE_REVIEW_LINK (e.g. a g.page/r/...
// short link from the Google Business Profile dashboard). While it is unset,
// this module does nothing and writes nothing.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSms } from "@/lib/notify/twilio";
import { objectMeta } from "@/lib/crm/measure-needed-state";
import type { CrmJob, CrmJobStatus } from "@/lib/crm/types";

type CrmSupabaseClient = SupabaseClient;
type CrmActor = { email: string; userId?: string };

export const REVIEW_REQUEST_META_KEY = "review_request";

export type CrmReviewRequestMeta = {
  status?: "sent" | "skipped";
  sent_at?: string | null;
  skipped_reason?: string | null;
  sms_sid?: string | null;
  link?: string | null;
  requested_by?: string | null;
  request_source?: string | null;
};

export type ReviewRequestResult = {
  status: "sent" | "skipped" | "disabled" | "already_handled" | "not_applicable" | "error";
  message?: string;
};

const COMPLETED_INSTALL_STATUSES = new Set<CrmJobStatus>(["installed", "invoiced", "closed"]);

export function getReviewRequestMeta(meta: unknown): CrmReviewRequestMeta {
  return objectMeta(objectMeta(meta)[REVIEW_REQUEST_META_KEY]) as CrmReviewRequestMeta;
}

export function reviewRequestLink() {
  return process.env.GOOGLE_REVIEW_LINK?.trim() || null;
}

/** True when a status write moved the job into a completed-install status from outside it. */
export function isReviewRequestTransition(previousStatus: unknown, nextStatus: unknown) {
  return (
    COMPLETED_INSTALL_STATUSES.has(nextStatus as CrmJobStatus) &&
    !COMPLETED_INSTALL_STATUSES.has(previousStatus as CrmJobStatus)
  );
}

export function customerFirstName(customerName: unknown) {
  const first = String(customerName || "").trim().split(/\s+/)[0] || "";
  return first ? first[0].toUpperCase() + first.slice(1) : "there";
}

export function buildReviewRequestSmsBody(job: Pick<CrmJob, "customer_name">, link: string) {
  return (
    `Hi ${customerFirstName(job.customer_name)}, thank you from all of us at 805 Shutters! ` +
    `If you love your new window treatments, would you take 30 seconds to leave us a Google review? ` +
    `It means the world to our local family business: ${link} Reply STOP to opt out.`
  );
}

/**
 * Send the one-time review-request SMS for a job that just completed install.
 * Never throws; callers fire-and-forget on status transitions. Safe to call
 * repeatedly - the first outcome is stamped into job.meta and later calls
 * return "already_handled".
 */
export async function maybeSendReviewRequestForJob(
  supabase: CrmSupabaseClient,
  jobId: string,
  actor: CrmActor,
  source = "manual"
): Promise<ReviewRequestResult> {
  try {
    const link = reviewRequestLink();
    if (!link) return { status: "disabled", message: "GOOGLE_REVIEW_LINK is not configured." };

    const { data: job, error } = await supabase.from("crm_jobs").select("*").eq("id", jobId).maybeSingle();
    if (error || !job) return { status: "error", message: "CRM job was not found." };

    if (!COMPLETED_INSTALL_STATUSES.has(job.status as CrmJobStatus)) {
      return { status: "not_applicable", message: `Job status is ${job.status}.` };
    }
    if (getReviewRequestMeta(job.meta).status) {
      return { status: "already_handled" };
    }

    const now = new Date().toISOString();
    const sms = await sendSms({ to: job.phone, body: buildReviewRequestSmsBody(job as CrmJob, link) });

    // Twilio-unconfigured environments (local dev) leave no stamp so production
    // can still send when the same transition is replayed there.
    if (!sms.sent && sms.skipped === "twilio not configured") {
      return { status: "skipped", message: sms.skipped };
    }

    const outcome: CrmReviewRequestMeta = sms.sent
      ? {
          status: "sent",
          sent_at: now,
          sms_sid: sms.sid || null,
          link,
          requested_by: actor.email,
          request_source: source
        }
      : {
          status: "skipped",
          sent_at: null,
          skipped_reason: sms.skipped || sms.error || "SMS could not be sent.",
          link,
          requested_by: actor.email,
          request_source: source
        };

    const meta = { ...objectMeta(job.meta), [REVIEW_REQUEST_META_KEY]: outcome };
    const { error: metaError } = await supabase.from("crm_jobs").update({ meta }).eq("id", jobId);
    if (metaError) {
      console.error("review-request meta stamp failed", metaError.message);
    }

    try {
      const { recordCrmActivity } = await import("@/lib/crm/backend");
      await recordCrmActivity(supabase, actor, {
        entityType: "job",
        entityId: jobId,
        action: sms.sent ? "review_request.sent" : "review_request.skipped",
        metadata: { source, sid: sms.sid || null, reason: outcome.skipped_reason || null }
      });
    } catch (activityError) {
      console.error("review-request activity log failed", activityError);
    }

    return sms.sent
      ? { status: "sent" }
      : { status: "skipped", message: outcome.skipped_reason || undefined };
  } catch (error) {
    console.error("review-request automation failed", error);
    return { status: "error", message: error instanceof Error ? error.message : String(error) };
  }
}
