import {
  resolveQuoteDisplayTotal,
  unpricedQuoteLineIds,
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
  preferStoredTotal = false,
  authoritativeV2 = false,
  historicalTotal,
  useHistoricalTotal = false,
}: {
  lineItems: QuoteTotalLineItem[];
  designs: QuoteTotalDesign[];
  storedTotal?: number | null;
  preferStoredTotal?: boolean;
  authoritativeV2?: boolean;
  historicalTotal?: number | null;
  useHistoricalTotal?: boolean;
}) {
  const calculatedTotal = preferStoredTotal && Number.isFinite(Number(storedTotal))
    ? Number(storedTotal)
    : resolveQuoteDisplayTotal(storedTotal, lineItems, designs, {
        mode: authoritativeV2 ? "authoritative_v2" : "legacy",
      });
  const lockedTotal = Number(historicalTotal);
  const fromHistoricalLock =
    useHistoricalTotal && Number.isFinite(lockedTotal) && lockedTotal > 0;
  const total = fromHistoricalLock ? lockedTotal : calculatedTotal;

  const missingPrices = authoritativeV2 && !fromHistoricalLock ? unpricedQuoteLineIds(lineItems, designs).length : 0;
  const incomplete = authoritativeV2 && !fromHistoricalLock && (missingPrices > 0 || lineItems.length === 0);
  const label = fromHistoricalLock ? "Original Contract Total" : incomplete ? "Pricing incomplete" : "Contract Total";

  return (
    <aside
      className="fixed bottom-3 right-3 z-50 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-right shadow-[0_12px_32px_rgba(15,35,70,0.18)] backdrop-blur"
      aria-live="polite"
      aria-label={`${label}${incomplete ? "" : ` ${formatCurrency(total)}`}`}
    >
      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>
      <div className="text-base font-black leading-tight text-slate-950 tabular-nums">
        {incomplete ? "Total unavailable" : formatCurrency(total)}
      </div>
      {incomplete && <p className="mt-1 text-xs font-semibold text-amber-800">
        {missingPrices ? `${missingPrices} ${missingPrices === 1 ? "window needs" : "windows need"} pricing` : "Add a window to price this quote"}
      </p>}
    </aside>
  );
}
