import { objectMeta } from "./measure-needed-state";
import { customerQuoteProductName } from "./customer-quote-branding";
import { getProduct } from "@/lib/quote/catalog";
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const positiveQuantity = (value: unknown): number | null => Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;

export function quoteLineProductName(line: Record<string, unknown>, legacyMts: boolean): string | null {
  const designs = Array.isArray(line.designs) ? line.designs.map(record) : [];
  const selectedId = typeof line.selected_design_id === "string" ? line.selected_design_id : typeof line.selectedDesignId === "string" ? line.selectedDesignId : null;
  const selected = selectedId ? designs.find(design => design.id === selectedId) : null;
  const direct = line.productName ?? line.product_name ?? line.product_type;
  const selectedName = selected?.productName ?? selected?.product_name ?? selected?.product_type;
  const breakdown = record(selected?.price_breakdown);
  const legacyProductType = breakdown.source === "mts_805_bookkeeping" ? breakdown.productType : null;
  const legacyNotes = legacyMts ? line.notes : null;
  if (designs.length && !selected && !direct && !legacyNotes) return null;
  const productId = typeof selected?.product_id === "string" ? selected.product_id : null;
  const catalogName = productId ? getProduct(productId)?.name : null;
  const raw = [direct, legacyNotes, selectedName, legacyProductType, catalogName].find(value => typeof value === "string" && value.trim());
  return typeof raw === "string" ? customerQuoteProductName(raw) : null;
}

export function selectedQuoteLineQuantities(rawLines: unknown[], selection: string[]): Map<string, number> | null {
  if (!selection.length || new Set(selection).size !== selection.length) return null;
  const lines = new Map<string, Record<string, unknown>>();
  for (const value of rawLines) {
    const line = record(value);
    if (objectMeta(line.meta).deleted_at) continue;
    const id = typeof line.id === "string" ? line.id : "";
    if (!id) continue;
    if (lines.has(id)) return null;
    lines.set(id, line);
  }

  const quantities = new Map<string, number>();
  for (const selectedId of selection) {
    const exactLine = lines.get(selectedId);
    if (exactLine) {
      const quantity = positiveQuantity(exactLine.quantity);
      if (quantity !== 1) return null;
      quantities.set(selectedId, 1);
      continue;
    }

    const expanded = /^(.*)#([1-9]\d*)$/.exec(selectedId);
    if (!expanded) return null;
    const line = lines.get(expanded[1]);
    const quantity = positiveQuantity(line?.quantity);
    const unit = Number(expanded[2]);
    if (!line || quantity === null || quantity === 1 || unit > quantity) return null;
    quantities.set(expanded[1], (quantities.get(expanded[1]) || 0) + 1);
  }
  return quantities;
}

