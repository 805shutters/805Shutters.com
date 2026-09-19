import type { CrmBookkeepingRow, CrmQuote } from "./types";
import { quoteLineProductName, selectedQuoteLineQuantities } from "./quote-line-evidence";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export type InstallationEstimate = {
  amount: number | null;
  lines: { id: string; room: string; product: string; quantity: number; squareFeet: number | null; trackFee: number; amount: number }[];
  issues: string[];
};

/** Installation only: measured opening area, no manufacturer minimum billable area. */
export function installationEstimate(quote?: CrmQuote | null): InstallationEstimate {
  const result: InstallationEstimate = { amount: null, lines: [], issues: [] };
  const fail = (issue: string) => { result.issues.push(issue); return result; };
  if (!quote?.lineItems?.length) return fail("Quote line items needed");
  const meta = record(quote.meta);
  if (meta.deleted_at) return fail("Quote is deleted");
  const selection = record(meta.signed_selection).lineItemIds;
  let quantities: Map<string, number> | null = null;
  if (selection !== undefined && record(meta.partial_acceptance).role !== "current") {
    if (!Array.isArray(selection) || !selection.every(id => typeof id === "string")) return fail("Verify accepted quote items");
    quantities = selectedQuoteLineQuantities(quote.lineItems, selection);
    if (!quantities) return fail("Verify accepted quote items");
  }
  const seen = new Set<string>();
  const legacy = meta.legacy_quote_system === "mts_sales_quote" || typeof meta.mts_quote_id === "string";
  for (const line of quote.lineItems) {
    if (quantities && !quantities.has(line.id)) continue;
    const raw = line as unknown as Record<string, unknown>;
    if (record(raw.meta).deleted_at) continue;
    const label = line.room || "Opening";
    const quantity = quantities?.get(line.id) ?? line.quantity;
    if (!line.id || seen.has(line.id) || !Number.isSafeInteger(quantity) || quantity <= 0) { fail(`${label}: verify quantity`); continue; }
    seen.add(line.id);
    const product = quoteLineProductName(raw, legacy);
    const design = line.designs?.find(d => d.id === line.selected_design_id);
    if (!design || !product) { fail(`${label}: select a product`); continue; }
    const normalized = product.toLowerCase();
    // Combined legacy labels cannot establish quantities for each product.
    const shutter = /shutter/.test(normalized);
    const shade = /blind|shade|honeycomb|roller|cellular/.test(normalized);
    if (shutter === shade) { fail(`${label}: verify product type`); continue; }
    let squareFeet: number | null = null;
    let trackFee = 0;
    let amount = 25 * quantity;
    if (shutter) {
      const width = line.width_in; const height = line.height_in;
      if (typeof width !== "number" || typeof height !== "number" || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) { fail(`${label}: shutter measurements needed`); continue; }
      squareFeet = width * height / 144 * quantity;
      const details = record(design.details);
      const options = { ...record(record(design.price_breakdown).optionsJson), ...record(details.quote_v2_customer_configuration), ...record((design as unknown as Record<string, unknown>).options_json), ...record(details.options_json), ...details };
      const track = [options.track_system, options.track_type, options.panel_config, options.trackSystem, options.trackType, options.panelConfig].some(value => typeof value === "string" && /by[\s_-]*pass|bi[\s_-]*fold|triple[\s_-]*track|track[_\s-]*(only|header|w_header)/i.test(value));
      trackFee = track ? 50 * quantity : 0;
      amount = squareFeet * 4.5 + trackFee;
    }
    result.lines.push({ id: line.id, room: label, product, quantity, squareFeet, trackFee, amount: money(amount) });
  }
  if (!result.lines.length && !result.issues.length) fail("Quote line items needed");
  if (!result.issues.length) result.amount = money(result.lines.reduce((sum, line) => sum + line.amount, 0));
  return result;
}

export function installationCost(row?: Pick<CrmBookkeepingRow, "installationInvoiceAmount" | "installationInvoiceDocumentId" | "installationMatchStatus" | "installationEstimate"> | null, quote?: CrmQuote | null) {
  const actual = row && (row.installationInvoiceAmount > 0 || (row.installationInvoiceDocumentId && row.installationMatchStatus === "matched"));
  if (actual) return { amount: row.installationInvoiceAmount, source: "invoice" as const, estimate: null };
  const estimate = row?.installationEstimate ?? installationEstimate(quote);
  return { amount: estimate.amount, source: "estimate" as const, estimate };
}
