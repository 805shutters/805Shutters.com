import { useId, useState } from "react";
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
  const [editing, setEditing] = useState(false);
  const editorId = useId();
  const showEditor = editing || manualPrice !== null;
  return <>
    {issue ? <div role="status" className="max-w-sm text-sm text-amber-900">
      <p className="font-bold">Price unavailable</p>
      <p>{issue}</p>
    </div> : <div aria-label={`Price for ${roomName}`}>
      <div className="text-lg font-bold tabular-nums">{money(unitPrice)} each</div>
      <div className="text-[11px] text-muted-foreground">{money(lineTotal)} line total · excl. tax</div>
    </div>}
    {!showEditor && <button type="button"
      className="mt-1 rounded border border-slate-300 bg-white px-3 py-1 text-xs font-semibold"
      aria-label={`Edit price for ${roomName}`} aria-expanded={showEditor} aria-controls={editorId}
      onClick={() => setEditing(true)}>Edit price</button>}
    {showEditor && <div id={editorId} className="mt-1 text-xs">
      <LineItemPriceInput value={manualPrice} roomName={roomName} onSave={onSave} label="Custom merchandise price each" />
      <p className="my-1 max-w-48 text-muted-foreground">Installation and shipping are added separately when applicable.</p>
    </div>}
  </>;
}
