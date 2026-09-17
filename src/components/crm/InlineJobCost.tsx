"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import type { JobTrackingSavePatch, JobTrackingViewItem } from "@/lib/crm/job-tracking-view";
import { currency } from "@/lib/crm/operations-overview";
import styles from "./OperationsOverview.module.css";

export type SaveJobCost = (item: JobTrackingViewItem, patch: JobTrackingSavePatch) => Promise<boolean>;

export function InlineJobCost({ item, busy, onSave }: { item: JobTrackingViewItem; busy: boolean; onSave: SaveJobCost }) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canEdit = Boolean(item.row || (item.quote && item.isSale));
  const disabled = busy || saving;
  function close() { setEditing(false); setError(""); button.current?.focus(); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || disabled || !canEdit) return;
    const value = Number(amount);
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount.trim()) || !Number.isFinite(value) || value < 0) {
      setError("Enter a cost of zero or more, with up to two decimal places."); return;
    }
    submitting.current = true; setSaving(true); setError(""); setNotice("");
    try {
      const fields = { [item.row && item.row.source !== "crm_quote" ? "cogs_amount" : "materials_cost"]: value };
      const ok = await onSave(item, { ...(item.row ? { row: fields } : { quote: fields }), message: `Cost of goods saved for ${item.customerName}.` });
      if (!ok) throw new Error("Cost could not be saved. Your entry is still here; try again.");
      setEditing(false); setNotice("Saved");
      requestAnimationFrame(() => button.current?.focus());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Cost could not be saved. Please try again."); }
    finally { submitting.current = false; setSaving(false); }
  }
  return <div className={styles.costCell}>
    <button ref={button} type="button" className={styles.costButton} disabled={disabled || !canEdit} aria-label={`Edit cost of goods for ${item.customerName}`} aria-expanded={editing} aria-controls={id} title={canEdit ? "Enter the total material / vendor cost" : "A sold quote or bookkeeping sale is required."} onClick={() => {
      if (editing) close(); else { setAmount(item.cogs === null ? "" : item.cogs.toFixed(2)); setError(""); setNotice(""); setEditing(true); }
    }}><Pencil size={13} aria-hidden="true" />{item.cogs === null || item.cogs === 0 ? "Enter cost" : "Edit cost"}</button>
    <small aria-label={`Cost of goods for ${item.customerName}`}>{item.cogs === null ? "Unavailable" : currency(item.cogs)}</small>
    {editing && <form id={id} className={styles.costForm} onSubmit={save} aria-label={`Cost of goods for ${item.customerName}`}>
      <label htmlFor={`${id}-amount`}>Total cost ($)</label>
      <input id={`${id}-amount`} autoFocus type="number" inputMode="decimal" min="0" step="0.01" required value={amount} disabled={disabled} onChange={event => setAmount(event.target.value)} />
      <div><button type="submit" disabled={disabled}>{saving ? "Saving…" : "Save"}</button><button type="button" disabled={disabled} onClick={close}>Cancel</button></div>
      {error && <p role="alert">{error}</p>}
    </form>}
    {notice && <small role="status">{notice}</small>}
  </div>;
}
