import { SupabaseClient } from "@supabase/supabase-js";
import { CrmQuote } from "@/lib/crm/types";
import { sendCrmSms } from "@/lib/crm/sms";

type BookkeepingAlertDelivery = {
  channel: "sms";
  target: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
};

export type BookkeepingAlertResult = {
  type: "sold_quote" | "invoice_note";
  message: string;
  deliveries: BookkeepingAlertDelivery[];
  smsSent: number;
  smsSkipped: number;
  skipped: boolean;
  reason?: string;
};

const defaultSoldQuoteRecipients = ["805-630-0848", "805-298-5555"];
const defaultInvoiceNoteRecipients = ["805-630-0848"];

function parseList(value: string | undefined) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeNote(note?: string | null) {
  return note?.trim() || "";
}

function money(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2
  });
}

function soldQuoteRecipients() {
  const configured = parseList(process.env.CRM_SOLD_QUOTE_SMS_NUMBERS);
  return configured.length ? configured : defaultSoldQuoteRecipients;
}

function invoiceNoteRecipients() {
  const configured = parseList(
    process.env.CRM_BOOKKEEPING_NOTE_SMS_NUMBERS || process.env.CRM_BOOKKEEPING_NOTE_SMS_NUMBER
  );
  return configured.length ? configured : defaultInvoiceNoteRecipients;
}

async function sendAlert(type: BookkeepingAlertResult["type"], message: string, recipients: string[]) {
  const deliveries: BookkeepingAlertDelivery[] = [];

  for (const recipient of recipients) {
    try {
      const result = await sendCrmSms(recipient, message);
      deliveries.push({
        channel: "sms",
        target: recipient,
        ok: result.ok,
        skipped: result.skipped,
        error: result.error
      });
    } catch (error) {
      deliveries.push({
        channel: "sms",
        target: recipient,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    type,
    message,
    deliveries,
    smsSent: deliveries.filter((item) => item.ok).length,
    smsSkipped: deliveries.filter((item) => item.skipped).length,
    skipped: false
  };
}

function skippedAlert(type: BookkeepingAlertResult["type"], reason: string): BookkeepingAlertResult {
  return {
    type,
    message: "",
    deliveries: [],
    smsSent: 0,
    smsSkipped: 0,
    skipped: true,
    reason
  };
}

async function resolveQuoteCustomerName(
  supabase: SupabaseClient,
  quote: CrmQuote,
  fallbackCustomerName?: string | null
) {
  if (fallbackCustomerName?.trim()) return fallbackCustomerName.trim();
  if (quote.customer_name?.trim()) return quote.customer_name.trim();
  if (!quote.job_id) return "Unknown customer";

  const { data } = await supabase
    .from("crm_jobs")
    .select("customer_name")
    .eq("id", quote.job_id)
    .maybeSingle();

  const jobName = typeof data?.customer_name === "string" ? data.customer_name.trim() : "";
  return jobName || "Unknown customer";
}

export function build805SoldQuoteSmsMessage({
  customerName,
  totalAmount,
  depositPaid,
  contractUrl
}: {
  customerName: string | null;
  totalAmount: number;
  depositPaid: number;
  contractUrl?: string | null;
}) {
  const customer = customerName?.trim() || "Unknown customer";
  const deposit = depositPaid > 0 ? depositPaid : totalAmount * 0.5;
  const lines = [
    `Customer Name: ${customer}`,
    `Total Sale: ${money(totalAmount)}`,
    `Deposit Made: ${money(deposit)}`
  ];

  if (contractUrl?.trim()) lines.push(`Contract PDF: ${contractUrl.trim()}`);
  return lines.join("\n");
}

export async function dispatch805SoldQuoteNotification(
  supabase: SupabaseClient,
  quote: CrmQuote,
  options: { customerName?: string | null; contractUrl?: string | null } = {}
): Promise<BookkeepingAlertResult> {
  if (quote.status !== "sold" && quote.status !== "approved") {
    return skippedAlert("sold_quote", "Quote is not sold.");
  }

  const customerName = await resolveQuoteCustomerName(supabase, quote, options.customerName);
  const totalAmount = Number(quote.quote_total) || 0;
  const depositPaid = Number(quote.deposit_required) || 0;
  const message = build805SoldQuoteSmsMessage({
    customerName,
    totalAmount,
    depositPaid,
    contractUrl: options.contractUrl
  });

  return sendAlert("sold_quote", message, soldQuoteRecipients());
}

export function build805InvoiceNoteSmsMessage({
  customerName,
  note
}: {
  customerName: string | null;
  note: string;
}) {
  const safeCustomerName = customerName?.trim() || "Unknown customer";
  return `Invoice Note (${safeCustomerName}): ${normalizeNote(note)}`;
}

export async function dispatch805InvoiceNoteNotification({
  customerName,
  note,
  previousNote
}: {
  customerName: string | null;
  note?: string | null;
  previousNote?: string | null;
}): Promise<BookkeepingAlertResult> {
  const normalizedNote = normalizeNote(note);
  const oldNote = normalizeNote(previousNote);

  if (!normalizedNote) return skippedAlert("invoice_note", "Note is blank.");
  if (normalizedNote === oldNote) return skippedAlert("invoice_note", "Note is unchanged.");

  const message = build805InvoiceNoteSmsMessage({
    customerName,
    note: normalizedNote
  });

  return sendAlert("invoice_note", message, invoiceNoteRecipients());
}
