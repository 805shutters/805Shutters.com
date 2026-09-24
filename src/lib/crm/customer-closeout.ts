import type { SupabaseClient } from "@supabase/supabase-js";
import { objectMeta } from "@/lib/crm/measure-needed-state";

type CrmSupabaseClient = SupabaseClient;
type CrmActor = { email: string; userId?: string };
type MoneyRow = { amount?: number | string | null };

export const CUSTOMER_CLOSEOUT_META_KEY = "customer_closeout_email";

export type CustomerCloseoutMeta = {
  status?: "sent" | "failed";
  sent_at?: string | null;
  attempted_at?: string | null;
  recipient?: string | null;
  email_id?: string | null;
  error?: string | null;
  source?: string | null;
};

export type CustomerCloseoutResult = {
  status: "sent" | "already_sent" | "not_paid" | "skipped" | "error";
  message?: string;
};

type CloseoutEmailInput = {
  customerName: string;
  quoteNumber?: string | null;
  total: number;
  paidOn?: string | null;
};

function roundMoney(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function money(value: unknown) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(roundMoney(value));
}

function shortDate(value: string | null | undefined) {
  if (!value) return new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" });
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function customerCloseoutMeta(meta: unknown): CustomerCloseoutMeta {
  return objectMeta(objectMeta(meta)[CUSTOMER_CLOSEOUT_META_KEY]) as CustomerCloseoutMeta;
}

export function remainingQuoteBalance(input: {
  total: unknown;
  payments: MoneyRow[];
  creditsIn?: MoneyRow[];
  creditsOut?: MoneyRow[];
}) {
  const sum = (rows: MoneyRow[]) => rows.reduce((total, row) => total + roundMoney(row.amount), 0);
  return roundMoney(roundMoney(input.total) - sum(input.payments) - sum(input.creditsIn || []) + sum(input.creditsOut || []));
}

export function buildCustomerCloseoutEmail(input: CloseoutEmailInput) {
  const firstName = input.customerName.trim().split(/\s+/)[0] || "there";
  const order = input.quoteNumber || "your 805 Shutters order";
  const amount = money(input.total);
  const paidOn = shortDate(input.paidOn);
  const subject = `Thank you - ${order} is paid in full`;
  const text = `Hello ${firstName},\n\nThank you so much for your order with 805 Shutters. We have received your final payment and your balance is now paid in full.\n\nReceipt\nOrder: ${order}\nOrder total: ${amount}\nPaid in full: ${paidOn}\nBalance remaining: $0.00\n\nWarranty information\nYour window treatments remain covered by the applicable manufacturer warranty. Installation workmanship is covered by 805 Shutters for 12 months from installation. If you need warranty service, contact us at 805-806-9344 or 805@805shutters.com and include your order number.\n\nYour paid-in-full receipt is attached for your records.\n\nThank you,\n805 Shutters\n805-806-9344\n805shutters.com`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:640px;margin:auto;padding:28px 18px">
    <div style="border-bottom:2px solid #111;padding-bottom:16px"><div style="font-size:18px;font-weight:700;letter-spacing:.06em">805 SHUTTERS</div><h1 style="font-size:26px;margin:14px 0 0">Thank you for your order</h1></div>
    <p style="font-size:15px;line-height:1.6">Hello ${escapeHtml(firstName)},</p>
    <p style="font-size:15px;line-height:1.6">Thank you so much for your order with 805 Shutters. We received your final payment and your balance is now <strong>paid in full</strong>.</p>
    <div style="border:2px solid #111;padding:16px;margin:22px 0"><div style="font-size:12px;text-transform:uppercase;letter-spacing:.1em;font-weight:700">Receipt</div><table style="width:100%;margin-top:10px;font-size:14px"><tr><td>Order</td><td style="text-align:right;font-weight:700">${escapeHtml(order)}</td></tr><tr><td>Order total</td><td style="text-align:right;font-weight:700">${amount}</td></tr><tr><td>Paid in full</td><td style="text-align:right">${escapeHtml(paidOn)}</td></tr><tr><td>Balance remaining</td><td style="text-align:right;font-weight:700">$0.00</td></tr></table></div>
    <h2 style="font-size:19px">Warranty information</h2>
    <p style="font-size:14px;line-height:1.6">Your window treatments remain covered by the applicable manufacturer warranty. Installation workmanship is covered by 805 Shutters for 12 months from installation. For warranty service, call <a href="tel:+18058069344">805-806-9344</a> or email <a href="mailto:805@805shutters.com">805@805shutters.com</a> and include your order number.</p>
    <p style="font-size:14px;line-height:1.6">Your paid-in-full receipt is attached for your records.</p>
    <div style="border-top:1px solid #ccc;padding-top:16px;margin-top:24px;font-size:13px;line-height:1.6">Thank you,<br><strong>805 Shutters</strong><br>805-806-9344 &middot; <a href="https://www.805shutters.com">805shutters.com</a></div>
  </div>`;
  return { subject, text, html };
}

function pdfEscape(value: unknown) {
  return String(value ?? "").replace(/[^\x20-\x7E]/g, " ").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** A small dependency-free PDF receipt suitable for attaching to transactional email. */
export function buildCustomerReceiptPdf(input: CloseoutEmailInput) {
  const lines = [
    ["805 Shutters", 54, 730, 14, "F2"],
    ["PAID-IN-FULL RECEIPT", 54, 690, 22, "F2"],
    [`Customer: ${input.customerName}`, 54, 640, 11, "F1"],
    [`Order: ${input.quoteNumber || "805 Shutters order"}`, 54, 616, 11, "F1"],
    [`Paid in full: ${shortDate(input.paidOn)}`, 54, 592, 11, "F1"],
    [`Order total: ${money(input.total)}`, 54, 552, 14, "F2"],
    ["Balance remaining: $0.00", 54, 526, 14, "F2"],
    ["Thank you for choosing 805 Shutters.", 54, 470, 11, "F1"],
    ["805-806-9344  |  805shutters.com  |  805@805shutters.com", 54, 62, 9, "F1"]
  ] as const;
  const stream = lines.map(([text, x, y, size, font]) => `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfEscape(text)}) Tj ET`).join("\n");
  const objects = [
    "",
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [5 0 R] /Count 1 >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents 6 0 R >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = Buffer.byteLength(pdf, "latin1");
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

/** Compatibility hook for existing payment callers. The database transition queues
 * the receipt atomically; this hook must never send or backfill a historical job. */
export async function maybeSendCustomerCloseoutForQuote(
  _supabase: CrmSupabaseClient,
  _quoteId: string,
  _actor: CrmActor,
  _source = "crm_payment",
  _recipientOverride?: string | null
): Promise<CustomerCloseoutResult> {
  return { status: "skipped", message: "New paid-in-full receipts are handled by the durable customer email queue." };
}
