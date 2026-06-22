// Turn a pricing engine breakdown into the rows shown in the builder's
// "Why this price?" panel. Pure + isomorphic so it can be unit-tested and
// imported into the client without bundling the catalog.
//
// Retail-focused (the builder shows wholesale/cost elsewhere). Every row is
// per-window except the final totals, so the math reads top-to-bottom and
// reconciles to the billed line total.

import type { PriceBreakdown } from "./pricing";

export type PriceExplanationRow = {
  label: string;
  amount: string;
  kind: "base" | "surcharge" | "discount" | "perwindow" | "qty" | "once" | "total";
};

function money(n: number): string {
  return (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function summarizePriceBreakdown(b: PriceBreakdown, quantity: number): PriceExplanationRow[] {
  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  const rows: PriceExplanationRow[] = [];

  // Base + the sizing basis it came from (grid cell for w×h programs, billable
  // sq ft for shutters, width-only for width-priced programs).
  if (b.billableSqft != null) {
    rows.push({ label: `Base · ${b.billableSqft} sq ft`, amount: money(b.base), kind: "base" });
  } else if (b.matchedHeight == null) {
    rows.push({ label: `Base · width ${b.matchedWidth}"`, amount: money(b.base), kind: "base" });
  } else {
    rows.push({ label: `Base · grid ${b.matchedWidth}" × ${b.matchedHeight}"`, amount: money(b.base), kind: "base" });
  }

  for (const line of b.surchargeLines ?? []) {
    rows.push({
      label: line.label + (line.detail ? ` · ${line.detail}` : ""),
      amount: money(line.amount),
      kind: line.kind === "percent" ? "surcharge" : "surcharge",
    });
  }

  if (b.discountPercent > 0) {
    rows.push({ label: `${b.discountPercent}% line discount`, amount: `− ${money(b.discountAmount)}`, kind: "discount" });
  }

  rows.push({ label: "Per window", amount: money(b.unitPrice), kind: "perwindow" });

  if (qty > 1) {
    rows.push({ label: `× ${qty} windows`, amount: money(b.unitPrice * qty), kind: "qty" });
  }
  if (b.onceTotal > 0) {
    rows.push({ label: "Once charges", amount: money(b.onceTotal), kind: "once" });
  }
  // Only show the explicit "Line total" row when it differs from the per-window
  // price (qty > 1 or once charges); otherwise per-window IS the line total.
  if (qty > 1 || b.onceTotal > 0) {
    rows.push({ label: "Line total", amount: money(b.total), kind: "total" });
  }

  return rows;
}
