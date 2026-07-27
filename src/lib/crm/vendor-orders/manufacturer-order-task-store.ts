import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgenticOrderManifest } from "./manufacturer-order-form-registry";
import {
  manufacturerOrderFormRegistry,
  manufacturerOrderPortalUrl,
  type OrderFormManufacturer,
} from "./manufacturer-order-form-registry";
import type { VendorOrderPreparationSummary } from "./norman-order-preparation";

export type VendorOrderSourceKind = "signed_contract" | "submitted_technical_measure";

export type VendorOrderTaskContext = {
  sourceKind: VendorOrderSourceKind;
  sourceId: string;
  sourceRevision: string;
  technicalMeasureFormId: string | null;
  jobId: string;
  quoteId: string;
  customerSnapshot: {
    id?: string | null;
    name: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    city?: string | null;
  };
  quoteSnapshot: {
    quoteNumber?: string | null;
    signedAt?: string | null;
  };
};

const activeStatuses = ["needs_input", "queued", "processing", "review_ready", "failed"];
const manufacturers = ["Norman", "Onyx", "Lotus", "Polar"] as const;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function manufacturerLabel(value: string): VendorOrderPreparationSummary["manufacturer"] | null {
  const match = manufacturers.find((manufacturer) => manufacturer.toLowerCase() === value.toLowerCase());
  return match || null;
}

function sourceHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function buildSignedContractVendorOrderPreparations(input: {
  manifest: AgenticOrderManifest;
  context: VendorOrderTaskContext;
  requestedBy?: string;
}): VendorOrderPreparationSummary[] {
  const entries = Object.values(manufacturerOrderFormRegistry().manufacturers).flat();
  const grouped = new Map<VendorOrderPreparationSummary["manufacturer"], typeof input.manifest.lineItemPages>();
  for (const line of input.manifest.lineItemPages) {
    const manufacturer = manufacturerLabel(String(line.routingKey || "").split(":")[0] || "");
    if (!manufacturer) {
      throw new Error(`Signed-contract line ${line.sourceLineNumber} is missing exact manufacturer routing.`);
    }
    const lines = grouped.get(manufacturer) || [];
    lines.push(line);
    grouped.set(manufacturer, lines);
  }

  return Array.from(grouped.entries()).map(([manufacturer, lines]) => {
    const routingKeys = Array.from(new Set(lines.map((line) => line.routingKey).filter((value): value is string => Boolean(value))));
    const productNames = Array.from(new Set(lines.map((line) => line.productName).filter((value): value is string => Boolean(value))));
    const registryEntries = routingKeys.map((routingKey) => entries.find((entry) => entry.routing_key === routingKey)).filter(Boolean);
    const manufacturerKey = manufacturer.toLowerCase();
    const portalUrl = manufacturerOrderPortalUrl(manufacturerKey as OrderFormManufacturer);
    const orderPacketUrl = `/api/crm/vendor-order-packets/${encodeURIComponent(input.context.quoteId)}?manufacturer=${manufacturerKey}&format=html`;
    const hash = sourceHash({
      sourceRevision: input.context.sourceRevision,
      manufacturer,
      lines: lines.map((line) => ({
        sourceLineId: line.sourceLineId,
        routingKey: line.routingKey,
        values: line.sourceValues,
      })),
    });
    const reviewIssues = lines.filter((line) => line.status !== "ready");
    return {
      manufacturer,
      productType: productNames.length === 1
        ? registryEntries[0]?.product_key || "product"
        : "mixed",
      status: "queued",
      taskId: `contract:${input.context.quoteId}:${manufacturerKey}:${hash.slice(0, 12)}`,
      issueCount: reviewIssues.length,
      message: reviewIssues.length
        ? `${manufacturer} contract packet is ready with ${reviewIssues.length} portal-verification reminder${reviewIssues.length === 1 ? "" : "s"}.`
        : `${manufacturer} contract packet is ready for review and portal entry.`,
      requestedAt: new Date().toISOString(),
      requestedBy: input.requestedBy || null,
      sourceHash: hash,
      routingKeys,
      productNames,
      lineCount: lines.length,
      portalUrl,
      orderPacketUrl,
      payload: {
        schemaVersion: "manufacturer-order-queue.v1",
        safety: "review_before_submission",
        source: {
          kind: input.context.sourceKind,
          id: input.context.sourceId,
          revision: input.context.sourceRevision,
        },
        customer: input.context.customerSnapshot,
        jobId: input.context.jobId,
        quoteId: input.context.quoteId,
        quoteNumber: input.context.quoteSnapshot.quoteNumber || null,
        manufacturer,
        routingKeys,
        productNames,
        orderPacketUrl,
        lines,
      },
    };
  });
}

export async function persistVendorOrderPreparations(
  supabase: SupabaseClient,
  context: VendorOrderTaskContext,
  preparations: VendorOrderPreparationSummary[],
) {
  const durable = preparations.filter((preparation) =>
    preparation.taskId
    && preparation.status !== "skipped"
    && preparation.status !== "awaiting_measure"
    && preparation.status !== "queue_failed",
  );
  if (!durable.length) return [];

  const now = new Date().toISOString();
  const { error: supersedeError } = await supabase
    .from("crm_vendor_order_drafts")
    .update({ status: "superseded", superseded_at: now })
    .eq("crm_quote_id", context.quoteId)
    .in("status", activeStatuses)
    .neq("source_revision", context.sourceRevision);
  if (supersedeError) throw new Error(`Earlier manufacturer tasks could not be superseded: ${supersedeError.message}`);

  const rows = durable.map((preparation) => {
    const payload = object(preparation.payload);
    const validationIssues = Array.isArray(payload.issues) ? payload.issues : [];
    return {
      technical_measure_form_id: context.technicalMeasureFormId,
      crm_quote_id: context.quoteId,
      crm_job_id: context.jobId,
      manufacturer: preparation.manufacturer,
      product_type: preparation.productType,
      status: preparation.status,
      requested_by: preparation.requestedBy || null,
      requested_at: preparation.requestedAt || now,
      source_kind: context.sourceKind,
      source_id: context.sourceId,
      source_revision: context.sourceRevision,
      external_task_id: preparation.taskId,
      adapter_version: String(payload.adapterVersion || payload.schemaVersion || "manufacturer-order-queue.v1"),
      source_hash: preparation.sourceHash || sourceHash(preparation.payload),
      payload: preparation.payload || {},
      validation_issues: validationIssues,
      customer_snapshot: context.customerSnapshot,
      quote_snapshot: context.quoteSnapshot,
      routing_keys: preparation.routingKeys || [],
      product_names: preparation.productNames || [],
      line_count: Math.max(1, preparation.lineCount || 1),
      portal_url: preparation.portalUrl || null,
      order_packet_url: preparation.orderPacketUrl || null,
      message: preparation.message,
      error_message: preparation.status === "failed" ? preparation.message : null,
      superseded_at: null,
    };
  });
  const { data, error } = await supabase
    .from("crm_vendor_order_drafts")
    .upsert(rows, { onConflict: "crm_quote_id,manufacturer,source_kind,source_revision" })
    .select("*");
  if (error) throw new Error(`Manufacturer tasks could not be saved: ${error.message}`);
  return data || [];
}
