// Whole-quote versions ("Quote A / Quote B / Quote C").
// Sibling crm_quotes sharing quote_group_id are alternative whole quotes the
// customer compares and picks one of. Conservative bookkeeping: alternative
// versions do NOT create a bookkeeping entry on creation; one is ensured only
// when a version is sold, so unsold alternatives never inflate the pipeline.

import { randomUUID } from "node:crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { recordCrmActivity } from "@/lib/crm/backend";
import type { CrmQuote } from "@/lib/crm/types";

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

  const siblings = await listQuoteVersions(supabase, source.id);
  const label = nextLabel(siblings.map((s) => s.label));

  const { data, error } = await supabase
    .from("crm_quotes")
    .insert({
      job_id: source.job_id,
      quote_number: source.quote_number ? `${source.quote_number}-${label}` : null,
      status: "draft",
      quote_total: 0,
      materials_cost: 0,
      labor_cost: 0,
      discount: 0,
      tax: 0,
      deposit_required: 0,
      balance_due: 0,
      quote_group_id: groupId,
      quote_label: label,
      meta: { createdBy: actor.email, createdAsVersionOf: source.id },
    })
    .select("id")
    .single();
  if (error || !data) throw new CrmAuthError(502, "New quote version could not be created.");

  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: data.id,
    action: "version.create",
    metadata: { groupId, label, sourceId: source.id },
  });
  return { quoteId: data.id, groupId, label };
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
  await supabase.from("crm_quote_bookkeeping_entries").insert({
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
}
