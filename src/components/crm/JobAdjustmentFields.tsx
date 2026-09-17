"use client";
import { useState } from "react";
import { previewJobAdjustment, type JobAdjustmentKind } from "@/lib/crm/job-adjustment";
import styles from "./JobTrackingWorkspace.module.css";

const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });
export function JobAdjustmentFields({ balance }: { balance: number | null }) {
  const [kind, setKind] = useState<JobAdjustmentKind>("charge");
  const [amount, setAmount] = useState("");
  let next: number | null = null;
  let error = "";
  if (amount) {
    try { next = previewJobAdjustment(balance, amount, kind).balance; }
    catch (cause) { error = cause instanceof Error ? cause.message : "Check the amount."; }
  }
  return <>
    <label>Adjustment type<select name="adjustment_kind" value={kind} onChange={event => setKind(event.target.value as JobAdjustmentKind)}><option value="charge">Add charge</option><option value="credit">Give credit / discount</option></select></label>
    <label>Adjustment amount ($)<input name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" required value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" /></label>
    <label>Note<textarea name="note" required rows={3} placeholder="e.g. Extension pole added, or courtesy discount" /></label>
    <div className={styles.confirmBox} aria-live="polite"><span>Current balance · {balance === null ? "Not recorded" : money(balance)}</span><strong>{next === null ? "Enter an amount" : money(next)}</strong><p>New outstanding balance</p></div>
    {error && <p role="status" className={styles.error}>{error}</p>}
    <p>The adjustment is saved to the payment ledger with your note. The original contract stays on file. New payment requests use the updated amount; saving does not charge, refund, or email the customer.</p>
  </>;
}
