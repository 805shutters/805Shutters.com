import type { SupabaseClient } from "@supabase/supabase-js";
import { selectedDesign } from "@/lib/crm/quote-money";
import type {
  CrmQuote,
  CrmQuoteDesign,
  CrmQuoteDetailValue,
  CrmQuoteLineItem,
  CrmQuoteWithItems,
} from "@/lib/crm/types";
import type { TechnicalMeasureForm, TechnicalMeasureLineValues } from "@/lib/crm/technical-measures";
import {
  buildAgenticOrderManifest,
  type AgenticOrderManifest,
  type OrderFormSourceValues,
} from "./manufacturer-order-form-registry";

type ManifestContext = {
  customerId: string;
  customerName: string;
  jobId: string;
  quoteId: string;
  quoteNumber: string | null;
  measureStatus: "measure_required" | "no_measure";
  generatedAt: string;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function detailRecord(design: CrmQuoteDesign): Record<string, CrmQuoteDetailValue> {
  const details = { ...object(design.details) } as Record<string, CrmQuoteDetailValue>;
  const priceBreakdown = object(design.price_breakdown);
  for (const [key, value] of Object.entries(object(priceBreakdown.optionsJson))) {
    if (
      !Object.prototype.hasOwnProperty.call(details, key)
      && (value === null || ["string", "number", "boolean"].includes(typeof value))
    ) {
      details[key] = value as CrmQuoteDetailValue;
    }
  }
  return details;
}

function quoteLineValues(line: CrmQuoteLineItem, design: CrmQuoteDesign): OrderFormSourceValues {
  return {
    product_id: design.product_id,
    program_id: design.program_id,
    quantity: Math.max(1, Math.floor(Number(line.quantity) || 1)),
    details: {
      ...detailRecord(design),
      room: line.room || "Window",
      width_in: line.width_in,
      height_in: line.height_in,
      notes: line.notes || design.notes || "",
      fabric: design.fabric,
      motorization: design.motorization || [],
      surcharges: design.surcharges || [],
    },
  };
}

function signedLineIds(quote: Pick<CrmQuote, "meta">): Set<string> | null {
  const ids = object(object(quote.meta).signed_selection).lineItemIds;
  return Array.isArray(ids)
    ? new Set(ids.filter((id): id is string => typeof id === "string"))
    : null;
}

export function orderManifestLinesFromSignedContract(quote: CrmQuoteWithItems) {
  const selectedIds = signedLineIds(quote);
  return quote.lineItems.flatMap((line) => {
    if (selectedIds && !selectedIds.has(line.id)) return [];
    const design = selectedDesign(line);
    if (!design) return [];
    return [{ id: line.id, values: quoteLineValues(line, design) }];
  });
}

export function orderManifestLinesFromTechnicalMeasure(form: TechnicalMeasureForm) {
  return form.lines.map((line) => ({
    id: line.id,
    values: {
      ...line.current_values,
      details: {
        ...line.current_values.details,
        room: line.current_values.room,
        opening_label: line.current_values.opening_label,
        width_in: line.current_values.width_in,
        height_in: line.current_values.height_in,
        notes: line.current_values.notes,
        fabric: line.current_values.fabric,
        motorization: line.current_values.motorization,
        surcharges: line.current_values.surcharges,
      },
    } satisfies OrderFormSourceValues,
  }));
}

export function buildSignedContractOrderManifest(
  quote: CrmQuoteWithItems,
  context: ManifestContext,
): AgenticOrderManifest {
  return buildAgenticOrderManifest({
    customerId: context.customerId,
    quoteId: context.quoteId,
    measureStatus: context.measureStatus,
    technicalMeasureSubmitted: false,
    lines: orderManifestLinesFromSignedContract(quote),
  });
}

export function buildTechnicalMeasureOrderManifest(
  form: TechnicalMeasureForm,
): AgenticOrderManifest {
  return buildAgenticOrderManifest({
    customerId: form.customer_id || "",
    quoteId: form.quote_id,
    measureStatus: "measure_required",
    technicalMeasureSubmitted: true,
    lines: orderManifestLinesFromTechnicalMeasure(form),
  });
}

export async function upsertManufacturerOrderManifestArtifact(
  supabase: SupabaseClient,
  manifest: AgenticOrderManifest,
  context: ManifestContext & {
    sourceKind: "signed_contract" | "submitted_technical_measure";
    sourceId: string;
  },
) {
  const externalId = `manufacturer-order-manifest:${context.quoteId}`;
  const { data: existing } = await supabase
    .from("crm_customer_contracts")
    .select("meta")
    .eq("external_source", "manufacturer_order_manifest")
    .eq("external_id", externalId)
    .maybeSingle();
  const existingMeta = object(existing?.meta);
  const current = object(existingMeta.current_manifest);
  const history = Array.isArray(existingMeta.manifest_history)
    ? [...existingMeta.manifest_history]
    : [];
  const revisionId = `${context.sourceKind}:${context.sourceId}:${context.generatedAt}`;
  if (current.revisionId && current.revisionId !== revisionId) history.push(current);

  const currentManifest = {
    revisionId,
    sourceKind: context.sourceKind,
    sourceId: context.sourceId,
    generatedAt: context.generatedAt,
    customerName: context.customerName,
    quoteNumber: context.quoteNumber,
    manifest,
  };
  const status = manifest.releaseStatus === "ready"
    ? context.measureStatus === "measure_required" && context.sourceKind === "signed_contract"
      ? "awaiting_measure"
      : "ready"
    : "order_review_required";

  const { error } = await supabase.from("crm_customer_contracts").upsert({
    external_source: "manufacturer_order_manifest",
    external_id: externalId,
    customer_id: context.customerId || null,
    job_id: context.jobId || null,
    quote_id: context.quoteId,
    bookkeeping_entry_id: null,
    title: `Agentic Order Packet - ${context.quoteNumber || context.customerName}`,
    contract_url: `/api/crm/vendor-order-packets/${encodeURIComponent(context.quoteId)}`,
    share_token: null,
    status,
    signed_at: context.sourceKind === "signed_contract" ? context.generatedAt : null,
    total_amount: 0,
    meta: {
      source: "manufacturer_order_manifest",
      registry_version: 1,
      authoritative_source: context.sourceKind,
      current_manifest: currentManifest,
      manifest_history: history.slice(-20),
    },
  }, { onConflict: "external_source,external_id" });
  if (error) throw new Error(`The manufacturer order packet could not be saved to the customer file: ${error.message}`);
}

export function technicalMeasureLineValuesForOrderManifest(
  values: TechnicalMeasureLineValues,
): OrderFormSourceValues {
  return values;
}
