// Quote builder domain layer.
//
// Server-authoritative pricing: every design's unit_price + breakdown is computed
// here by the pricing engine and written to the row. Clients never send a price.
// Totals sum ONLY the customer-selected design per line item (pick-one), so
// alternatives are never double-counted. Quote total, balance, the 1:1 bookkeeping
// entry, and the parent job's estimate are kept in sync on every mutation.

import { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { recordCrmActivity } from "@/lib/crm/backend";
import type {
  CrmQuoteDesign,
  CrmQuoteDetailValue,
  CrmQuoteLineItem,
  CrmQuoteMotorizationSelection,
  CrmQuoteWithItems,
  CrmQuote,
  CrmJobStatus,
  CrmQuoteStatus,
} from "@/lib/crm/types";
import {
  computeQuoteMoney,
  parseAdjustments,
  priceDesignFields,
  quoteSubtotal,
  round2,
  selectedDesign,
} from "@/lib/crm/quote-money";
export {
  DEFAULT_ADJUSTMENTS,
  computeQuoteMoney,
  designOnceTotal,
  lineItemSubtotal,
  lineItemWholesaleSubtotal,
  parseAdjustments,
  priceDesignFields,
  quoteSubtotal,
  quoteTotal,
  quoteWholesaleSubtotal,
  round2,
  selectedDesign,
} from "@/lib/crm/quote-money";
export type { QuoteAdjustments, QuoteFee, QuoteMoney } from "@/lib/crm/quote-money";
import { getProduct } from "@/lib/quote/catalog";
import { advanceJobStatus, jobStatusForQuote, STATUS_TIMESTAMP_COLUMN } from "@/lib/quote/lifecycle";
import { ensureBookkeepingEntry } from "@/lib/crm/quote-groups";
import { getDetailFieldsForProduct, getMotorizationGroupsForProduct, shutterVariantsFor } from "@/lib/quote/product-options";
import { saveQuoteDesignRecord } from "@/lib/crm/quote-design-writes";
import { ensureSoldQuoteInstallerDelivery } from "@/lib/crm/sold-installer-delivery";
import {
  findProductColorOption,
  findProductColorOptionBySelection,
  PRODUCT_COLOR_CODE_DETAIL,
  PRODUCT_COLOR_COLLECTION_DETAIL,
  PRODUCT_COLOR_ID_DETAIL,
  PRODUCT_COLOR_NAME_DETAIL,
  PRODUCT_COLOR_TYPE_DETAIL,
} from "@/lib/quote/product-color-options";

type CrmSupabaseClient = SupabaseClient;
type CrmActor = { email: string; userId?: string };

// ---------------------------------------------------------------------------
// Local validation helpers (mirror backend.ts conventions)
// ---------------------------------------------------------------------------

function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}
function requiredText(value: unknown, message: string): string {
  const t = optionalText(value);
  if (!t) throw new CrmAuthError(400, message);
  return t;
}
function optionalDimension(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new CrmAuthError(400, "Measurements must be non-negative numbers.");
  return n;
}
function normalizeQuantity(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}
function normalizeMotorization(productId: string, value: unknown): CrmQuoteMotorizationSelection[] {
  if (!Array.isArray(value)) return [];
  const allowedGroups = new Set(getMotorizationGroupsForProduct(productId));
  return value
    .map((v) => (v && typeof v === "object" ? v : null))
    .filter(Boolean)
    .map((v) => {
      const o = v as Record<string, unknown>;
      const groupId = optionalText(o.groupId);
      const optionId = optionalText(o.optionId);
      if (!groupId || !optionId) return null;
      if (!allowedGroups.has(groupId)) return null;
      const units = Number(o.units);
      return { groupId, optionId, ...(Number.isFinite(units) && units > 1 ? { units } : {}) };
    })
    .filter(Boolean) as CrmQuoteMotorizationSelection[];
}
function normalizeDetails(productId: string, value: unknown): Record<string, CrmQuoteDetailValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const normalized: Record<string, CrmQuoteDetailValue> = {};
  for (const field of getDetailFieldsForProduct(productId)) {
    const raw = input[field.id];
    if (field.type === "checkbox") {
      if (raw === true || raw === "true" || raw === "yes" || raw === "on") normalized[field.id] = true;
      continue;
    }
    const text = optionalText(raw);
    if (!text) continue;
    if (field.options?.length && !field.options.some((option) => option.value === text)) continue;
    normalized[field.id] = text;
  }
  return normalized;
}

export function normalizeQuoteBuilderColorSelection(
  productId: string,
  fabric: string | null,
  programId: string | null,
  value: unknown,
  base: Record<string, CrmQuoteDetailValue>,
): { fabric: string | null; programId: string | null; details: Record<string, CrmQuoteDetailValue> } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { fabric, programId, details: base };
  }
  const input = value as Record<string, unknown>;
  const colorId = optionalText(input[PRODUCT_COLOR_ID_DETAIL]);
  const colorCode = optionalText(input[PRODUCT_COLOR_CODE_DETAIL]);
  if (!colorId && !colorCode) return { fabric, programId, details: base };

  const collection = optionalText(input[PRODUCT_COLOR_COLLECTION_DETAIL]) ?? fabric;
  const colorName = optionalText(input[PRODUCT_COLOR_NAME_DETAIL]);
  const row =
    findProductColorOption(productId, colorId) ??
    findProductColorOptionBySelection(productId, collection, colorCode, colorName);
  if (!row) {
    throw new CrmAuthError(400, "That fabric color is not available with the selected product.");
  }
  if (!row.available) {
    throw new CrmAuthError(400, "That fabric color needs a verified price group before it can be quoted.");
  }

  let nextFabric = fabric;
  let nextProgramId = programId;
  if (row.selectionMode === "fabric") {
    nextFabric = row.collection;
    nextProgramId = null;
  } else {
    nextFabric = null;
    if (row.programId) nextProgramId = row.programId;
  }

  return {
    fabric: nextFabric,
    programId: nextProgramId,
    details: {
      ...base,
      ...row.automaticDetails,
      [PRODUCT_COLOR_ID_DETAIL]: row.id,
      [PRODUCT_COLOR_CODE_DETAIL]: row.colorCode,
      [PRODUCT_COLOR_NAME_DETAIL]: row.colorName,
      [PRODUCT_COLOR_COLLECTION_DETAIL]: row.publicCollection || row.collection,
      [PRODUCT_COLOR_TYPE_DETAIL]: row.fabricType,
    },
  };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function fetchQuote(supabase: CrmSupabaseClient, quoteId: string): Promise<CrmQuote> {
  const { data, error } = await supabase.from("crm_quotes").select("*").eq("id", quoteId).maybeSingle();
  if (error || !data) throw new CrmAuthError(404, "Quote was not found.");
  return data as CrmQuote;
}

export async function loadQuoteBuilder(
  supabase: CrmSupabaseClient,
  quoteId: string,
): Promise<CrmQuoteWithItems> {
  const quote = await fetchQuote(supabase, quoteId);
  const { data: items, error } = await supabase
    .from("crm_quote_line_items")
    .select("*, designs:crm_quote_designs!crm_quote_designs_line_item_id_fkey(*)")
    .eq("quote_id", quoteId);
  if (error) throw new CrmAuthError(502, "Quote line items could not be loaded.");

  const lineItems = ((items as CrmQuoteLineItem[]) ?? [])
    .map((li) => ({
      ...li,
      designs: [...(li.designs ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label),
      ),
    }))
    .sort((a, b) => a.sort_order - b.sort_order);

  return { ...quote, lineItems };
}

// ---------------------------------------------------------------------------
// Recalculation (the single place quote money is derived)
// ---------------------------------------------------------------------------

export async function recalcQuoteTotals(
  supabase: CrmSupabaseClient,
  quoteId: string,
): Promise<CrmQuoteWithItems> {
  const built = await loadQuoteBuilder(supabase, quoteId);
  const subtotal = quoteSubtotal(built.lineItems);
  const money = computeQuoteMoney(subtotal, parseAdjustments(built.meta));

  const { error: quoteError } = await supabase
    .from("crm_quotes")
    .update({
      quote_total: money.total,
      discount: money.discountAmount,
      tax: money.taxAmount,
      deposit_required: money.depositRequired,
      balance_due: money.balanceDue,
    })
    .eq("id", quoteId);
  if (quoteError) throw new CrmAuthError(502, "Quote total could not be updated.");

  // Keep the 1:1 bookkeeping entry and the parent job estimate in sync.
  const { error: bkErr } = await supabase
    .from("crm_quote_bookkeeping_entries")
    .update({ total_amount: money.total })
    .eq("quote_id", quoteId);
  if (bkErr) throw new CrmAuthError(502, "Bookkeeping total could not be synced.");
  // Sibling versions (Quote A/B/C) share one job. Only the primary version
  // (label "A", or an ungrouped quote) projects its total/status onto the job —
  // editing a cheaper unpicked alternative must NOT clobber the job estimate or
  // advance its status. The winning version drives the job via the accept flow.
  const isPrimaryVersion = !built.quote_group_id || (built.quote_label || "A").trim().toUpperCase() === "A";
  if (built.job_id && isPrimaryVersion) {
    const jobUpdate: Record<string, unknown> = { estimated_total: money.total };
    // A quote with line items has moved past "scheduled" — advance an early-stage
    // job to "quoted" (forward-only; never downgrades a sold/ordered job).
    if (built.lineItems.length > 0) {
      const { data: jobRow } = await supabase.from("crm_jobs").select("status").eq("id", built.job_id).maybeSingle();
      const current = (jobRow as { status?: CrmJobStatus } | null)?.status;
      if (current) {
        const next = advanceJobStatus(current, "quoted");
        if (next !== current) jobUpdate.status = next;
      }
    }
    const { error: jobErr } = await supabase.from("crm_jobs").update(jobUpdate).eq("id", built.job_id);
    if (jobErr) throw new CrmAuthError(502, "Job estimate could not be synced.");
  }

  return {
    ...built,
    quote_total: money.total,
    discount: money.discountAmount,
    tax: money.taxAmount,
    deposit_required: money.depositRequired,
    balance_due: money.balanceDue,
  };
}

export async function updateQuoteAdjustments(
  supabase: CrmSupabaseClient,
  quoteId: string,
  payload: Record<string, unknown>,
  actor: CrmActor,
): Promise<CrmQuoteWithItems> {
  const { data: quote, error } = await supabase.from("crm_quotes").select("meta").eq("id", quoteId).maybeSingle();
  if (error || !quote) throw new CrmAuthError(404, "Quote was not found.");
  const currentAdjustments = parseAdjustments(quote.meta);
  const adjustments = parseAdjustments({ adjustments: { ...currentAdjustments, ...payload } });
  const meta = { ...((quote.meta as Record<string, unknown>) || {}), adjustments };
  const { error: upErr } = await supabase.from("crm_quotes").update({ meta }).eq("id", quoteId);
  if (upErr) throw new CrmAuthError(502, "Adjustments could not be saved.");
  await recordCrmActivity(supabase, actor, { entityType: "quote", entityId: quoteId, action: "adjustments.update", metadata: { adjustments } });
  return recalcQuoteTotals(supabase, quoteId);
}

// ---------------------------------------------------------------------------
// Line item mutations
// ---------------------------------------------------------------------------

async function fetchLineItem(supabase: CrmSupabaseClient, id: string): Promise<CrmQuoteLineItem> {
  const { data, error } = await supabase
    .from("crm_quote_line_items")
    .select("*, designs:crm_quote_designs!crm_quote_designs_line_item_id_fkey(*)")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) throw new CrmAuthError(404, "Line item was not found.");
  const li = data as CrmQuoteLineItem;
  return { ...li, designs: li.designs ?? [] };
}

export async function createLineItem(
  supabase: CrmSupabaseClient,
  payload: Record<string, unknown>,
  actor: CrmActor,
): Promise<CrmQuoteWithItems> {
  const quoteId = requiredText(payload.quote_id, "Quote is required for a line item.");
  await fetchQuote(supabase, quoteId); // 404 (not 502) if the quote doesn't exist
  const record = {
    quote_id: quoteId,
    room: optionalText(payload.room),
    width_in: optionalDimension(payload.width_in),
    height_in: optionalDimension(payload.height_in),
    quantity: normalizeQuantity(payload.quantity),
    sort_order: Number.isFinite(Number(payload.sort_order)) ? Number(payload.sort_order) : 0,
    notes: optionalText(payload.notes),
  };
  const { data, error } = await supabase.from("crm_quote_line_items").insert(record).select("*").single();
  if (error || !data) throw new CrmAuthError(502, "Line item could not be saved.");
  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: quoteId,
    action: "line_item.create",
    after: data,
    metadata: { lineItemId: data.id },
  });
  // Button-driven builder: when the room buttons add a window for the active
  // product line, seed the first design ("A") so the new window is immediately
  // priceable instead of an empty shell. Ignored when the product is unknown.
  const seedProductId = optionalText(payload.seed_product_id);
  if (seedProductId && getProduct(seedProductId)) {
    // Shutters auto-create the A/B/C material-tier variants as priced alternatives.
    const variants = shutterVariantsFor(seedProductId);
    if (variants && variants.length) {
      let last: CrmQuoteWithItems | null = null;
      for (let i = 0; i < variants.length; i++) {
        last = await upsertDesign(
          supabase,
          { line_item_id: data.id, product_id: seedProductId, program_id: variants[i].programId, label: variants[i].variant, sort_order: i },
          actor,
        );
      }
      // The first upsertDesign auto-selected variant A (the value tier) so the
      // window bills immediately; return the latest refreshed quote.
      return last ?? recalcQuoteTotals(supabase, quoteId);
    }
    // Seed a default style/fabric so the new window is priced immediately (not
    // "pricing in progress"). Fabric-priced products get their first fabric
    // (which routes to a price group); program-priced products get the first
    // program. The rep can change it on the design card.
    const product = getProduct(seedProductId)!;
    const fabricPriced = Boolean(product.fabricRouting);
    const seedFabric = fabricPriced && product.fabricRouting ? Object.keys(product.fabricRouting)[0] : null;
    const seedProgramId = fabricPriced ? null : (product.programs[0]?.id ?? null);
    return upsertDesign(
      supabase,
      { line_item_id: data.id, product_id: seedProductId, program_id: seedProgramId, fabric: seedFabric, label: "A", sort_order: 0 },
      actor,
    );
  }
  return recalcQuoteTotals(supabase, quoteId);
}

export async function updateLineItem(
  supabase: CrmSupabaseClient,
  id: string,
  payload: Record<string, unknown>,
  actor: CrmActor,
): Promise<CrmQuoteWithItems> {
  const existing = await fetchLineItem(supabase, id);
  const patch: Record<string, unknown> = {};
  if ("room" in payload) patch.room = optionalText(payload.room);
  if ("notes" in payload) patch.notes = optionalText(payload.notes);
  if ("quantity" in payload) patch.quantity = normalizeQuantity(payload.quantity);
  if ("sort_order" in payload && Number.isFinite(Number(payload.sort_order))) patch.sort_order = Number(payload.sort_order);
  let dimsChanged = false;
  let discountChanged = false;
  if ("width_in" in payload) {
    patch.width_in = optionalDimension(payload.width_in);
    dimsChanged = true;
  }
  if ("height_in" in payload) {
    patch.height_in = optionalDimension(payload.height_in);
    dimsChanged = true;
  }
  if ("discount_percent" in payload) {
    patch.discount_percent = Math.min(100, Math.max(0, Number(payload.discount_percent) || 0));
    discountChanged = true;
  }

  const { data, error } = await supabase
    .from("crm_quote_line_items")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new CrmAuthError(502, "Line item could not be updated.");

  // Measurements and per-line discount both feed pricing — reprice all the
  // window's designs when either changes.
  if (dimsChanged || discountChanged) {
    await repriceLineItemDesigns(supabase, id, {
      width_in: data.width_in as number | null,
      height_in: data.height_in as number | null,
    }, Number(data.discount_percent) || 0);
  }
  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: existing.quote_id,
    action: "line_item.update",
    before: existing,
    after: data,
    metadata: { lineItemId: id },
  });
  return recalcQuoteTotals(supabase, existing.quote_id);
}

export async function deleteLineItem(
  supabase: CrmSupabaseClient,
  id: string,
  actor: CrmActor,
): Promise<CrmQuoteWithItems> {
  const existing = await fetchLineItem(supabase, id);
  const { error } = await supabase.from("crm_quote_line_items").delete().eq("id", id);
  if (error) throw new CrmAuthError(502, "Line item could not be deleted.");
  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: existing.quote_id,
    action: "line_item.delete",
    before: existing,
    metadata: { lineItemId: id },
  });
  return recalcQuoteTotals(supabase, existing.quote_id);
}

// ---------------------------------------------------------------------------
// Design mutations
// ---------------------------------------------------------------------------

async function repriceLineItemDesigns(
  supabase: CrmSupabaseClient,
  lineItemId: string,
  dims: { width_in: number | null; height_in: number | null },
  discountPercent?: number,
): Promise<void> {
  const { data: designs, error } = await supabase
    .from("crm_quote_designs")
    .select("*")
    .eq("line_item_id", lineItemId);
  if (error) throw new CrmAuthError(502, "Designs could not be repriced.");
  for (const design of (designs as CrmQuoteDesign[]) ?? []) {
    const fields = preserveManualPriceOverride(
      design,
      priceDesignFields(design, dims, discountPercent),
    );
    await saveQuoteDesignRecord<{ id: string }>(
      { ...fields },
      (nextRecord) => supabase.from("crm_quote_designs").update(nextRecord).eq("id", design.id).select("id").single(),
      "Design pricing could not be updated.",
    );
  }
}

type DesignPriceFields = ReturnType<typeof priceDesignFields>;

export function preserveManualPriceOverride(
  design: Pick<CrmQuoteDesign, "unit_price" | "price_breakdown">,
  engineFields: DesignPriceFields,
): DesignPriceFields {
  const priorBreakdown =
    design.price_breakdown && typeof design.price_breakdown === "object"
      ? design.price_breakdown
      : {};
  if (priorBreakdown.manualPriceOverride !== true) return engineFields;

  const manualUnitPrice = round2(design.unit_price);
  return {
    ...engineFields,
    unit_price: manualUnitPrice,
    price_status: "ok",
    price_breakdown: {
      ...engineFields.price_breakdown,
      manualPriceOverride: true,
      engineUnitPrice: engineFields.unit_price,
      manualUnitPrice,
    },
  };
}

export function manualPriceFields(
  design: Pick<CrmQuoteDesign, "unit_price" | "price_breakdown">,
  value: unknown,
  pricedAt = new Date().toISOString(),
) {
  const unitPrice = Number(value);
  if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 9_999_999_999.99) {
    throw new CrmAuthError(400, "Custom amount must be a valid non-negative dollar amount.");
  }
  const rounded = round2(unitPrice);
  const priorBreakdown =
    design.price_breakdown && typeof design.price_breakdown === "object"
      ? design.price_breakdown
      : {};
  const engineUnitPrice =
    priorBreakdown.manualPriceOverride === true &&
    typeof priorBreakdown.engineUnitPrice === "number"
      ? priorBreakdown.engineUnitPrice
      : round2(design.unit_price);

  return {
    unit_price: rounded,
    price_status: "ok",
    priced_at: pricedAt,
    price_breakdown: {
      ...priorBreakdown,
      manualPriceOverride: true,
      engineUnitPrice,
      manualUnitPrice: rounded,
    },
  };
}

export async function setDesignManualPrice(
  supabase: CrmSupabaseClient,
  designId: string,
  value: unknown,
  actor: CrmActor,
): Promise<CrmQuoteWithItems> {
  const { data, error } = await supabase
    .from("crm_quote_designs")
    .select("*")
    .eq("id", designId)
    .maybeSingle();
  if (error || !data) throw new CrmAuthError(404, "Design was not found.");

  const design = data as CrmQuoteDesign;
  const lineItem = await fetchLineItem(supabase, design.line_item_id);
  const fields = manualPriceFields(design, value);
  await saveQuoteDesignRecord<{ id: string }>(
    fields,
    (nextRecord) =>
      supabase
        .from("crm_quote_designs")
        .update(nextRecord)
        .eq("id", designId)
        .eq("line_item_id", design.line_item_id)
        .select("id")
        .single(),
    "Custom line price could not be saved.",
  );

  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: lineItem.quote_id,
    action: "design.manual_price",
    before: { unit_price: design.unit_price, price_breakdown: design.price_breakdown },
    after: fields,
    metadata: { lineItemId: design.line_item_id, designId },
  });
  return recalcQuoteTotals(supabase, lineItem.quote_id);
}

export async function upsertDesign(
  supabase: CrmSupabaseClient,
  payload: Record<string, unknown>,
  actor: CrmActor,
): Promise<CrmQuoteWithItems> {
  const lineItemId = requiredText(payload.line_item_id, "Line item is required for a design.");
  const productId = requiredText(payload.product_id, "Product is required for a design.");
  if (!getProduct(productId)) throw new CrmAuthError(400, `Unknown product '${productId}'.`);

  const lineItem = await fetchLineItem(supabase, lineItemId);

  const programId = optionalText(payload.program_id);
  const fabric = optionalText(payload.fabric);
  const colorSelection = normalizeQuoteBuilderColorSelection(
    productId,
    fabric,
    programId,
    payload.details,
    normalizeDetails(productId, payload.details),
  );
  const designInput = {
    product_id: productId,
    program_id: colorSelection.programId,
    fabric: colorSelection.fabric,
    details: colorSelection.details,
    surcharges: [],
    motorization: normalizeMotorization(productId, payload.motorization),
  };
  const priceFields = priceDesignFields(designInput, lineItem, Number(lineItem.discount_percent) || 0);

  const record = {
    line_item_id: lineItemId,
    label: optionalText(payload.label) || "A",
    sort_order: Number.isFinite(Number(payload.sort_order)) ? Number(payload.sort_order) : 0,
    ...designInput,
    notes: optionalText(payload.notes),
    ...priceFields,
  };

  const designId = optionalText(payload.id);
  let savedId: string;
  if (designId) {
    // Ownership check: the design being updated must already belong to this line
    // item. The service-role client bypasses RLS, so without this a design could
    // be reparented to a different window/quote and re-priced against the wrong
    // dimensions (corrupting both quotes). Scope the update by line_item_id too.
    const data = await saveQuoteDesignRecord<CrmQuoteDesign>(
      record,
      (nextRecord) =>
        supabase
          .from("crm_quote_designs")
          .update(nextRecord)
          .eq("id", designId)
          .eq("line_item_id", lineItemId)
          .select("*")
          .single(),
      "Design was not found on this window.",
      404,
    );
    savedId = data.id;
  } else {
    const data = await saveQuoteDesignRecord<CrmQuoteDesign>(
      record,
      (nextRecord) => supabase.from("crm_quote_designs").insert(nextRecord).select("*").single(),
      "Design could not be saved.",
    );
    savedId = data.id;
    // A line with no current selection auto-selects this new design so it bills.
    if (!lineItem.selected_design_id) {
      const { error: selectError } = await supabase.from("crm_quote_line_items").update({ selected_design_id: savedId }).eq("id", lineItemId);
      if (selectError) throw new CrmAuthError(502, "Design was saved, but could not be selected.");
    }
  }

  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: lineItem.quote_id,
    action: designId ? "design.update" : "design.create",
    after: record,
    metadata: { lineItemId, designId: savedId, priceStatus: priceFields.price_status },
  });
  return recalcQuoteTotals(supabase, lineItem.quote_id);
}

export async function deleteDesign(
  supabase: CrmSupabaseClient,
  id: string,
  actor: CrmActor,
): Promise<CrmQuoteWithItems> {
  const { data: design, error: findError } = await supabase
    .from("crm_quote_designs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (findError || !design) throw new CrmAuthError(404, "Design was not found.");
  const lineItem = await fetchLineItem(supabase, design.line_item_id);

  const { error } = await supabase.from("crm_quote_designs").delete().eq("id", id);
  if (error) throw new CrmAuthError(502, "Design could not be deleted.");

  // If we removed the selected design, fall back deterministically: prefer a
  // priced ("ok") survivor, then by sort order / label.
  if (lineItem.selected_design_id === id) {
    const survivors = (lineItem.designs ?? [])
      .filter((d) => d.id !== id)
      .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
    const next = survivors.find((d) => d.price_status === "ok") ?? survivors[0];
    const { error: selectError } = await supabase
      .from("crm_quote_line_items")
      .update({ selected_design_id: next?.id ?? null })
      .eq("id", lineItem.id);
    if (selectError) throw new CrmAuthError(502, "Replacement design selection could not be saved.");
  }

  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: lineItem.quote_id,
    action: "design.delete",
    before: design,
    metadata: { designId: id, lineItemId: lineItem.id },
  });
  return recalcQuoteTotals(supabase, lineItem.quote_id);
}

export async function selectDesign(
  supabase: CrmSupabaseClient,
  lineItemId: string,
  designId: string,
  actor: CrmActor,
): Promise<CrmQuoteWithItems> {
  const lineItem = await fetchLineItem(supabase, lineItemId);
  const exists = (lineItem.designs ?? []).some((d) => d.id === designId);
  if (!exists) throw new CrmAuthError(400, "That design does not belong to this line item.");
  const { error } = await supabase
    .from("crm_quote_line_items")
    .update({ selected_design_id: designId })
    .eq("id", lineItemId);
  if (error) throw new CrmAuthError(502, "Design selection could not be saved.");
  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: lineItem.quote_id,
    action: "design.select",
    metadata: { lineItemId, designId },
  });
  return recalcQuoteTotals(supabase, lineItem.quote_id);
}

export async function duplicateLineItem(
  supabase: CrmSupabaseClient,
  id: string,
  actor: CrmActor,
): Promise<CrmQuoteWithItems> {
  const source = await fetchLineItem(supabase, id);
  const { data: copy, error } = await supabase
    .from("crm_quote_line_items")
    .insert({
      quote_id: source.quote_id,
      room: source.room ? `${source.room} (copy)` : null,
      width_in: source.width_in,
      height_in: source.height_in,
      quantity: source.quantity,
      sort_order: source.sort_order + 1,
      notes: source.notes,
      discount_percent: Number(source.discount_percent) || 0,
    })
    .select("*")
    .single();
  if (error || !copy) throw new CrmAuthError(502, "Window could not be copied.");

  const dims = { width_in: copy.width_in as number | null, height_in: copy.height_in as number | null };
  const copyDiscount = Number(source.discount_percent) || 0;
  let selectedNewId: string | null = null;
  for (const d of source.designs ?? []) {
    const colorSelection = normalizeQuoteBuilderColorSelection(
      d.product_id,
      d.fabric,
      d.program_id,
      d.details ?? {},
      normalizeDetails(d.product_id, d.details ?? {}),
    );
    const designInput = {
      product_id: d.product_id,
      program_id: colorSelection.programId,
      fabric: colorSelection.fabric,
      details: colorSelection.details,
      surcharges: [],
      motorization: normalizeMotorization(d.product_id, d.motorization ?? []),
    };
    const priceFields = priceDesignFields(designInput, dims, copyDiscount);
    const newDesign = await saveQuoteDesignRecord<{ id: string }>(
      { line_item_id: copy.id, label: d.label, sort_order: d.sort_order, ...designInput, notes: d.notes, ...priceFields },
      (nextRecord) => supabase.from("crm_quote_designs").insert(nextRecord).select("id").single(),
      "Copied window design could not be saved.",
    );
    if (newDesign && source.selected_design_id === d.id) selectedNewId = newDesign.id;
  }
  if (selectedNewId) {
    const { error: selectError } = await supabase.from("crm_quote_line_items").update({ selected_design_id: selectedNewId }).eq("id", copy.id);
    if (selectError) throw new CrmAuthError(502, "Copied window design could not be selected.");
  }
  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: source.quote_id,
    action: "line_item.duplicate",
    metadata: { sourceId: id, newId: copy.id },
  });
  return recalcQuoteTotals(supabase, source.quote_id);
}

/**
 * Copy one window's selected-design spec (product/program/fabric/details/
 * motorization) plus its per-line discount to target windows — the MTS
 * "Copy All / Copy Some" flow. Target sizes stay unchanged; the source product
 * intentionally replaces the target product, and each target is re-priced
 * against its own dimensions before the quote total is recalculated.
 */
export async function copySpecToLineItems(
  supabase: CrmSupabaseClient,
  sourceId: string,
  targetIds: string[],
  actor: CrmActor,
): Promise<CrmQuoteWithItems> {
  const source = await fetchLineItem(supabase, sourceId);
  const sourceDesign = selectedDesign(source);
  if (!sourceDesign) {
    throw new CrmAuthError(400, "Pick a product/spec on this window before copying it.");
  }
  const targets = Array.from(new Set(targetIds)).filter((id) => id && id !== sourceId);
  for (const targetId of targets) {
    const target = await fetchLineItem(supabase, targetId);
    if (target.quote_id !== source.quote_id) {
      throw new CrmAuthError(400, "Every target window must belong to the same quote.");
    }
    // 1. Per-line discount only. Dimensions stay with the target window.
    await updateLineItem(supabase, targetId, {
      discount_percent: source.discount_percent ?? 0,
    }, actor);
    // 2. Spec into the target's selected design (create one if it has none),
    //    re-priced against the target's existing dimensions.
    const targetDesignId = target.selected_design_id ?? target.designs[0]?.id ?? null;
    const targetLabel = targetDesignId
      ? target.designs.find((d) => d.id === targetDesignId)?.label ?? "A"
      : "A";
    await upsertDesign(supabase, {
      ...(targetDesignId ? { id: targetDesignId } : {}),
      line_item_id: targetId,
      label: targetLabel,
      product_id: sourceDesign.product_id,
      program_id: sourceDesign.program_id,
      fabric: sourceDesign.fabric,
      details: sourceDesign.details ?? {},
      motorization: sourceDesign.motorization ?? [],
    }, actor);
  }
  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: source.quote_id,
    action: "line_item.copy_spec",
    metadata: { sourceId, targetCount: targets.length },
  });
  return recalcQuoteTotals(supabase, source.quote_id);
}

// ---------------------------------------------------------------------------
// Lifecycle: advance status (drives the job) + create a quote for a job
// ---------------------------------------------------------------------------

/**
 * Advance a quote to a new lifecycle status: set the status + its timestamp,
 * drive the parent job's status forward, and (on "sold") ensure a bookkeeping
 * entry exists. The quote is the source of truth for the job's status.
 */
export async function advanceQuoteStatus(
  supabase: CrmSupabaseClient,
  quoteId: string,
  nextStatus: CrmQuoteStatus,
  actor: CrmActor,
  options: { deferInstallerDelivery?: boolean } = {},
): Promise<CrmQuoteWithItems> {
  const { data: quote, error } = await supabase.from("crm_quotes").select("*").eq("id", quoteId).maybeSingle();
  if (error || !quote) throw new CrmAuthError(404, "Quote was not found.");

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: nextStatus };
  const tsCol = STATUS_TIMESTAMP_COLUMN[nextStatus];
  if (tsCol && !(quote as Record<string, unknown>)[tsCol]) patch[tsCol] = now;

  const { error: upErr } = await supabase.from("crm_quotes").update(patch).eq("id", quoteId);
  if (upErr) throw new CrmAuthError(502, "Quote status could not be updated.");

  // On sold, ensure the sale is captured in bookkeeping (drafts/alternatives have
  // no entry until won), then stamp the sold date.
  if (nextStatus === "sold") {
    await ensureBookkeepingEntry(supabase, { ...(quote as CrmQuote), status: "sold" });
    const { error: bookErr } = await supabase.from("crm_quote_bookkeeping_entries").update({ sold_date: now.slice(0, 10) }).eq("quote_id", quoteId);
    if (bookErr) throw new CrmAuthError(502, "Quote bookkeeping sold date could not be updated.");
  }

  // Drive the parent job's status (forward-only).
  if (quote.job_id) {
    const { data: jobRow, error: jobFindError } = await supabase.from("crm_jobs").select("status").eq("id", quote.job_id).maybeSingle();
    if (jobFindError) throw new CrmAuthError(502, "Job status could not be loaded.");
    const current = (jobRow as { status?: CrmJobStatus } | null)?.status;
    if (current) {
      const next = advanceJobStatus(current, jobStatusForQuote(nextStatus));
      if (next !== current) {
        const { error: jobErr } = await supabase.from("crm_jobs").update({ status: next }).eq("id", quote.job_id);
        if (jobErr) throw new CrmAuthError(502, "Job status could not be synced.");
      }
    }
  }

  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: quoteId,
    action: `status.${nextStatus}`,
    metadata: { from: quote.status, to: nextStatus },
  });
  const updatedQuote = await recalcQuoteTotals(supabase, quoteId);
  if (!options.deferInstallerDelivery) {
    await ensureSoldQuoteInstallerDelivery(supabase, updatedQuote);
  }
  return updatedQuote;
}

/**
 * Get-or-create the active quote for a job (used from a scheduled consultation).
 * Idempotent: returns the job's latest non-archived/lost quote if one exists.
 * A freshly created quote is a lightweight DRAFT with NO bookkeeping entry and
 * does NOT change the job status (an empty draft leaves the job "scheduled").
 */
export async function createQuoteForJob(
  supabase: CrmSupabaseClient,
  jobId: string,
  actor: CrmActor,
): Promise<{ quoteId: string; created: boolean }> {
  const { data: rows, error: findError } = await supabase
    .from("crm_quotes")
    .select("id, status")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (findError) throw new CrmAuthError(502, "Existing quotes could not be loaded for this job.");
  const existing = rows?.[0] as { id: string; status: string } | undefined;
  if (existing && existing.status !== "archived" && existing.status !== "lost") {
    return { quoteId: existing.id, created: false };
  }

  const { data, error } = await supabase
    .from("crm_quotes")
    .insert({
      job_id: jobId,
      status: "draft",
      quote_total: 0,
      materials_cost: 0,
      labor_cost: 0,
      discount: 0,
      tax: 0,
      deposit_required: 0,
      balance_due: 0,
      meta: { createdBy: actor.email, createdVia: "consultation" },
    })
    .select("id")
    .single();
  if (error || !data) throw new CrmAuthError(502, "Quote could not be created for this job.");

  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: data.id,
    action: "create_for_job",
    metadata: { jobId },
  });
  return { quoteId: data.id, created: true };
}
