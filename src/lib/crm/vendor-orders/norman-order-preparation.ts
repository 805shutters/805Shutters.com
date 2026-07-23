import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TechnicalMeasureForm } from "@/lib/crm/technical-measures";
import { buildNormanRollerDraftPlan, type NormanRollerProfile } from "./norman-roller";

export type VendorOrderPreparationSummary = {
  manufacturer: "Norman";
  productType: "roller";
  status: "skipped" | "needs_input" | "queued" | "queue_failed";
  taskId: string | null;
  issueCount: number;
  message: string;
};

function profileFromEnvironment(): NormanRollerProfile {
  const leadTime = process.env.NORMAN_DEFAULT_LEAD_TIME_CODE;
  const shipVia = process.env.NORMAN_DEFAULT_SHIP_VIA_CODE;
  return {
    accountId: process.env.NORMAN_ACCOUNT_ID?.trim() || "RA00743",
    leadTimeCode: leadTime === "14" ? "14" : "09",
    shipViaCode: shipVia === "20" ? "20" : "B1",
    shipToProfileId: process.env.NORMAN_SHIP_TO_PROFILE_ID?.trim() || "",
    deliveryFlags: {
      callBeforeDelivery: process.env.NORMAN_CALL_BEFORE_DELIVERY === "true",
      residential: process.env.NORMAN_RESIDENTIAL_DELIVERY === "true",
      smallTruck: process.env.NORMAN_SMALL_TRUCK_DELIVERY === "true",
      liftgate: process.env.NORMAN_LIFTGATE_DELIVERY === "true",
      insideDelivery: process.env.NORMAN_INSIDE_DELIVERY === "true",
    },
  };
}

export function normanRollerLines(form: TechnicalMeasureForm) {
  return form.lines.filter((line) => line.current_values.product_id === "roller");
}

export function buildNormanRollerPreparation(form: TechnicalMeasureForm, now = new Date()) {
  const lines = normanRollerLines(form);
  if (!lines.length) return null;
  const scopedForm = { ...form, lines };
  const plan = buildNormanRollerDraftPlan(scopedForm, profileFromEnvironment(), now);
  const sourceHash = createHash("sha256").update(JSON.stringify({
    formId: form.id,
    submittedAt: form.submitted_at,
    lines: lines.map((line) => ({ id: line.id, values: line.current_values, priceStatus: line.price_status })),
    adapterVersion: plan.adapterVersion,
  })).digest("hex");
  return { plan, sourceHash };
}

export function validateNormanRollerMeasureForSubmission(form: TechnicalMeasureForm) {
  const lines = normanRollerLines(form);
  if (!lines.length) return [];
  const projected = {
    ...form,
    status: "submitted" as const,
    submitted_at: form.submitted_at || new Date().toISOString(),
    lines,
  };
  return buildNormanRollerDraftPlan(projected, {
    accountId: "validation-only",
    leadTimeCode: "09",
    shipViaCode: "B1",
    shipToProfileId: "validation-only",
  }).issues;
}

export async function enqueueNormanRollerPreparation(
  supabase: SupabaseClient,
  form: TechnicalMeasureForm,
  requestedBy?: string,
): Promise<VendorOrderPreparationSummary> {
  const prepared = buildNormanRollerPreparation(form);
  if (!prepared) {
    return { manufacturer: "Norman", productType: "roller", status: "skipped", taskId: null, issueCount: 0, message: "No Norman Roller lines were found." };
  }

  const status = prepared.plan.ready ? "queued" : "needs_input";
  const { data, error } = await supabase.from("crm_vendor_order_drafts").upsert({
    technical_measure_form_id: form.id,
    crm_quote_id: form.quote_id,
    crm_job_id: form.job_id,
    manufacturer: "Norman",
    product_type: "roller",
    status,
    requested_by: requestedBy || null,
    requested_at: new Date().toISOString(),
    adapter_version: prepared.plan.adapterVersion,
    source_hash: prepared.sourceHash,
    payload: prepared.plan,
    validation_issues: prepared.plan.issues,
    error_message: null,
    started_at: null,
    review_ready_at: null,
    portal_draft_id: null,
    screenshot_path: null,
  }, { onConflict: "technical_measure_form_id,manufacturer,product_type" }).select("id").single();

  if (error || !data) throw new Error(error?.message || "Norman order preparation could not be queued.");
  return {
    manufacturer: "Norman",
    productType: "roller",
    status,
    taskId: String(data.id),
    issueCount: prepared.plan.issues.length,
    message: status === "queued"
      ? "Norman Roller draft preparation is queued for review."
      : `Norman Roller needs ${prepared.plan.issues.length} correction${prepared.plan.issues.length === 1 ? "" : "s"} before portal entry.`,
  };
}
