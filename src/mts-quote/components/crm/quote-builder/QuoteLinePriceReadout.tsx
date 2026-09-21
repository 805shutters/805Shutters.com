import { LineItemPriceInput } from "./LineItemPriceInput";

const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** A failed calculation is not a zero-dollar price or a request for a manual override. */
export function QuoteLinePriceReadout({ unitPrice, lineTotal, issue, roomName, manualPrice, onSave }: {
  unitPrice: number;
  lineTotal: number;
  issue: string | null;
  roomName: string;
  manualPrice: number | null;
  onSave: (price: number) => Promise<void>;
}) {
  return <>
    {issue ? <div role="status" className="max-w-sm text-sm text-amber-900">
      <p className="font-bold">Price unavailable</p>
      <p>{issue}</p>
    </div> : <div aria-label={`Price for ${roomName}`}>
      <div className="text-lg font-bold tabular-nums">{money(unitPrice)} each</div>
      <div className="text-[11px] text-muted-foreground">{money(lineTotal)} line total · excl. tax</div>
    </div>}
    <details className="mt-1 text-xs">
      <summary className="cursor-pointer font-semibold">Set custom merchandise price</summary>
      <p className="my-1 text-muted-foreground">Installation and shipping are added separately when applicable.</p>
      <LineItemPriceInput value={manualPrice} roomName={roomName} onSave={onSave} label="Custom merchandise price each" />
    </details>
  </>;
}
