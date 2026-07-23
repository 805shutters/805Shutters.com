// Whole-quote versions ("Quote A / Quote B / Quote C").
// Sibling crm_quotes sharing quote_group_id are alternative whole quotes the
// customer compares and picks one of. Conservative bookkeeping: alternative
// versions do NOT create a bookkeeping entry on creation; one is ensured only
// when a version is sold, so unsold alternatives never inflate the pipeline.

import { randomUUID } from "node:crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { recordCrmActivity } from "@/lib/crm/backend";
import { computeQuoteMoney, parseAdjustments, priceDesignFields, quoteSubtotal } from "@/lib/crm/quote-money";
import { saveQuoteDesignRecord } from "@/lib/crm/quote-design-writes";
import type {
  CrmQuote,
  CrmQuoteDesign,
  CrmQuoteDetailValue,
  CrmQuoteLineItem,
  CrmQuoteMotorizationSelection,
} from "@/lib/crm/types";

type CrmSupabaseClient = SupabaseClient;
type CrmActor = { email: string; userId?: string };

const LETTERS = "ABCDEFGHIJ".split("");

export function nextLabel(existing: (string | null | undefined)[]): string {
  const used = new Set(existing.map((l) => (l || "").trim().toUpperCase()).filter(Boolean));
  const free = LETTERS.find((l) => !used.has(l));
  return free ?? `Option ${used.size + 1}`;
}

export type QuoteVersion = {
  id: string;
  label: string;
  status: string;
  quote_total: number;
  share_token: string | null;
  signed: boolean;
};

async function fetchQuoteRow(supabase: CrmSupabaseClient, quoteId: string): Promise<CrmQuote> {
  const { data, error } = await supabase.from("crm_quotes").select("*").eq("id", quoteId).maybeSingle();
  if (error || !data) throw new CrmAuthError(404, "Quote was not found.");
  return data as CrmQuote;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function cloneQuoteMeta(source: CrmQuote, actor: CrmActor, label: string): Record<string, unknown> {
  const {
    contract_snapshot: _contractSnapshot,
    signed_selection: _signedSelection,
    lastUpdatedAt: _lastUpdatedAt,
    lastUpdatedBy: _lastUpdatedBy,
    ...sourceMeta
  } = record(source.meta);
  return {
    ...sourceMeta,
    createdBy: actor.email,
    createdAsVersionOf: source.id,
    createdAsVersionLabel: source.quote_label || "A",
    quoteVersionLabel: label,
    versionCreatedAt: new Date().toISOString(),
  };
}

function detailsRecord(value: unknown): Record<string, CrmQuoteDetailValue> {
  return record(value) as Record<string, CrmQuoteDetailValue>;
}

function motorizationList(value: unknown): CrmQuoteMotorizationSelection[] {
  return Array.isArray(value) ? (value as CrmQuoteMotorizationSelection[]) : [];
}

function sortedDesigns(lineItem: CrmQuoteLineItem): CrmQuoteDesign[] {
  return [...(lineItem.designs ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

async function cloneQuoteBuilderRows(
  supabase: CrmSupabaseClient,
  source: CrmQuote,
  targetQuoteId: string,
  quantityByLineItemId?: Map<string, number>,
  preservePricingSnapshot = false,
): Promise<void> {
  const { data, error } = await supabase
    .from("crm_quote_line_items")
    .select("*, designs:crm_quote_designs!crm_quote_designs_line_item_id_fkey(*)")
    .eq("quote_id", source.id);
  if (error) throw new CrmAuthError(502, "Source quote windows could not be loaded.");

  const sourceItems = ((data as CrmQuoteLineItem[]) ?? [])
    .map((item) => ({ ...item, designs: sortedDesigns({ ...item, designs: item.designs ?? [] }) }))
    .sort((a, b) => a.sort_order - b.sort_order);
  if (!sourceItems.length) return;

  const clonedLineItems: CrmQuoteLineItem[] = [];
  for (const item of sourceItems) {
    const requestedQuantity = quantityByLineItemId?.get(item.id);
    if (quantityByLineItemId && (!requestedQuantity || requestedQuantity < 1)) continue;
    const { data: lineData, error: lineError } = await supabase
      .from("crm_quote_line_items")
      .insert({
        quote_id: targetQuoteId,
        room: item.room,
        width_in: item.width_in,
        height_in: item.height_in,
        quantity: requestedQuantity ?? Math.max(1, Math.floor(Number(item.quantity) || 1)),
        sort_order: item.sort_order,
        notes: item.notes,
        discount_percent: Math.min(100, Math.max(0, Number(item.discount_percent) || 0)),
      })
      .select("*")
      .single();
    const clonedLine = lineData as CrmQuoteLineItem | null;
    if (lineError || !clonedLine) throw new CrmAuthError(502, "Quote version window could not be copied.");

    const clonedDesigns: CrmQuoteDesign[] = [];
    const dims = { width_in: clonedLine.width_in, height_in: clonedLine.height_in };
    const discountPercent = Number(clonedLine.discount_percent) || 0;
    let selectedNewId: string | null = null;
    for (const design of sortedDesigns(item)) {
      const designInput = {
        product_id: design.product_id,
        program_id: design.program_id,
        fabric: design.fabric,
        details: detailsRecord(design.details),
        surcharges: [],
        motorization: motorizationList(design.motorization),
      };
      const clonedDesign = preservePricingSnapshot
        ? await saveQuoteDesignRecord<CrmQuoteDesign>(
            {
              line_item_id: clonedLine.id,
              label: design.label,
              sort_order: design.sort_order,
              ...designInput,
              notes: design.notes,
              unit_price: design.unit_price,
              wholesale_unit_price: design.wholesale_unit_price,
              price_breakdown: design.price_breakdown,
              price_status: design.price_status,
              priced_at: design.priced_at,
            },
            (nextRecord) => supabase.from("crm_quote_designs").insert(nextRecord).select("*").single(),
            "Quote selection price snapshot could not be copied.",
          )
        : await saveQuoteDesignRecord<CrmQuoteDesign>(
            {
              line_item_id: clonedLine.id,
              label: design.label,
              sort_order: design.sort_order,
              ...designInput,
              notes: design.notes,
              ...priceDesignFields(designInput, dims, discountPercent),
            },
            (nextRecord) => supabase.from("crm_quote_designs").insert(nextRecord).select("*").single(),
            "Quote version design could not be copied.",
          );
      clonedDesigns.push(clonedDesign);
      if (item.selected_design_id === design.id) selectedNewId = clonedDesign.id;
    }

    if (selectedNewId) {
      const { error: selectError } = await supabase
        .from("crm_quote_line_items")
        .update({ selected_design_id: selectedNewId })
        .eq("id", clonedLine.id);
      if (selectError) throw new CrmAuthError(502, "Quote version selected design could not be saved.");
    }
    clonedLineItems.push({ ...clonedLine, selected_design_id: selectedNewId, designs: clonedDesigns });
  }

  const money = computeQuoteMoney(quoteSubtotal(clonedLineItems), parseAdjustments(source.meta));
  const { error: quoteError } = await supabase
    .from("crm_quotes")
    .update({
      quote_total: money.total,
      discount: money.discountAmount,
      tax: money.taxAmount,
      deposit_required: money.depositRequired,
      balance_due: money.balanceDue,
    })
    .eq("id", targetQuoteId);
  if (quoteError) throw new CrmAuthError(502, "Quote version total could not be recalculated.");
}

export type SignedQuoteSelectionLine = {
  id: string;
  lineItemId: string;
};

export type SignedQuoteSplitLine = {
  lineItemId: string;
  selectedQuantity: number;
  remainingQuantity: number;
};

export function buildSignedQuoteSplitPlan(
  lines: SignedQuoteSelectionLine[],
  selectedLineIds: string[],
): SignedQuoteSplitLine[] {
  const selected = new Set(selectedLineIds);
  const totals = new Map<string, number>();
  const selectedTotals = new Map<string, number>();

  for (const line of lines) {
    totals.set(line.lineItemId, (totals.get(line.lineItemId) ?? 0) + 1);
    if (selected.has(line.id)) {
      selectedTotals.set(line.lineItemId, (selectedTotals.get(line.lineItemId) ?? 0) + 1);
    }
  }

  return [...totals.entries()].map(([lineItemId, totalQuantity]) => {
    const selectedQuantity = selectedTotals.get(lineItemId) ?? 0;
    return {
      lineItemId,
      selectedQuantity,
      remainingQuantity: totalQuantity - selectedQuantity,
    };
  });
}

export type MaterializedSignedQuoteSelection = {
  groupId: string;
  pendingQuoteId: string | null;
  pendingLabel: string | null;
};

/**
 * Turn a customer "Purchase some" choice into operational CRM records:
 * the signed source quote keeps only purchased quantities and the excluded
 * quantities are copied to a draft sibling that the CRM labels Pending Quote.
 *
 * A completed split is idempotent: retries return the remainder recorded in
 * source metadata instead of creating duplicates.
 */
export async function materializeSignedQuoteSelection(
  supabase: CrmSupabaseClient,
  sourceQuoteId: string,
  lines: SignedQuoteSelectionLine[],
  selectedLineIds: string[],
): Promise<MaterializedSignedQuoteSelection> {
  const source = await fetchQuoteRow(supabase, sourceQuoteId);
  const sourceMeta = record(source.meta);
  const priorPendingId = typeof sourceMeta.selection_remainder_quote_id === "string"
    ? sourceMeta.selection_remainder_quote_id
    : null;
  if (priorPendingId) {
    return {
      groupId: source.quote_group_id || String(sourceMeta.selection_split_group_id || ""),
      pendingQuoteId: priorPendingId,
      pendingLabel: typeof sourceMeta.selection_remainder_quote_label === "string"
        ? sourceMeta.selection_remainder_quote_label
        : null,
    };
  }

  const plan = buildSignedQuoteSplitPlan(lines, selectedLineIds);
  const remainingByLineItemId = new Map(
    plan.filter((line) => line.remainingQuantity > 0).map((line) => [line.lineItemId, line.remainingQuantity]),
  );
  if (!remainingByLineItemId.size) {
    return { groupId: source.quote_group_id || "", pendingQuoteId: null, pendingLabel: null };
  }

  const groupId = source.quote_group_id || randomUUID();
  const sourceLabel = source.quote_label || "A";
  if (!source.quote_group_id || !source.quote_label) {
    const { error } = await supabase
      .from("crm_quotes")
      .update({ quote_group_id: groupId, quote_label: sourceLabel })
      .eq("id", source.id);
    if (error) throw new CrmAuthError(502, "Signed quote group could not be created.");
  }

  const usedLabels = (await listQuoteVersions(supabase, source.id)).map((version) => version.label);
  const pendingLabel = nextLabel(usedLabels);
  const pendingMeta = {
    ...cloneQuoteMeta(source, { email: "automation:customer_selection" }, pendingLabel),
    selection_split_role: "remaining",
    selection_split_from_quote_id: source.id,
  };
  const { data: pendingRow, error: pendingError } = await supabase
    .from("crm_quotes")
    .insert({
      job_id: source.job_id,
      quote_number: source.quote_number ? `${source.quote_number}-${pendingLabel}` : null,
      status: "draft",
      quote_total: 0,
      materials_cost: 0,
      labor_cost: 0,
      discount: 0,
      tax: 0,
      deposit_required: 0,
      balance_due: 0,
      customer_email: source.customer_email || null,
      customer_phone: source.customer_phone || null,
      customer_address: source.customer_address || null,
      quote_group_id: groupId,
      quote_label: pendingLabel,
      notes: source.notes || null,
      meta: pendingMeta,
    })
    .select("id")
    .single();
  if (pendingError || !pendingRow) throw new CrmAuthError(502, "Unpurchased items quote could not be created.");
  const pendingQuoteId = String(pendingRow.id);

  await cloneQuoteBuilderRows(supabase, source, pendingQuoteId, remainingByLineItemId, true);

  for (const line of plan) {
    if (line.selectedQuantity > 0) {
      const { error } = await supabase
        .from("crm_quote_line_items")
        .update({ quantity: line.selectedQuantity })
        .eq("id", line.lineItemId)
        .eq("quote_id", source.id);
      if (error) throw new CrmAuthError(502, "Purchased quote quantities could not be saved.");
    } else {
      const { error } = await supabase
        .from("crm_quote_line_items")
        .delete()
        .eq("id", line.lineItemId)
        .eq("quote_id", source.id);
      if (error) throw new CrmAuthError(502, "Unpurchased quote lines could not be separated.");
    }
  }

  const { error: sourceMetaError } = await supabase
    .from("crm_quotes")
    .update({
      quote_group_id: groupId,
      quote_label: sourceLabel,
      meta: {
        ...sourceMeta,
        selection_split_group_id: groupId,
        selection_remainder_quote_id: pendingQuoteId,
        selection_remainder_quote_label: pendingLabel,
      },
    })
    .eq("id", source.id);
  if (sourceMetaError) throw new CrmAuthError(502, "Signed quote selection link could not be saved.");

  return { groupId, pendingQuoteId, pendingLabel };
}

export async function listQuoteVersions(supabase: CrmSupabaseClient, quoteId: string): Promise<QuoteVersion[]> {
  const quote = await fetchQuoteRow(supabase, quoteId);
  const toVersion = (q: CrmQuote): QuoteVersion => ({
    id: q.id,
    label: q.quote_label || "A",
    status: q.status,
    quote_total: Number(q.quote_total) || 0,
    share_token: q.share_token,
    signed: Boolean(q.signed_at),
  });
  if (!quote.quote_group_id) return [toVersion(quote)];
  const { data } = await supabase
    .from("crm_quotes")
    .select("*")
    .eq("quote_group_id", quote.quote_group_id);
  const versions = ((data as CrmQuote[]) ?? []).map(toVersion);
  versions.sort((a, b) => a.label.localeCompare(b.label));
  return versions.length ? versions : [toVersion(quote)];
}

export async function createQuoteVersion(
  supabase: CrmSupabaseClient,
  sourceQuoteId: string,
  actor: CrmActor,
): Promise<{ quoteId: string; groupId: string; label: string }> {
  const source = await fetchQuoteRow(supabase, sourceQuoteId);

  // Ensure the source belongs to a group (and is labeled "A").
  let groupId = source.quote_group_id;
  if (!groupId) {
    groupId = randomUUID();
    const { error: groupErr } = await supabase
      .from("crm_quotes")
      .update({ quote_group_id: groupId, quote_label: source.quote_label || "A" })
      .eq("id", source.id);
    if (groupErr) throw new CrmAuthError(502, "Could not start a quote group.");
  }

  // Insert the next free label, retrying if a concurrent creation grabbed the
  // same label first (unique (quote_group_id, quote_label) index → 23505). The
  // retry recomputes the label from the now-current sibling set.
  const usedLabels = (await listQuoteVersions(supabase, source.id)).map((s) => s.label);
  let label = nextLabel(usedLabels);
  let createdId: string | null = null;
  for (let attempt = 0; attempt < 4 && !createdId; attempt += 1) {
    const { data, error } = await supabase
      .from("crm_quotes")
      .insert({
        job_id: source.job_id,
        quote_number: source.quote_number ? `${source.quote_number}-${label}` : null,
        status: "draft",
        quote_total: Number(source.quote_total) || 0,
        materials_cost: Number(source.materials_cost) || 0,
        labor_cost: Number(source.labor_cost) || 0,
        discount: Number(source.discount) || 0,
        tax: Number(source.tax) || 0,
        deposit_required: Number(source.deposit_required) || 0,
        balance_due: Number(source.balance_due) || 0,
        customer_email: source.customer_email || null,
        customer_phone: source.customer_phone || null,
        customer_address: source.customer_address || null,
        quote_group_id: groupId,
        quote_label: label,
        notes: source.notes || null,
        meta: cloneQuoteMeta(source, actor, label),
      })
      .select("id")
      .single();
    if (!error && data) {
      createdId = data.id;
      break;
    }
    if (error && (error as { code?: string }).code === "23505") {
      // Label taken by a concurrent insert — recompute against the latest siblings.
      usedLabels.push(label);
      const fresh = (await listQuoteVersions(supabase, source.id)).map((s) => s.label);
      label = nextLabel([...usedLabels, ...fresh]);
      continue;
    }
    throw new CrmAuthError(502, "New quote version could not be created.");
  }
  if (!createdId) throw new CrmAuthError(409, "Could not assign a unique version label. Please retry.");

  await cloneQuoteBuilderRows(supabase, source, createdId);

  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: createdId,
    action: "version.create",
    metadata: { groupId, label, sourceId: source.id },
  });
  return { quoteId: createdId, groupId, label };
}

/**
 * Ensure a bookkeeping entry exists for a quote (used when a version is sold).
 * No-op if one already exists. Mirrors createCrmQuote's entry shape.
 */
export async function ensureBookkeepingEntry(supabase: CrmSupabaseClient, quote: CrmQuote): Promise<void> {
  const { data: existing } = await supabase
    .from("crm_quote_bookkeeping_entries")
    .select("id")
    .eq("quote_id", quote.id)
    .maybeSingle();
  if (existing) return;

  let customerName = "Linked job";
  if (quote.job_id) {
    const { data: job } = await supabase.from("crm_jobs").select("customer_name").eq("id", quote.job_id).maybeSingle();
    customerName = (job as { customer_name?: string } | null)?.customer_name || customerName;
  }
  const { error } = await supabase.from("crm_quote_bookkeeping_entries").insert({
    quote_id: quote.id,
    job_id: quote.job_id,
    source: "crm_quote",
    customer_name: customerName,
    sold_date: new Date().toISOString().slice(0, 10),
    total_amount: Number(quote.quote_total) || 0,
    payment_type: "other",
    cogs_amount: Number(quote.materials_cost) || 0,
    meta: { createdBy: "system:sold" },
  });
  if (error) throw new CrmAuthError(502, "Signed quote could not be added to the bookkeeping ledger.");
}
