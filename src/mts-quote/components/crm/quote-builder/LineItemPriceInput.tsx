import { useEffect, useRef, useState } from "react";

export function parseLineItemPrice(value: string): number | null {
  const text = value.trim().replace(/^\$\s*/, "");
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)?(?:\.\d{1,2})?$/.test(text) || !text) return null;
  const price = Number(text.replaceAll(",", ""));
  return Number.isFinite(price) && price >= 0 ? Math.round((price + Number.EPSILON) * 100) / 100 : null;
}

/** Keep the draft intact while typing; persist only on Save, blur, or Enter. */
export function LineItemPriceInput({ value, roomName, onSave }: {
  value: number;
  roomName: string;
  onSave: (price: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value.toFixed(2));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const editing = useRef(false);
  const pending = useRef(false);
  const changed = useRef(false);
  useEffect(() => {
    if (!editing.current && !pending.current) {
      setDraft(value.toFixed(2));
      setSaved(false);
    }
  }, [value]);
  const save = async () => {
    editing.current = false;
    if (pending.current || (!changed.current && !error)) return;
    const price = parseLineItemPrice(draft);
    if (price === null) {
      setError("Enter a price of $0 or more, with up to two decimal places.");
      return;
    }
    setDraft(price.toFixed(2));
    pending.current = true;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await onSave(price);
      changed.current = false;
      setSaved(true);
    } catch (cause) {
      editing.current = true;
      setError(cause instanceof Error ? cause.message : "Price could not be saved. Try again.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  return <div className="quote-line-price-editor">
    <label>
      <span>Price each</span>
      <div className="quote-line-price-input-wrap"><span aria-hidden="true">$</span>
        <input aria-label={`Price each for ${roomName}`} type="text" inputMode="decimal"
          value={draft} disabled={saving} aria-invalid={Boolean(error)}
          onFocus={() => { editing.current = true; }}
          onChange={event => { changed.current = true; setDraft(event.target.value); setError(""); setSaved(false); }}
          onBlur={() => { void save(); }}
          onKeyDown={event => {
            if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
            if (event.key === "Escape") {
              editing.current = false; changed.current = false;
              setDraft(value.toFixed(2)); setError(""); setSaved(false);
              event.preventDefault();
            }
          }} />
      </div>
    </label>
    <button type="button" disabled={saving} aria-label={`Save price for ${roomName}`}
      className="mt-1 rounded border border-slate-300 bg-white px-3 py-1 text-xs font-semibold disabled:opacity-50"
      onMouseDown={event => event.preventDefault()} onClick={() => { void save(); }}>
      {saving ? "Saving…" : "Save price"}
    </button>
    {saved && <span role="status" className="block text-xs text-emerald-700">Price saved</span>}
    {error && <span role="alert">{error}</span>}
  </div>;
}
