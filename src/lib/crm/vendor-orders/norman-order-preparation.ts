import { createHash } from "node:crypto";
import type { TechnicalMeasureForm } from "@/lib/crm/technical-measures";
import { buildNormanRollerDraftPlan, type NormanRollerProfile } from "./norman-roller";
import {
  buildOnyxAgentOrderPackets,
  isOnyxShutterValues,
  onyxLinesFromTechnicalMeasure,
  onyxPreparationSummary,
} from "./onyx-order-packet";

export type VendorOrderPreparationSummary = {
  manufacturer: "Norman" | "Onyx";
  productType: "roller" | "shutters";
  status: "skipped" | "awaiting_measure" | "needs_input" | "queued" | "processing" | "review_ready" | "failed" | "queue_failed";
  taskId: string | null;
  issueCount: number;
  message: string;
  requestedAt?: string;
  requestedBy?: string | null;
  sourceHash?: string;
  payload?: Record<string, unknown>;
  startedAt?: string;
  reviewReadyAt?: string;
  portalDraftId?: string | null;
  screenshotPath?: string | null;
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
  return form.lines.filter((line) => {
    const values = line.current_values;
    const details = values.details || {};
    const manufacturer = String(
      details.supplier
      ?? details.manufacturer
      ?? details.catalog_manufacturer
      ?? "",
    ).trim().toLowerCase();
    return values.product_id === "roller" && manufacturer === "norman";
  });
}

export function onyxShutterLines(form: TechnicalMeasureForm) {
  return form.lines.filter((line) => isOnyxShutterValues(line.current_values));
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
  form: TechnicalMeasureForm,
  requestedBy?: string,
): Promise<VendorOrderPreparationSummary> {
  const prepared = buildNormanRollerPreparation(form);
  if (!prepared) {
    return { manufacturer: "Norman", productType: "roller", status: "skipped", taskId: null, issueCount: 0, message: "No Norman Roller lines were found." };
  }

  const status = prepared.plan.ready ? "queued" : "needs_input";
  return {
    manufacturer: "Norman",
    productType: "roller",
    status,
    taskId: `norman:${form.id}:${prepared.sourceHash.slice(0, 12)}`,
    issueCount: prepared.plan.issues.length,
    requestedAt: new Date().toISOString(),
    requestedBy: requestedBy || null,
    sourceHash: prepared.sourceHash,
    payload: prepared.plan,
    message: status === "queued"
      ? "Norman Roller draft preparation is queued for review."
      : `Norman Roller needs ${prepared.plan.issues.length} correction${prepared.plan.issues.length === 1 ? "" : "s"} before portal entry.`,
  };
}

export function enqueueOnyxShutterPreparations(
  form: TechnicalMeasureForm,
  requestedBy?: string,
): VendorOrderPreparationSummary[] {
  const packets = buildOnyxAgentOrderPackets({
    sourceKind: "submitted_technical_measure",
    sourceId: form.id,
    contractId: form.contract_id,
    technicalMeasureId: form.id,
    jobId: form.job_id,
    quoteId: form.quote_id,
    quoteNumber: form.quote_snapshot.quoteNumber,
    generatedAt: form.submitted_at || new Date().toISOString(),
    customerId: form.customer_id,
    customerName: form.customer_snapshot.name,
    customerPhone: form.customer_snapshot.phone,
    customerEmail: form.customer_snapshot.email,
    jobsiteAddress: [form.customer_snapshot.address, form.customer_snapshot.city].filter(Boolean).join(", ") || null,
    jobNotes: String(form.meta.job_notes || ""),
  }, onyxLinesFromTechnicalMeasure(form));
  return packets.length
    ? packets.map((packet) => onyxPreparationSummary(packet, requestedBy))
    : [onyxPreparationSummary(null, requestedBy)];
}

/** Compatibility wrapper for callers that only accept one vendor preparation. */
export function enqueueOnyxShutterPreparation(
  form: TechnicalMeasureForm,
  requestedBy?: string,
): VendorOrderPreparationSummary {
  return enqueueOnyxShutterPreparations(form, requestedBy)[0];
}

export async function enqueueVendorOrderPreparations(
  form: TechnicalMeasureForm,
  requestedBy?: string,
): Promise<VendorOrderPreparationSummary[]> {
  const [norman, onyx] = await Promise.all([
    enqueueNormanRollerPreparation(form, requestedBy),
    Promise.resolve(enqueueOnyxShutterPreparations(form, requestedBy)),
  ]);
  return [norman, ...onyx].filter((preparation) => preparation.status !== "skipped");
}

/** Compatibility wrapper for older callers. New submission code must use the plural fan-out. */
export async function enqueueVendorOrderPreparation(
  form: TechnicalMeasureForm,
  requestedBy?: string,
): Promise<VendorOrderPreparationSummary> {
  const preparations = await enqueueVendorOrderPreparations(form, requestedBy);
  return preparations[0]
    || { manufacturer: "Norman", productType: "roller", status: "skipped", taskId: null, issueCount: 0, message: "No supported vendor-order lines were found." };
}
