import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { formatDimensionsOrNull } from "@mts/types/quote";
import { formatCurrency, getQuoteDesignDetails } from "@mts/lib/quoteDesignDetails";
import { calculateLineItemDesignTotal } from "@mts/lib/quoteTotals";

/** Commercial document schedule. The residential contract keeps its current cards. */
export function CommercialQuoteSchedule({ items, designs, lineTotals, mode = "legacy" }: {
  items: SalesQuoteLineItem[];
  designs: SalesQuoteDesign[];
  lineTotals?: ReadonlyMap<string, number>;
  mode?: "legacy" | "authoritative_v2";
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-sm">
        <thead>
          <tr className="border-y border-slate-300 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <th className="px-3 py-3">Location</th>
            <th className="px-3 py-3">Specification</th>
            <th className="px-3 py-3 text-right">Qty</th>
            <th className="px-3 py-3 text-right">Unit</th>
            <th className="px-3 py-3 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const itemDesigns = designs.filter((design) => design.line_item_id === item.id);
            return (
              <tr key={item.id} className="border-b border-slate-200 align-top">
                <td className="px-3 py-4">
                  <strong>{item.room_name}</strong>
                  <div className="mt-1 text-xs text-slate-500">{formatDimensionsOrNull(item)}</div>
                </td>
                <td className="px-3 py-4">
                  <strong>{item.product_type}</strong>
                  {itemDesigns.map((design) => (
                    <div key={design.id} className="mt-2 text-xs text-slate-600">
                      {itemDesigns.length > 1 ? <p className="font-semibold">Option {design.variant || "A"}</p> : null}
                      {getQuoteDesignDetails(design).map((detail) => (
                        <div key={detail.label}>{detail.label}: {detail.value}</div>
                      ))}
                    </div>
                  ))}
                </td>
                <td className="px-3 py-4 text-right">{item.quantity}</td>
                <td className="whitespace-nowrap px-3 py-4 text-right">
                  {itemDesigns.length ? formatCurrency((lineTotals?.get(item.id) ?? calculateLineItemDesignTotal(item, itemDesigns, { mode })) / Math.max(1, item.quantity)) : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-right font-semibold">
                  {itemDesigns.length ? formatCurrency((lineTotals?.get(item.id) ?? calculateLineItemDesignTotal(item, itemDesigns, { mode }))) : "—"}
                </td>
              </tr>
            );
          })}
          {!items.length ? <tr><td colSpan={5} className="px-3 py-6 text-slate-500">No items in this quote yet.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}
