/** Display-only amounts. Never replace the authoritative billed line totals. */
export type ContractLinePrice = {
  id: string;
  lineTotal: number;
  originalLineTotal?: number;
  fixedCharges?: number;
};
export type ContractPriceBreakdown = {
  originalPrice: number;
  discountedPrice: number;
  savings: number;
};
const cents = (value: number | undefined) => Number.isFinite(value) ? Math.max(0, Math.round(Number(value) * 100)) : 0;

/** Read the retail savings captured when the product was priced, including 100% off. */
export function originalContractLineTotal(total: number, quantity: number, snapshot: unknown): number {
  const price = snapshot && typeof snapshot === "object" ? snapshot as Record<string, unknown> : {};
  const options = price.optionsJson && typeof price.optionsJson === "object" ? price.optionsJson as Record<string, unknown> : price;
  const retail = options.authoritative_price_breakdown && typeof options.authoritative_price_breakdown === "object"
    ? options.authoritative_price_breakdown as Record<string, unknown> : price;
  // The legacy builder stores its current discount beside the pricing snapshot.
  const savings = Number(options.discount_percent) > 0 && typeof options.discount_amount === "number"
    ? options.discount_amount : retail.discountAmount;
  return (cents(total) + cents(typeof savings === "number" ? savings : 0) * Math.max(1, Math.floor(quantity))) / 100;
}

/** Allocate the existing quote discount in cents. Percentage discounts include
 * eligible extra fees; additional flat savings go to merchandise first. Fixed
 * customer charges stay intact. Largest remainders keep all line amounts exact. */
export function contractLinePrices(
  lines: readonly ContractLinePrice[],
  discount = 0,
  fees = 0,
  discountPercent = 0,
): Map<string, ContractPriceBreakdown> {
  const weights = lines.map(line => Math.max(0, cents(line.lineTotal) - cents(line.fixedCharges)));
  const merchandise = weights.reduce((sum, value) => sum + value, 0);
  const discountCents = Math.min(cents(discount), merchandise + cents(fees));
  const percent = Number.isFinite(discountPercent) ? Math.min(100, Math.max(0, discountPercent)) : 0;
  const feePercentDiscount = Math.min(discountCents, Math.round(cents(fees) * percent / 100));
  const productDiscount = Math.min(merchandise, discountCents - feePercentDiscount);
  const shares = weights.map(weight => merchandise > 0 ? productDiscount * weight / merchandise : 0);
  const allocated = shares.map(Math.floor);
  let remainder = productDiscount - allocated.reduce((sum, amount) => sum + amount, 0);
  const order = shares.map((share, index) => ({ index, fraction: share - allocated[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const entry of order) {
    if (remainder-- <= 0) break;
    allocated[entry.index] += 1;
  }
  return new Map(lines.map((line, index) => {
    const billed = cents(line.lineTotal);
    const original = Math.max(billed, cents(line.originalLineTotal ?? line.lineTotal));
    const discounted = billed - allocated[index];
    return [line.id, { originalPrice: original / 100, discountedPrice: discounted / 100, savings: (original - discounted) / 100 }];
  }));
}

/** Combined saved line discounts plus the quote discount, counted once.
 * Include fee discounts here even though they are not allocated to product rows. */
export function contractTotalSavings(lines: readonly ContractLinePrice[], discount = 0): number {
  return (lines.reduce((sum, line) => sum + Math.max(0, cents(line.originalLineTotal ?? line.lineTotal) - cents(line.lineTotal)), 0) + cents(discount)) / 100;
}
