import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { recordCrmActivity } from "@/lib/crm/backend";
import { getMeasureNeededMeta, objectMeta } from "@/lib/crm/measure-needed-state";

export const jobTrackingStages = [
  "scheduled", "need_follow_up", "sold_need_deposit", "need_measure", "need_to_order",
  "ordered", "shipped", "balance_needed", "complete", "lost", "archived"
] as const;

export type JobTrackingStage = (typeof jobTrackingStages)[number];
export type JobTrackingStageInput = {
  jobId?: string;
  quoteId?: string;
  bookkeepingEntryId?: string;
  stage: JobTrackingStage;
};

type Actor = { email: string; userId?: string };
type TrackingRecord = {
  id: string;
  updated_at: string;
  job_id?: string | null;
  quote_id?: string | null;
  meta?: Record<string, unknown> | null;
};
type TargetTable = "crm_jobs" | "crm_quotes" | "crm_quote_bookkeeping_entries";

const uuidPattern = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

export function parseJobTrackingStageInput(value: unknown): JobTrackingStageInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CrmAuthError(400, "A job tracking update is required.");
  }
  const input = value as Record<string, unknown>;
  if (!jobTrackingStages.includes(input.stage as JobTrackingStage)) {
    throw new CrmAuthError(400, "Unsupported job tracking stage.");
  }
  const result: JobTrackingStageInput = { stage: input.stage as JobTrackingStage };
  for (const key of ["jobId", "quoteId", "bookkeepingEntryId"] as const) {
    const id = input[key];
    if (id === undefined || id === null) continue;
    if (typeof id !== "string" || !uuidPattern.test(id.trim())) {
      throw new CrmAuthError(400, `A valid ${key} is required.`);
    }
    result[key] = id.trim().toLowerCase();
  }
  if (!result.jobId && !result.quoteId && !result.bookkeepingEntryId) {
    throw new CrmAuthError(400, "An exact job, quote, or bookkeeping entry ID is required.");
  }
  return result;
}

async function fetchRecord(supabase: SupabaseClient, table: TargetTable, id: string) {
  const { data, error } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
  if (error) throw new CrmAuthError(502, "The job tracking record could not be loaded.");
  const record = data as TrackingRecord | null;
  const meta = objectMeta(record?.meta);
  if (!record || meta.deleted_at || meta.bookkeeping_deleted_at) {
    throw new CrmAuthError(404, "The job tracking record was not found.");
  }
  return record;
}

function assertLinked(condition: boolean) {
  if (!condition) {
    throw new CrmAuthError(409, "The supplied job, quote, and bookkeeping entry do not refer to the same record. Refresh job tracking before trying again.");
  }
}

/**
 * A staff-entered operational marker, not evidence that a customer signed or paid.
 * Write one authoritative record only; never synchronize financial/canonical
 * lifecycle fields here. In particular, complete must not imply a zero balance.
 */
export async function updateJobTrackingStage(
  supabase: SupabaseClient,
  payload: unknown,
  actor: Actor
) {
  const input = parseJobTrackingStageInput(payload);
  const entry = input.bookkeepingEntryId
    ? await fetchRecord(supabase, "crm_quote_bookkeeping_entries", input.bookkeepingEntryId)
    : null;
  if (entry && input.quoteId) assertLinked(entry.quote_id === input.quoteId);
  const quoteId = input.quoteId || entry?.quote_id || undefined;
  const quote = quoteId ? await fetchRecord(supabase, "crm_quotes", quoteId) : null;
  if (quote && input.jobId) assertLinked(quote.job_id === input.jobId);
  if (entry?.job_id && quote) assertLinked(entry.job_id === quote.job_id);
  if (entry && input.jobId) assertLinked((entry.job_id || quote?.job_id) === input.jobId);
  const jobId = input.jobId || quote?.job_id || entry?.job_id || undefined;
  const job = jobId ? await fetchRecord(supabase, "crm_jobs", jobId) : null;

  if (input.stage === "ordered" && job) {
    const measure = getMeasureNeededMeta(job.meta);
    if (measure.status === "needed" || measure.form_status === "draft" || measure.form_status === "awaiting_signature") {
      throw new CrmAuthError(409, "Submit the required technical measure before marking this job ordered.");
    }
  }

  // Do not choose a quote by customer name or latest-date heuristics. A job-only
  // request writes the job marker, while a linked entry follows its exact quote.
  const target = quote || entry || job;
  if (!target) throw new CrmAuthError(404, "The job tracking record was not found.");
  const table: TargetTable = quote ? "crm_quotes" : entry ? "crm_quote_bookkeeping_entries" : "crm_jobs";
  const entityType = quote ? "quote" : entry ? "bookkeeping_entry" : "job";
  const beforeMeta = objectMeta(target.meta);
  const marker = {
    ...objectMeta(beforeMeta.job_tracking),
    stage: input.stage,
    updated_at: new Date().toISOString(),
    updated_by: actor.email,
    updated_by_user_id: actor.userId || null,
    source: "manual" as const
  };
  const { data, error } = await supabase
    .from(table)
    .update({ meta: { ...beforeMeta, job_tracking: marker } })
    .eq("id", target.id)
    .eq("updated_at", target.updated_at)
    .select("id")
    .maybeSingle();
  if (error) throw new CrmAuthError(502, "The job tracking stage could not be saved.");
  if (!data) throw new CrmAuthError(409, "This record changed while you were editing. Refresh job tracking and try again.");

  let auditRecorded = false;
  try {
    const audit = await recordCrmActivity(supabase, actor, {
      entityType,
      entityId: target.id,
      action: "job_tracking.stage_changed",
      before: { job_tracking: beforeMeta.job_tracking || null },
      after: { job_tracking: marker },
      metadata: {
        source: "job_tracking",
        jobId: job?.id || null,
        quoteId: quote?.id || null,
        bookkeepingEntryId: entry?.id || null,
        evidenceUnchanged: true
      }
    });
    auditRecorded = audit.recorded;
  } catch {
    // The marker already committed. A network failure in the separate audit
    // insert must not tell the user that the stage change itself failed.
  }

  return {
    id: target.id,
    entityType,
    jobId: job?.id || null,
    quoteId: quote?.id || null,
    bookkeepingEntryId: entry?.id || null,
    jobTracking: marker,
    auditRecorded,
    warning: auditRecorded ? null : "Stage saved, but the activity log could not be recorded. The record still retains who changed its current stage and when."
  };
}
