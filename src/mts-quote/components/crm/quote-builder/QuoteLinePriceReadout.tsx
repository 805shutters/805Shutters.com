import { useId, useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { AutomaticPricingNotice } from "./AutomaticPricingNotice";
import { LineItemPriceInput } from "./LineItemPriceInput";

const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** A compact summary with an explicit-save drawer; failed calculations stay unpriced. */
export function QuoteLinePriceReadout({ unitPrice, lineTotal, issue, roomName, manualPrice, onSave,
  leadingContent, controls, actions, notPriced = false }: {
  unitPrice: number;
  lineTotal: number;
  issue: string | null;
  roomName: string;
  manualPrice: number | null;
  onSave: (price: number) => Promise<void>;
  leadingContent?: ReactNode;
  controls?: ReactNode;
  actions?: ReactNode;
  notPriced?: boolean;
}) {
  const [editing, setEditing] = useState(Boolean(issue));
  const [saved, setSaved] = useState(false);
  const editorId = useId();
  // Unpriced lines retain direct custom entry; saved manual lines start compact.
  const showEditor = editing;
  return <div className="quote-line-price-panel">
    <div className="quote-line-price-summary-row">
      {leadingContent}
      <div className="quote-line-price-unit" aria-label={`Price for ${roomName}`}>
        {notPriced ? <p className="text-lg font-bold text-amber-900">Not priced</p> : issue ?
          <AutomaticPricingNotice issue={issue} /> : <>
            <span className="quote-line-price-caption">{manualPrice !== null ? "Custom price" : "Price"}</span>
            <strong className="quote-line-price-amount">{money(unitPrice)} <span>each</span></strong>
          </>}
        {!notPriced && (!issue || !showEditor) && <button type="button" className="quote-line-price-edit"
          aria-label={`${issue ? "Set custom price" : "Edit price"} for ${roomName}`} aria-expanded={showEditor} aria-controls={editorId}
          disabled={showEditor} onClick={() => { setSaved(false); setEditing(true); }}>
          {issue ? "Set custom price" : "Edit price"} <Pencil aria-hidden="true" size={12} />
        </button>}
      </div>
      {controls}
      {!issue && !notPriced && <div className="quote-line-price-total">
        <span className="quote-line-price-caption">Line total</span>
        <strong className="quote-line-price-amount">{money(lineTotal)}</strong>
        <span className="quote-line-price-caption">Excl. tax</span>
      </div>}
      {actions && <div className="quote-line-price-actions">{actions}</div>}
    </div>
    {!notPriced && showEditor && <div id={editorId} className="quote-line-price-drawer">
      <LineItemPriceInput value={manualPrice} roomName={roomName} onSave={onSave}
        label="Custom merchandise price each" saveOnBlur={false}
        onSaved={() => { setEditing(false); setSaved(true); }}
        onCancel={() => setEditing(false)} />
      <p className="quote-line-price-note">Installation and shipping are added separately when applicable.</p>
    </div>}
    {saved && <span role="status" className="quote-line-price-saved">Price saved</span>}
  </div>;
}
