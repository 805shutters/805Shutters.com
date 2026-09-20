"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { OperationsItem, ProductProgress } from "@/lib/crm/operations-overview";
import { losAngelesDateString } from "@/lib/booking/availability";
import type { WorkflowAction } from "./OperationsOverview";
import styles from "./OperationsOverview.module.css";

export function ProductShipmentEditor({ item, product, onSave, onClose }: { item: OperationsItem; product: ProductProgress; onSave: WorkflowAction; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const existing = product.shipments?.[0];
  const [date, setDate] = useState(existing?.shippedOn || "");
  const [reference, setReference] = useState(existing?.orderReference || "");
  const [messageId, setMessageId] = useState(existing?.messageId || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setSaving(true); setError("");
    try {
      await onSave(item, "shipped", product, undefined, { shippedOn: date, mailbox: "805@805shutters.com", messageId: messageId.trim(), orderReference: reference.trim() });
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Shipment could not be saved."); }
    finally { lock.current = false; setSaving(false); }
  }
  return <dialog ref={dialog} className={styles.invoiceDialog} aria-labelledby="shipment-title" onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}>
    <form onSubmit={save}><small>SHIPPED · SHIPPING CONFIRMATION</small><h2 id="shipment-title">{product.name}</h2><p>{product.manufacturer || "Manufacturer not recorded"} · {item.source.customerName}</p>
      <p>Use the actual shipment notice in 805@805shutters.com. Confirm the order reference matches every selected product. Estimated dates and shipping labels do not confirm dispatch.</p>
      <label>Confirmed ship date<input autoFocus required type="date" max={losAngelesDateString(new Date())} value={date} disabled={saving} onChange={event => setDate(event.target.value)} /></label>
      <label>Manufacturer order reference<input required maxLength={150} value={reference} disabled={saving} onChange={event => setReference(event.target.value)} /></label>
      <label>Gmail message ID<input required minLength={8} maxLength={200} pattern="[a-zA-Z0-9_\-]+" value={messageId} disabled={saving} onChange={event => setMessageId(event.target.value)} /></label>
      <label className={styles.invoiceCheckbox}><input required type="checkbox" disabled={saving} />The notice confirms shipment of all {product.records.length} selected product records.</label>
      {error && <p role="alert">{error}</p>}<div className={styles.invoiceActions}><button type="button" disabled={saving} onClick={onClose}>Cancel</button><button type="submit" disabled={saving}>{saving ? "Saving…" : "Save & mark shipped"}</button></div>
    </form>
  </dialog>;
}
