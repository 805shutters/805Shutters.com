import { useEffect, useRef, useState } from "react";

/** Commit one complete price on blur/Enter; never save intermediate keystrokes. */
export function LineItemPriceInput({ value, roomName, onSave }: {
  value: number;
  roomName: string;
  onSave: (price: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value.toFixed(2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const editing = useRef(false);
  const pending = useRef(false);
  const changed = useRef(false);
  useEffect(() => {
    if (!editing.current && !pending.current) setDraft(value.toFixed(2));
  }, [value]);
  const save = async () => {
    editing.current = false;
    if (pending.current) return;
    const price = Number(draft);
    if (!draft.trim() || !Number.isFinite(price) || price < 0) {
      setError("Enter a price of $0 or more.");
      return;
    }
    const rounded = Math.round((price + Number.EPSILON) * 100) / 100;
    setDraft(rounded.toFixed(2));
    if (rounded === value && !changed.current && !error) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try { await onSave(rounded); changed.current = false; }
    catch (cause) {
      editing.current = true;
      setError(cause instanceof Error ? cause.message : "Price could not be saved. Try again.");
    } finally { pending.current = false; setSaving(false); }
  };
  return <div className="quote-line-price-editor">
    <label>
      <span>Price each</span>
      <div className="quote-line-price-input-wrap"><span aria-hidden="true">$</span>
        <input aria-label={`Price each for ${roomName}`} type="number" inputMode="decimal"
          step="0.01" min="0" value={draft} disabled={saving}
          aria-invalid={Boolean(error)}
          onFocus={() => { editing.current = true; }}
          onChange={event => { changed.current = true; setDraft(event.target.value); setError(""); }}
          onBlur={() => { void save(); }}
          onKeyDown={event => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              editing.current = false; changed.current = false;
              setDraft(value.toFixed(2)); setError("");
              // Do not blur: the blur handler would still see the cancelled draft.
              event.preventDefault();
            }
          }} />
      </div>
    </label>
    {saving && <span role="status">Saving…</span>}
    {error && <span role="alert">{error}</span>}
  </div>;
}
