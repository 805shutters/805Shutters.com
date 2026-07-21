import type { CrmJob, CrmQuote } from "@/lib/crm/types";

export const MEASURE_NEEDED_META_KEY = "measure_needed";

export type CrmMeasureNeededStatus = "needed" | "not_needed" | "measured";
export type TechnicalMeasureDecision = Extract<CrmMeasureNeededStatus, "needed" | "not_needed">;

export type CrmMeasureNeededMeta = {
  status?: CrmMeasureNeededStatus;
  requested_at?: string | null;
  requested_by?: string | null;
  request_source?: string | null;
  measured_at?: string | null;
  measured_by?: string | null;
  mts_job_id?: string | null;
  mts_job_number?: string | null;
  mts_sync_status?: "created" | "existing" | "skipped" | "error" | null;
  mts_sync_error?: string | null;
  last_mts_sync_attempt_at?: string | null;
};

export function objectMeta(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function getMeasureNeededMeta(meta: unknown): CrmMeasureNeededMeta {
  return objectMeta(objectMeta(meta)[MEASURE_NEEDED_META_KEY]) as CrmMeasureNeededMeta;
}

export function isMeasureNeededJob(job: Pick<CrmJob, "meta" | "status">) {
  return job.status === "sold" && getMeasureNeededMeta(job.meta).status === "needed";
}

export function isTechnicalMeasureDecision(value: unknown): value is TechnicalMeasureDecision {
  return value === "needed" || value === "not_needed";
}

export function technicalMeasureSmsLine(status?: CrmMeasureNeededStatus | null): string {
  return `Technical Measure: ${status === "needed" ? "Needed" : "Not Needed"}`;
}

export function measureNeededLabel(job: Pick<CrmJob, "meta">) {
  const measure = getMeasureNeededMeta(job.meta);
  if (measure.status === "needed") {
    return measure.mts_job_number ? `Measure needed - MTS ${measure.mts_job_number}` : "Measure needed";
  }
  if (measure.status === "not_needed") return "No measure needed";
  if (measure.status === "measured") return "Measured";
  return "No measure flag";
}

export function isJessicaOwner(value: unknown) {
  return String(value || "").trim().toLowerCase().includes("jessica");
}

export function shouldRequestMeasureForSoldJessicaJob(job: Pick<CrmJob, "sales_owner">, quote?: Pick<CrmQuote, "sold_by"> | null) {
  return isJessicaOwner(job.sales_owner) || isJessicaOwner(quote?.sold_by);
}
