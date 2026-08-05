import { formatPaymentType } from "@/lib/crm/bookkeeping";
import type { CrmBookkeepingRow } from "@/lib/crm/types";

export type RecentFinancialActivity = {
  id: string;
  date: string;
  paymentType: string;
  payerCustomer: string;
  customerName: string;
  amount: number;
  sourceReference: string | null;
};

function metaText(meta: Record<string, unknown> | null | undefined, ...keys: string[]) {
  for (const key of keys) {
    const value = meta?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function paymentTypeLabel(type: string, externalSource: string | null | undefined) {
  return externalSource?.startsWith("square") ? "Square" : formatPaymentType(type as never);
}

export function buildRecentFinancialActivity(rows: CrmBookkeepingRow[]): RecentFinancialActivity[] {
  return rows
    .flatMap((row) =>
      row.payments.map((payment) => ({
        id: payment.id,
        date: payment.paid_at || payment.created_at,
        paymentType: paymentTypeLabel(payment.payment_type, payment.external_source),
        payerCustomer:
          metaText(payment.meta, "payer_name", "square_customer_name", "customer_name") ||
          row.customerName,
        customerName: row.customerName,
        amount: Number(payment.amount) || 0,
        sourceReference:
          payment.external_source && payment.external_id
            ? `${payment.external_source} · ${payment.external_id}`
            : payment.external_id || payment.external_source || null,
      })),
    )
    .sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
}
