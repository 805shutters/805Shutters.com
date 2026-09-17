export type JobAdjustmentKind = "credit" | "charge";

/** Work in cents so the preview and the saved balance have identical rounding. */
export function previewJobAdjustment(balance: number | null, amountText: string, kind: JobAdjustmentKind) {
  if (balance === null || !Number.isFinite(balance) || balance < 0) throw new Error("Review the current balance before adding an adjustment.");
  if (!/^\d+(\.\d{1,2})?$/.test(amountText.trim())) throw new Error("Enter a positive amount with up to two decimal places.");
  const cents = Math.round(Number(amountText) * 100);
  const current = Math.round(balance * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0 || !Number.isSafeInteger(current)) throw new Error("Enter a valid positive amount.");
  const next = current + (kind === "credit" ? -cents : cents);
  if (!Number.isSafeInteger(next)) throw new Error("The amount is too large.");
  if (next < 0) throw new Error("This credit exceeds the outstanding balance. A refund must be handled separately.");
  return { amount: cents / 100, balance: next / 100 };
}

export function jobAdjustmentFields(balance: number | null, amountText: string, kind: JobAdjustmentKind, note: string) {
  if (!note.trim()) throw new Error("Add a note explaining the credit or added charge.");
  const preview = previewJobAdjustment(balance, amountText, kind);
  return { balance_due_target: preview.balance, balance_adjustment_note: `${kind === "credit" ? "Credit" : "Added charge"}: ${note.trim()}` };
}
