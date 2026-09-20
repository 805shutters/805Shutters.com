import { objectMeta } from "./measure-needed-state";
import { quoteLineProductName, selectedQuoteLineQuantities } from "./quote-line-evidence";
import type { JobTrackingViewItem } from "./job-tracking-view";

export type HeaderProduct = { id: string; name: string; quantity: number };
export type HeaderProductSource = "signed_snapshot" | "accepted_quote_lines";

type EvidenceLine = { id: string; name: string; quantity: number };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const positiveQuantity = (value: unknown): number | null => Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;

function groupEvidenceLines(lines: EvidenceLine[]): HeaderProduct[] {
  const groups = new Map<string, HeaderProduct>();
  for (const line of lines) {
    const name = line.name.trim().replace(/\s+/g, " ");
    const id = name.toLocaleLowerCase();
    const existing = groups.get(id);
    groups.set(id, existing ? { ...existing, quantity: existing.quantity + line.quantity } : { id, name, quantity: line.quantity });
  }
  return [...groups.values()];
}

function snapshotHeaderProducts(source: Pick<JobTrackingViewItem, "contracts" | "quote">): HeaderProduct[] | null {
  for (const contract of source.contracts) {
    if (objectMeta(contract.meta).deleted_at) continue;
    const snapshot = record(objectMeta(contract.meta).contract_snapshot);
    if (snapshot.schema !== "805_signed_quote_contract_v1") continue;
    const lines = snapshot.lines;
    if (!contract.signed_at && typeof snapshot.signedAt !== "string") return [];
    if (!Array.isArray(lines) || !lines.length) return [];
    const evidence: EvidenceLine[] = [];
    for (const value of lines) {
      const line = record(value);
      const id = typeof line.lineItemId === "string" ? line.lineItemId.trim() : "";
      const name = typeof line.productName === "string" ? line.productName.trim() : "";
      const quantity = positiveQuantity(line.quantity);
      if (!id || !name || quantity === null || objectMeta(line.meta).deleted_at) return [];
      evidence.push({ id, name, quantity });
    }
    return groupEvidenceLines(evidence);
  }
  return null;
}

function quoteHeaderProducts(source: Pick<JobTrackingViewItem, "contracts" | "quote">): HeaderProduct[] | null {
  const quote = source.quote as (typeof source.quote & { lineItems?: unknown; line_items?: unknown; source_sold_at?: string | null }) | undefined;
  const acceptedStatus = new Set(["sold", "approved", "ordered", "received", "installed", "invoiced", "paid"]);
  const accepted = quote && Object.hasOwn(quote, "source_sold_at")
    ? Boolean(quote.source_sold_at)
    : Boolean(quote && (quote.signed_at || quote.sold_at || quote.approved_at || quote.customer_signature || acceptedStatus.has(quote.status)));
  if (!quote || !accepted || objectMeta(quote.meta).deleted_at) return null;
  const rawLines = Array.isArray(quote.lineItems) ? quote.lineItems : Array.isArray(quote.line_items) ? quote.line_items : null;
  if (!rawLines?.length) return null;
  const meta = objectMeta(quote.meta);
  const partial = objectMeta(meta.partial_acceptance);
  const materialized = partial.role === "current";
  const rawSelection = objectMeta(meta.signed_selection).lineItemIds;
  const selection = Array.isArray(rawSelection) && rawSelection.every(id => typeof id === "string") ? rawSelection as string[] : null;
  if (!materialized && Array.isArray(rawSelection) && !selection?.length) return [];
  const selectedQuantities = selection && !materialized ? selectedQuoteLineQuantities(rawLines, selection) : null;
  if (selection && !materialized && !selectedQuantities) return [];
  const legacyMts = meta.legacy_quote_system === "mts_sales_quote" || typeof meta.mts_quote_id === "string";
  const evidence: EvidenceLine[] = [];
  for (const value of rawLines) {
    const line = record(value);
    if (objectMeta(line.meta).deleted_at) continue;
    const id = typeof line.id === "string" ? line.id : "";
    const selectedQuantity = selectedQuantities?.get(id);
    if (selectedQuantities && selectedQuantity === undefined) continue;
    const storedQuantity = positiveQuantity(line.quantity);
    const name = quoteLineProductName(line, legacyMts);
    if (!id || storedQuantity === null || !name) return [];
    evidence.push({ id, name, quantity: selectedQuantity ?? storedQuantity });
  }
  return evidence.length ? groupEvidenceLines(evidence) : [];
}

export function contractHeaderProducts(source: Pick<JobTrackingViewItem, "contracts" | "quote">): { products: HeaderProduct[]; source: HeaderProductSource | null } {
  const snapshot = snapshotHeaderProducts(source);
  if (snapshot !== null) return { products: snapshot, source: snapshot.length ? "signed_snapshot" : null };
  const quote = quoteHeaderProducts(source);
  return quote?.length ? { products: quote, source: "accepted_quote_lines" } : { products: [], source: null };
}

