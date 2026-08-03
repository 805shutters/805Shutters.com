import { createHash } from "node:crypto";
import type { TechnicalMeasureForm } from "@/lib/crm/technical-measures";
import { buildNormanRollerDraftPlan, type NormanRollerProfile } from "./norman-roller";
import {
  buildOnyxAgentOrderPackets,
  isOnyxShutterValues,
  onyxLinesFromTechnicalMeasure,
  onyxPreparationSummary,
} from "./onyx-order-packet";
import {
  manufacturerOrderPortalUrl,
  type OrderFormManufacturer,
} from "./manufacturer-order-form-registry";
import { resolveManufacturerTechnicalMeasureSchema } from "./manufacturer-technical-measure-schemas";

export type VendorOrderPreparationSummary = {
  manufacturer: "Norman" | "Onyx" | "Lotus" | "Polar";
  productType: string;
  status: "skipped" | "awaiting_measure" | "needs_input" | "queued" | "processing" | "review_ready" | "failed" | "queue_failed";
  taskId: string | null;
  issueCount: number;
  message: string;
  routingKeys?: string[];
  productNames?: string[];
  lineCount?: number;
  portalUrl?: string;
  orderPacketUrl?: string;
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
  const grouped = new Map<OrderFormManufacturer, Array<{
    line: TechnicalMeasureForm["lines"][number];
    schema: NonNullable<TechnicalMeasureForm["lines"][number]["measure_schema"]>;
  }>>();
  const unresolvedLines: number[] = [];
  for (const line of form.lines) {
    const schema = line.measure_schema || resolveManufacturerTechnicalMeasureSchema(line.current_values);
    if (!schema) {
      unresolvedLines.push(line.sort_order);
      continue;
    }
    const manufacturer = schema.manufacturer.toLowerCase() as OrderFormManufacturer;
    if (!["norman", "onyx", "lotus", "polar"].includes(manufacturer)) continue;
    const lines = grouped.get(manufacturer) || [];
    lines.push({ line, schema });
    grouped.set(manufacturer, lines);
  }
  if (unresolvedLines.length) {
    throw new Error(`Exact manufacturer and product routing is missing for line${unresolvedLines.length === 1 ? "" : "s"} ${unresolvedLines.join(", ")}.`);
  }

  const label = (manufacturer: OrderFormManufacturer) =>
    `${manufacturer.charAt(0).toUpperCase()}${manufacturer.slice(1)}` as VendorOrderPreparationSummary["manufacturer"];
  const requestedAt = new Date().toISOString();

  return Promise.all(Array.from(grouped.entries()).map(async ([manufacturer, lines]) => {
    const routingKeys = Array.from(new Set(lines.map(({ schema }) => schema.routingKey)));
    const productNames = Array.from(new Set(lines.map(({ schema }) => schema.productName)));
    if (manufacturer === "polar") {
      const sourceHash = createHash("sha256").update(JSON.stringify({
        formId: form.id,
        submittedAt: form.submitted_at,
        manufacturer,
        lineIds: lines.map(({ line }) => line.id),
      })).digest("hex");
      return {
        manufacturer: "Polar",
        productType: productNames.length === 1 ? lines[0].schema.productKey : "mixed",
        status: "needs_input",
        taskId: `polar-quote-only:${form.id}:${sourceHash.slice(0, 12)}`,
        issueCount: lines.length,
        message: "QUOTE ONLY — Polar pricing, order preparation, and manufacturer action are blocked.",
        requestedAt,
        requestedBy: requestedBy || null,
        sourceHash,
        routingKeys,
        productNames,
        lineCount: lines.length,
        payload: {
          schemaVersion: "polar-quote-only.v1",
          safety: "quote_only_no_follow_on_action",
          quoteId: form.quote_id,
          lineIds: lines.map(({ line }) => line.id),
        },
      } satisfies VendorOrderPreparationSummary;
    }
    const portalUrl = manufacturerOrderPortalUrl(manufacturer);
    const orderPacketUrl = `/api/crm/vendor-order-packets/${encodeURIComponent(form.quote_id)}?manufacturer=${encodeURIComponent(manufacturer)}&format=html`;
    const allNormanRoller = manufacturer === "norman"
      && lines.every(({ line }) => normanRollerLines({ ...form, lines: [line] }).length === 1);
    if (allNormanRoller) {
      const specialized = await enqueueNormanRollerPreparation({ ...form, lines: lines.map(({ line }) => line) }, requestedBy);
      return {
        ...specialized,
        routingKeys,
        productNames,
        lineCount: lines.length,
        portalUrl,
        orderPacketUrl,
      };
    }

    const sourceHash = createHash("sha256").update(JSON.stringify({
      formId: form.id,
      submittedAt: form.submitted_at,
      manufacturer,
      lines: lines.map(({ line, schema }) => ({
        id: line.id,
        routingKey: schema.routingKey,
        values: line.current_values,
      })),
    })).digest("hex");
    const manufacturerLabel = label(manufacturer);
    const payload = {
      schemaVersion: "manufacturer-order-queue.v1",
      safety: "review_before_submission",
      source: {
        kind: "submitted_technical_measure",
        formId: form.id,
        submittedAt: form.submitted_at,
        contractId: form.contract_id,
      },
      customer: {
        id: form.customer_id,
        name: form.customer_snapshot.name,
        phone: form.customer_snapshot.phone,
        email: form.customer_snapshot.email,
        address: form.customer_snapshot.address,
        city: form.customer_snapshot.city,
      },
      jobId: form.job_id,
      quoteId: form.quote_id,
      quoteNumber: form.quote_snapshot.quoteNumber,
      manufacturer: manufacturerLabel,
      routingKeys,
      productNames,
      orderPacketUrl,
      lines: lines.map(({ line, schema }) => ({
        technicalMeasureLineId: line.id,
        sourceLineId: line.source_quote_line_item_id || line.quote_line_item_id,
        routingKey: schema.routingKey,
        productName: schema.productName,
        values: line.current_values,
        technicalMeasureDocxUrl: schema.technicalMeasureDocxUrl,
        technicalMeasurePdfUrl: schema.technicalMeasurePdfUrl,
        orderTemplateDocxUrl: schema.orderTemplateDocxUrl,
        orderTemplatePdfUrl: schema.orderTemplatePdfUrl,
        orderSchemaPath: schema.orderSchemaPath,
      })),
    };
    return {
      manufacturer: manufacturerLabel,
      productType: productNames.length === 1 ? lines[0].schema.productKey : "mixed",
      status: "queued",
      taskId: `${manufacturer}:${form.id}:${sourceHash.slice(0, 12)}`,
      issueCount: 0,
      message: `${manufacturerLabel} order packet is ready for review and portal entry.`,
      requestedAt,
      requestedBy: requestedBy || null,
      sourceHash,
      routingKeys,
      productNames,
      lineCount: lines.length,
      portalUrl,
      orderPacketUrl,
      payload,
    } satisfies VendorOrderPreparationSummary;
  }));
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
