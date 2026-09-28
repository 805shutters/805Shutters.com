import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

export function parseLineItemPrice(value: string): number | null {
  const text = value.trim().replace(/^\$\s*/, "");
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)?(?:\.\d{1,2})?$/.test(text) || !text) return null;
  const price = Number(text.replaceAll(",", ""));
  return Number.isFinite(price) && price >= 0 ? Math.round((price + Number.EPSILON) * 100) / 100 : null;
}

export type LineItemPriceInputHandle = { save: () => Promise<boolean> };

/** Keep the draft intact while typing; persist only on Save, blur, or Enter. */
export function LineItemPriceInput({ value, roomName, onSave, onDirtyChange, label = "Price each", ref }: {
  ref?: Ref<LineItemPriceInputHandle>;
  value: number | null;
  roomName: string;
  onSave: (price: number) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  label?: string;
}) {
  const formattedValue = value == null ? "" : value.toFixed(2);
  const [draft, setDraft] = useState(formattedValue);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const editing = useRef(false);
  const pending = useRef<Promise<boolean> | null>(null);
  const changed = useRef(false);
  useEffect(() => {
    if (!editing.current && !pending.current && !changed.current) {
      setDraft(formattedValue);
      setSaved(false);
    }
  }, [formattedValue]);
  const save = (): Promise<boolean> => {
    editing.current = false;
    if (pending.current) return pending.current;
    const price = parseLineItemPrice(draft);
    if (price === null) {
      setError("Enter a price of $0 or more, with up to two decimal places.");
      return Promise.resolve(false);
    }
    if (!changed.current && !error) return Promise.resolve(true);
    setDraft(price.toFixed(2));
    setSaving(true);
    setSaved(false);
    setError("");
    // Continue may be clicked while blur is already saving this field. Share
    // the same promise so delivery waits for that write and cannot duplicate it.
    pending.current = Promise.resolve().then(() => onSave(price)).then(() => {
      changed.current = false;
      onDirtyChange?.(false);
      setSaved(true);
      return true;
    }).catch((cause: unknown) => {
      editing.current = true;
      setError(cause instanceof Error ? cause.message : "Price could not be saved. Try again.");
      return false;
    }).finally(() => {
      pending.current = null;
      setSaving(false);
    });
    return pending.current;
  };
  useImperativeHandle(ref, () => ({ save }));
  return <div className="quote-line-price-editor">
    <label>
      <span>{label}</span>
      <div className="quote-line-price-input-wrap"><span aria-hidden="true">$</span>
        <input aria-label={`${label} for ${roomName}`} type="text" inputMode="decimal"
          value={draft} disabled={saving} aria-invalid={Boolean(error)}
          onFocus={() => { editing.current = true; }}
          onChange={event => { changed.current = true; onDirtyChange?.(true); setDraft(event.target.value); setError(""); setSaved(false); }}
          onBlur={() => { if (changed.current || error) void save(); }}
          onKeyDown={event => {
            if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
            if (event.key === "Escape") {
              editing.current = false; changed.current = false;
              onDirtyChange?.(false);
              setDraft(formattedValue); setError(""); setSaved(false);
              event.preventDefault();
            }
          }} />
      </div>
    </label>
    <button type="button" disabled={saving} aria-label={`Save price for ${roomName}`}
      className="mt-1 rounded border border-slate-300 bg-white px-3 py-1 text-xs font-semibold disabled:opacity-50"
      onMouseDown={event => event.preventDefault()} onClick={() => { if (changed.current || error) void save(); }}>
      {saving ? "Saving…" : "Save price"}
    </button>
    {saved && <span role="status" className="block text-xs text-emerald-700">Price saved</span>}
    {error && <span role="alert">{error}</span>}
  </div>;
}
