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
  CrmQuoteLineItem,
  CrmQuoteMotorizationSelection,
  CrmQuoteSurchargeSelection,
  CrmQuoteWithItems,
  CrmQuote,
} from "@/lib/crm/types";
import { priceDesign, type PriceInput } from "@/lib/quote/pricing";
import { getProduct } from "@/lib/quote/catalog";

type CrmSupabaseClient = SupabaseClient;
type CrmActor = { email: string; userId?: string };

// ---------------------------------------------------------------------------
// Pure totals helpers (no DB; unit-tested)
// ---------------------------------------------------------------------------

export function round2(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function selectedDesign(lineItem: CrmQuoteLineItem): CrmQuoteDesign | null {
  if (!lineItem.selected_design_id) return null;
  return lineItem.designs.find((d) => d.id === lineItem.selected_design_id) ?? null;
}

/** Billable amount for a line = selected design unit price x quantity. 0 if no
 *  valid selection (never lets an unpriced/errored design contribute a total). */
export function lineItemSubtotal(lineItem: CrmQuoteLineItem): number {
  const design = selectedDesign(lineItem);
  if (!design || design.price_status !== "ok") return 0;
  const qty = Math.max(1, Math.floor(Number(lineItem.quantity) || 1));
  return round2(Number(design.unit_price) * qty);
}

export function quoteSubtotal(lineItems: CrmQuoteLineItem[]): number {
  return round2(lineItems.reduce((sum, li) => sum + lineItemSubtotal(li), 0));
}

export function quoteTotal(input: { subtotal: number; discount: number; tax: number }): number {
  return round2(Math.max(input.subtotal - input.discount + input.tax, 0));
}

// ---- Quote-level adjustments (discount / tax / deposit / extra fees) ----
// Stored on crm_quotes.meta.adjustments; the dollar amounts on crm_quotes
// (discount/tax/deposit_required/balance_due) are DERIVED from these on recalc.

export type QuoteFee = { name: string; amount: number };
export type QuoteAdjustments = {
  discountPercent: number;
  discountFlat: number;
  taxPercent: number;
  depositPercent: number;
  fees: QuoteFee[];
};

export const DEFAULT_ADJUSTMENTS: QuoteAdjustments = {
  discountPercent: 0,
  discountFlat: 0,
  taxPercent: 0,
  depositPercent: 0,
  fees: [],
};

function nonNeg(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function parseAdjustments(meta: unknown): QuoteAdjustments {
  const a = (meta as { adjustments?: unknown } | null)?.adjustments;
  if (!a || typeof a !== "object") return { ...DEFAULT_ADJUSTMENTS };
  const o = a as Record<string, unknown>;
  const fees = Array.isArray(o.fees)
    ? (o.fees as unknown[])
        .map((f) => ({ name: String((f as { name?: unknown }).name || "Fee").slice(0, 80), amount: nonNeg((f as { amount?: unknown }).amount) }))
        .filter((f) => f.amount > 0)
    : [];
  return {
    discountPercent: Math.min(100, nonNeg(o.discountPercent)),
    discountFlat: nonNeg(o.discountFlat),
    taxPercent: Math.min(100, nonNeg(o.taxPercent)),
    depositPercent: Math.min(100, nonNeg(o.depositPercent)),
    fees,
  };
}

export type QuoteMoney = {
  subtotal: number;
  extrasTotal: number;
  discountAmount: number;
  taxableBase: number;
  taxAmount: number;
  total: number;
  depositRequired: number;
  balanceDue: number;
};

export function computeQuoteMoney(subtotal: number, adj: QuoteAdjustments): QuoteMoney {
  const extrasTotal = round2(adj.fees.reduce((s, f) => s + (Number(f.amount) || 0), 0));
  const preDiscount = round2(subtotal + extrasTotal);
  const rawDiscount = adj.discountFlat + preDiscount * (adj.discountPercent / 100);
  const discountAmount = round2(Math.min(preDiscount, Math.max(0, rawDiscount)));
  const taxableBase = round2(Math.max(preDiscount - discountAmount, 0));
  const taxAmount = round2(taxableBase * (adj.taxPercent / 100));
  const total = round2(taxableBase + taxAmount);
  const depositRequired = round2(total * (adj.depositPercent / 100));
  const balanceDue = round2(Math.max(total - depositRequired, 0));
  return { subtotal: round2(subtotal), extrasTotal, discountAmount, taxableBase, taxAmount, total, depositRequired, balanceDue };
}

// ---------------------------------------------------------------------------
// Pricing a design row via the engine
// ---------------------------------------------------------------------------

type PriceFields = {
  unit_price: number;
  price_breakdown: Record<string, unknown>;
  price_status: string;
  priced_at: string;
};

export function priceDesignFields(
  design: Pick<CrmQuoteDesign, "product_id" | "program_id" | "fabric" | "surcharges" | "motorization">,
  dims: { width_in: number | null; height_in: number | null },
): PriceFields {
  const input: PriceInput = {
    productId: design.product_id,
    programId: design.program_id ?? undefined,
    fabric: design.fabric ?? undefined,
    widthInches: Number(dims.width_in),
    heightInches: Number(dims.height_in),
    quantity: 1,
    surcharges: design.surcharges ?? [],
    motorization: design.motorization ?? [],
  };
  const result = priceDesign(input);
  const now = new Date().toISOString();
  if (result.ok) {
    return { unit_price: round2(result.unitPrice), price_breakdown: result, price_status: "ok", priced_at: now };
  }
  return {
    unit_price: 0,
    price_breakdown: { error: result.error, code: result.code, warnings: result.warnings },
    price_status: result.code,
    priced_at: now,
  };
}

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
function normalizeSurcharges(value: unknown): CrmQuoteSurchargeSelection[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (v && typeof v === "object" ? v : null))
    .filter(Boolean)
    .map((v) => {
      const o = v as Record<string, unknown>;
      const id = optionalText(o.id);
      if (!id) return null;
      const units = Number(o.units);
      return { id, ...(Number.isFinite(units) && units > 1 ? { units } : {}) };
    })
    .filter(Boolean) as CrmQuoteSurchargeSelection[];
}
function normalizeMotorization(value: unknown): CrmQuoteMotorizationSelection[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (v && typeof v === "object" ? v : null))
    .filter(Boolean)
    .map((v) => {
      const o = v as Record<string, unknown>;
      const groupId = optionalText(o.groupId);
      const optionId = optionalText(o.optionId);
      if (!groupId || !optionId) return null;
      const units = Number(o.units);
      return { groupId, optionId, ...(Number.isFinite(units) && units > 1 ? { units } : {}) };
    })
    .filter(Boolean) as CrmQuoteMotorizationSelection[];
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
    .select("*, designs:crm_quote_designs(*)")
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
  await supabase.from("crm_quote_bookkeeping_entries").update({ total_amount: money.total }).eq("quote_id", quoteId);
  if (built.job_id) {
    await supabase.from("crm_jobs").update({ estimated_total: money.total }).eq("id", built.job_id);
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
  const adjustments = parseAdjustments({ adjustments: payload });
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
    .select("*, designs:crm_quote_designs(*)")
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
  if ("width_in" in payload) {
    patch.width_in = optionalDimension(payload.width_in);
    dimsChanged = true;
  }
  if ("height_in" in payload) {
    patch.height_in = optionalDimension(payload.height_in);
    dimsChanged = true;
  }

  const { data, error } = await supabase
    .from("crm_quote_line_items")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new CrmAuthError(502, "Line item could not be updated.");

  // Measurements feed pricing — reprice all the window's designs when they change.
  if (dimsChanged) {
    await repriceLineItemDesigns(supabase, id, {
      width_in: data.width_in as number | null,
      height_in: data.height_in as number | null,
    });
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
): Promise<void> {
  const { data: designs, error } = await supabase
    .from("crm_quote_designs")
    .select("*")
    .eq("line_item_id", lineItemId);
  if (error) throw new CrmAuthError(502, "Designs could not be repriced.");
  for (const design of (designs as CrmQuoteDesign[]) ?? []) {
    const fields = priceDesignFields(design, dims);
    await supabase.from("crm_quote_designs").update(fields).eq("id", design.id);
  }
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

  const designInput = {
    product_id: productId,
    program_id: optionalText(payload.program_id),
    fabric: optionalText(payload.fabric),
    surcharges: normalizeSurcharges(payload.surcharges),
    motorization: normalizeMotorization(payload.motorization),
  };
  const priceFields = priceDesignFields(designInput, lineItem);

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
    const { data, error } = await supabase
      .from("crm_quote_designs")
      .update(record)
      .eq("id", designId)
      .select("*")
      .single();
    if (error || !data) throw new CrmAuthError(502, "Design could not be updated.");
    savedId = data.id;
  } else {
    const { data, error } = await supabase.from("crm_quote_designs").insert(record).select("*").single();
    if (error || !data) throw new CrmAuthError(502, "Design could not be saved.");
    savedId = data.id;
    // First design on a line auto-selects so the line is billable immediately.
    if (!lineItem.selected_design_id && (lineItem.designs?.length ?? 0) === 0) {
      await supabase.from("crm_quote_line_items").update({ selected_design_id: savedId }).eq("id", lineItemId);
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

  // If we removed the selected design, fall back to another (or clear).
  if (lineItem.selected_design_id === id) {
    const next = (lineItem.designs ?? []).find((d) => d.id !== id);
    await supabase
      .from("crm_quote_line_items")
      .update({ selected_design_id: next?.id ?? null })
      .eq("id", lineItem.id);
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
    })
    .select("*")
    .single();
  if (error || !copy) throw new CrmAuthError(502, "Window could not be copied.");

  const dims = { width_in: copy.width_in as number | null, height_in: copy.height_in as number | null };
  let selectedNewId: string | null = null;
  for (const d of source.designs ?? []) {
    const designInput = {
      product_id: d.product_id,
      program_id: d.program_id,
      fabric: d.fabric,
      surcharges: d.surcharges ?? [],
      motorization: d.motorization ?? [],
    };
    const priceFields = priceDesignFields(designInput, dims);
    const { data: newDesign } = await supabase
      .from("crm_quote_designs")
      .insert({ line_item_id: copy.id, label: d.label, sort_order: d.sort_order, ...designInput, notes: d.notes, ...priceFields })
      .select("id")
      .single();
    if (newDesign && source.selected_design_id === d.id) selectedNewId = newDesign.id;
  }
  if (selectedNewId) {
    await supabase.from("crm_quote_line_items").update({ selected_design_id: selectedNewId }).eq("id", copy.id);
  }
  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: source.quote_id,
    action: "line_item.duplicate",
    metadata: { sourceId: id, newId: copy.id },
  });
  return recalcQuoteTotals(supabase, source.quote_id);
}
