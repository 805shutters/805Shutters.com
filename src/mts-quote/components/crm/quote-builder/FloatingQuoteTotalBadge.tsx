import {
  resolveQuoteDisplayTotal,
  type QuoteTotalDesign,
  type QuoteTotalLineItem,
} from "@mts/lib/quoteTotals";

function formatCurrency(value: number): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function FloatingQuoteTotalBadge({
  lineItems,
  designs,
  storedTotal,
}: {
  lineItems: QuoteTotalLineItem[];
  designs: QuoteTotalDesign[];
  storedTotal?: number | null;
}) {
  const total = resolveQuoteDisplayTotal(storedTotal, lineItems, designs);

  return (
    <aside
      className="fixed bottom-3 right-3 z-50 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-right shadow-[0_12px_32px_rgba(15,35,70,0.18)] backdrop-blur"
      aria-live="polite"
      aria-label={`Contract Total ${formatCurrency(total)}`}
    >
      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
        Contract Total
      </div>
      <div className="text-base font-black leading-tight text-slate-950 tabular-nums">
        {formatCurrency(total)}
      </div>
    </aside>
  );
}
