/** Money received covers the configured deposit first, regardless of receipt label
 * or tender. Preserve original receipts; this is the customer-file allocation. */
export function allocateReceivedMoney(paidTotal: number, depositRequired: number) {
  const cents = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100);
  const paid = cents(paidTotal), required = Math.max(0, cents(depositRequired));
  const deposit = Math.min(Math.max(paid, 0), required);
  return { depositPaid: deposit / 100, balancePaid: (paid - deposit) / 100, paidTotal: paid / 100 };
}
