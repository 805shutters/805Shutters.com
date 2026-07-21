import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { recordCrmActivity } from "@/lib/crm/backend";
import { CrmAuthError } from "@/lib/crm/auth";
import {
  MEASURE_NEEDED_META_KEY,
  CrmMeasureNeededMeta,
  getMeasureNeededMeta,
  objectMeta
} from "@/lib/crm/measure-needed-state";
import type { CrmJob } from "@/lib/crm/types";

type CrmSupabaseClient = SupabaseClient;
type CrmActor = { email: string; userId?: string };

const DEFAULT_SHUTTERS_805_ACCOUNT_ID = "72ccf12a-11c0-4261-8ad0-31af8ad0bbfb";

type MtsMeasureCardResult = {
  status: "created" | "existing" | "skipped" | "error";
  jobId?: string | null;
  jobNumber?: string | null;
  message?: string;
};

function getMtsClient() {
  const url = process.env.MTS_SUPABASE_URL;
  const serviceRoleKey = process.env.MTS_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function mts805AccountId() {
  return process.env.MTS_805_ACCOUNT_ID || DEFAULT_SHUTTERS_805_ACCOUNT_ID;
}

function productTypeForMts(productInterest: string | null | undefined) {
  const lower = String(productInterest || "").toLowerCase();
  if (lower.includes("shutter")) return "shutters";
  if (lower.includes("drap")) return "drapery";
  return "blinds_shades";
}

function measureReference(jobId: string) {
  return `805:${jobId}`;
}

function mergeMeasureMeta(meta: unknown, patch: CrmMeasureNeededMeta) {
  const current = objectMeta(meta);
  const measure = {
    ...getMeasureNeededMeta(current),
    ...patch
  };

  return {
    ...current,
    [MEASURE_NEEDED_META_KEY]: measure
  };
}

async function fetchJob(supabase: CrmSupabaseClient, jobId: string): Promise<CrmJob> {
  const { data, error } = await supabase.from("crm_jobs").select("*").eq("id", jobId).maybeSingle();
  if (error || !data) throw new CrmAuthError(404, "CRM job was not found.");
  return data as CrmJob;
}

async function ensureMtsMeasureCard(job: CrmJob): Promise<MtsMeasureCardResult> {
  const mts = getMtsClient();
  if (!mts) {
    return {
      status: "skipped",
      message: "MTS Supabase credentials are not configured."
    };
  }

  const projectNumber = measureReference(job.id);
  const accountId = mts805AccountId();
  const { data: existing, error: existingError } = await mts
    .from("jobs")
    .select("id,job_number,status")
    .eq("account_id", accountId)
    .eq("project_number", projectNumber)
    .or("is_deleted.is.null,is_deleted.eq.false")
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return { status: "error", message: existingError.message };
  }

  if (existing) {
    const row = existing as { id?: string | null; job_number?: string | null };
    return {
      status: "existing",
      jobId: row.id || null,
      jobNumber: row.job_number || null
    };
  }

  const notes = [
    "Technical measure requested by 805 Shutters.",
    `805 CRM job: ${job.id}`,
    job.notes ? `805 notes: ${job.notes}` : null
  ].filter(Boolean).join("\n");

  const now = new Date().toISOString();
  const payload = {
    customer_name: job.customer_name || "Unknown customer",
    customer_phone: job.phone || null,
    customer_email: job.email || null,
    customer_address: job.address || "Address Required",
    job_type: "technical_measure",
    product_type: productTypeForMts(job.product_interest),
    account_id: accountId,
    duration_minutes: 60,
    status: "ready_to_schedule",
    must_be_tech: "mike_only",
    status_changed_at: now,
    updated_at: now,
    creation_method: "805_crm_measure_needed",
    project_number: projectNumber,
    technician_notes: notes
  };

  const { data, error } = await mts.rpc("create_dashboard_job_card", { p_job: payload });
  if (error) return { status: "error", message: error.message };

  const created = data as { id?: string | null; job_number?: string | null } | null;
  if (created?.id) {
    await mts.from("job_actions").insert({
      job_id: created.id,
      action_type: "805_measure_needed_created",
      performed_by_ai: true,
      details: {
        source: "805_crm",
        crm_job_id: job.id,
        project_number: projectNumber
      }
    });
  }

  return {
    status: "created",
    jobId: created?.id || null,
    jobNumber: created?.job_number || null
  };
}

export async function requestMeasureNeededForJob(
  supabase: CrmSupabaseClient,
  jobId: string,
  actor: CrmActor,
  source = "manual"
) {
  const existing = await fetchJob(supabase, jobId);
  const currentMeasure = getMeasureNeededMeta(existing.meta);
  const now = new Date().toISOString();

  const requestedMeta = mergeMeasureMeta(existing.meta, {
    status: "needed",
    requested_at: currentMeasure.requested_at || now,
    requested_by: currentMeasure.requested_by || actor.email,
    request_source: currentMeasure.request_source || source,
    measured_at: null,
    measured_by: null,
    last_mts_sync_attempt_at: now
  });

  const { data: flagged, error: flagError } = await supabase
    .from("crm_jobs")
    .update({
      meta: requestedMeta,
      next_action: "Technical measure needed"
    })
    .eq("id", jobId)
    .select("*")
    .maybeSingle();
  if (flagError || !flagged) throw new CrmAuthError(502, "Measure-needed status could not be saved.");

  const mtsResult = await ensureMtsMeasureCard(flagged as CrmJob);
  const finalMeta = mergeMeasureMeta((flagged as CrmJob).meta, {
    mts_job_id: mtsResult.jobId || currentMeasure.mts_job_id || null,
    mts_job_number: mtsResult.jobNumber || currentMeasure.mts_job_number || null,
    mts_sync_status: mtsResult.status,
    mts_sync_error: mtsResult.status === "error" || mtsResult.status === "skipped" ? mtsResult.message || null : null,
    last_mts_sync_attempt_at: now
  });

  const { data: finalJob, error: finalError } = await supabase
    .from("crm_jobs")
    .update({ meta: finalMeta })
    .eq("id", jobId)
    .select("*")
    .maybeSingle();
  if (finalError || !finalJob) throw new CrmAuthError(502, "MTS measure-card status could not be saved.");

  await recordCrmActivity(supabase, actor, {
    entityType: "job",
    entityId: jobId,
    action: "measure_needed.request",
    metadata: { source, mts: mtsResult }
  });

  return { job: finalJob as CrmJob, mts: mtsResult };
}

export async function markMeasureNotNeededForJob(
  supabase: CrmSupabaseClient,
  jobId: string,
  actor: CrmActor,
  source = "manual"
) {
  const existing = await fetchJob(supabase, jobId);
  const currentMeasure = getMeasureNeededMeta(existing.meta);
  const now = new Date().toISOString();
  const meta = mergeMeasureMeta(existing.meta, {
    status: "not_needed",
    requested_at: currentMeasure.requested_at || now,
    requested_by: currentMeasure.requested_by || actor.email,
    request_source: currentMeasure.request_source || source,
    measured_at: null,
    measured_by: null,
    mts_sync_status: currentMeasure.mts_sync_status || null,
    mts_sync_error: currentMeasure.mts_sync_error || null
  });

  const { data, error } = await supabase
    .from("crm_jobs")
    .update({
      meta,
      next_action: existing.status === "sold" ? "Order product" : existing.next_action
    })
    .eq("id", jobId)
    .select("*")
    .maybeSingle();
  if (error || !data) throw new CrmAuthError(502, "No-measure status could not be saved.");

  await recordCrmActivity(supabase, actor, {
    entityType: "job",
    entityId: jobId,
    action: "measure_needed.not_needed",
    metadata: { source }
  });

  return { job: data as CrmJob };
}

export async function completeMeasureNeededForJob(
  supabase: CrmSupabaseClient,
  jobId: string,
  actor: CrmActor
) {
  const existing = await fetchJob(supabase, jobId);
  const now = new Date().toISOString();
  const meta = mergeMeasureMeta(existing.meta, {
    status: "measured",
    measured_at: now,
    measured_by: actor.email
  });

  const { data, error } = await supabase
    .from("crm_jobs")
    .update({
      meta,
      next_action: "Measurement complete"
    })
    .eq("id", jobId)
    .select("*")
    .maybeSingle();
  if (error || !data) throw new CrmAuthError(502, "Measured status could not be saved.");

  await recordCrmActivity(supabase, actor, {
    entityType: "job",
    entityId: jobId,
    action: "measure_needed.complete"
  });

  return { job: data as CrmJob };
}
