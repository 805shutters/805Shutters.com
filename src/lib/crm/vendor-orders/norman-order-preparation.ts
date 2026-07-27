import { createHash } from "node:crypto";
import type { TechnicalMeasureForm } from "@/lib/crm/technical-measures";
import { buildNormanRollerDraftPlan, type NormanRollerProfile } from "./norman-roller";

export type VendorOrderPreparationSummary = {
  manufacturer: "Norman" | "Onyx";
  productType: "roller" | "shutters";
  status: "skipped" | "needs_input" | "queued" | "processing" | "review_ready" | "failed" | "queue_failed";
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
  return form.lines.filter((line) => {
    const values = line.current_values;
    const details = values.details || {};
    const manufacturer = String(
      details.supplier
      ?? details.manufacturer
      ?? details.catalog_manufacturer
      ?? "",
    ).trim().toLowerCase();
    return values.product_id.toLowerCase().includes("shutter") && manufacturer.includes("onyx");
  });
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

export function enqueueOnyxShutterPreparation(
  form: TechnicalMeasureForm,
  requestedBy?: string,
): VendorOrderPreparationSummary {
  const lines = onyxShutterLines(form);
  if (!lines.length) {
    return { manufacturer: "Onyx", productType: "shutters", status: "skipped", taskId: null, issueCount: 0, message: "No Onyx shutter lines were found." };
  }
  const sourceHash = createHash("sha256").update(JSON.stringify({
    formId: form.id,
    submittedAt: form.submitted_at,
    lines: lines.map((line) => ({ id: line.id, values: line.current_values, priceStatus: line.price_status })),
    adapterVersion: "onyx-shutter-measure-v1",
  })).digest("hex");
  return {
    manufacturer: "Onyx",
    productType: "shutters",
    status: "queued",
    taskId: `onyx:${form.id}:${sourceHash.slice(0, 12)}`,
    issueCount: 0,
    requestedAt: new Date().toISOString(),
    requestedBy: requestedBy || null,
    sourceHash,
    payload: {
      adapterVersion: "onyx-shutter-measure-v1",
      ready: true,
      issues: [],
      source: { formId: form.id, quoteId: form.quote_id, submittedAt: form.submitted_at },
      header: {
        customerName: form.customer_snapshot.name,
        quoteNumber: form.quote_snapshot.quoteNumber,
      },
      lines: lines.map((line) => ({
        lineId: line.id,
        sortOrder: line.sort_order,
        room: line.current_values.room,
        widthIn: line.current_values.width_in,
        heightIn: line.current_values.height_in,
        quantity: line.current_values.quantity,
        details: line.current_values.details,
        notes: line.current_values.notes,
      })),
    },
    message: "Onyx shutter order entry is queued from the submitted technical measure.",
  };
}

export async function enqueueVendorOrderPreparation(
  form: TechnicalMeasureForm,
  requestedBy?: string,
): Promise<VendorOrderPreparationSummary> {
  const norman = await enqueueNormanRollerPreparation(form, requestedBy);
  if (norman.status !== "skipped") return norman;
  return enqueueOnyxShutterPreparation(form, requestedBy);
}
