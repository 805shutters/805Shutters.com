export type CustomerEmailRecord = {
  id: string; kind: "signed_contract" | "paid_in_full"; status: string; recipient: string;
  created_at: string; provider_accepted_at: string | null; delivery_status: string | null;
  delivery_checked_at: string | null; delivery_error: string | null; last_error: string | null;
};
export function customerEmailStatus(row: Pick<CustomerEmailRecord, "status" | "delivery_status" | "delivery_error">) {
  if (["bounced", "failed", "suppressed", "complained"].includes(row.delivery_status || "")) return "Delivery failed — needs attention";
  if (["delivered", "opened", "clicked"].includes(row.delivery_status || "")) return "Delivered";
  if (row.delivery_error) return "Delivery check needs attention";
  if (row.status === "accepted") return row.delivery_status === "delivery_delayed" ? "Delivery delayed" : "Provider accepted — delivery unconfirmed";
  if (row.status === "pending") return "Queued";
  if (row.status === "processing") return "Sending";
  if (row.status === "retry") return "Retry scheduled";
  return "Needs attention";
}
