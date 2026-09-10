import type { SalesQuote, SalesQuoteLineItem } from "@mts/types/quote";


type Projection = { accepted: boolean; lineItems: SalesQuoteLineItem[]; lineTotals: ReadonlyMap<string, number>; acceptedTotal: number | null; error: string | null };
const failure = (): Projection => ({ accepted: true, lineItems: [], lineTotals: new Map(), acceptedTotal: null, error: "Accepted window selection could not be verified. The original quote has been preserved. Reload the saved contract or contact support." });
const money = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const cents = (value: number) => Math.round(value * 100);

/** Project accepted quantities for display only; never alter saved rows or snapshots. */
export function projectAcceptedQuote(
  quote: Pick<SalesQuote, "id" | "quote_v2_backend" | "quote_v2_accepted_selection"> | null | undefined,
  sourceLines: SalesQuoteLineItem[],
): Projection {
  if (quote?.quote_v2_backend !== true || quote.quote_v2_accepted_selection == null) {
    return { accepted: false, lineItems: sourceLines, lineTotals: new Map(), acceptedTotal: null, error: null };
  }
  const selection = quote.quote_v2_accepted_selection;
  if (!selection || !Array.isArray(selection.lineQuantities) || !Array.isArray(selection.selectedLineIds) ||
      !money(selection.acceptedTotal) || !money(selection.originalTotal) || !selection.crmQuoteId ||
      selection.lineQuantities.length !== sourceLines.length || sourceLines.length === 0) return failure();
  const physicalIds = new Set(selection.selectedLineIds);
  if (physicalIds.size !== selection.selectedLineIds.length) return failure();
  const sourceById = new Map(sourceLines.map((line) => [line.id, line]));
  const selectedById = new Map<string, number>();
  const lineTotals = new Map<string, number>();
  let selectedCount = 0; let acceptedCents = 0; let originalCents = 0;
  for (const entry of selection.lineQuantities) {
    const source = sourceById.get(entry?.lineItemId);
    if (!source || source.quote_id !== quote.id || selectedById.has(source.id) ||
        !Number.isSafeInteger(source.quantity) || source.quantity < 1 ||
        !Number.isSafeInteger(entry.selectedQuantity) || entry.selectedQuantity < 0 ||
        !Number.isSafeInteger(entry.remainingQuantity) || entry.remainingQuantity < 0 ||
        entry.selectedQuantity + entry.remainingQuantity !== source.quantity ||
        !money(entry.acceptedTotal) || !money(entry.originalTotal) ||
        entry.acceptedTotal > entry.originalTotal || (entry.selectedQuantity === 0 && entry.acceptedTotal !== 0)) return failure();
    let count = 0; let selectedCents = 0;
    const baseCents = Math.floor(cents(entry.originalTotal) / source.quantity);
    const remainderCents = cents(entry.originalTotal) % source.quantity;
    for (let index = 1; index <= source.quantity; index++) {
      const id = source.quantity === 1 ? source.id : `${source.id}#${index}`;
      if (physicalIds.delete(id)) { count++; selectedCents += baseCents + (index <= remainderCents ? 1 : 0); }
    }
    if (count !== entry.selectedQuantity || selectedCents !== cents(entry.acceptedTotal)) return failure();
    selectedById.set(source.id, entry.selectedQuantity);
    lineTotals.set(source.id, entry.acceptedTotal);
    selectedCount += entry.selectedQuantity;
    acceptedCents += cents(entry.acceptedTotal); originalCents += cents(entry.originalTotal);
  }
  if (physicalIds.size || selectedCount === 0 || acceptedCents !== cents(selection.acceptedTotal) || originalCents !== cents(selection.originalTotal)) return failure();
  return {
    accepted: true,
    lineItems: sourceLines.filter((line) => selectedById.get(line.id)! > 0).map((line) => ({ ...line, quantity: selectedById.get(line.id)! })),
    lineTotals, acceptedTotal: selection.acceptedTotal, error: null,
  };
}
