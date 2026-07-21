export const SOLD_QUOTE_NOTIFICATION_RECIPIENTS = ["805-298-5555", "805-630-0848", "805-914-4917"] as const;
export const SOLD_QUOTE_CONTACT_NOTIFICATION_RECIPIENT = "805-298-5555" as const;

interface SoldQuoteSmsInput {
  account_id?: string | null;
  customer_name: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  total_amount: number | null;
  deposit_paid: number | null;
  share_token?: string | null;
  technical_measure?: "needed" | "not_needed" | null;
}

interface Send805SoldQuoteNotificationArgs {
  supabaseClient: unknown;
  quoteId: string;
}

function money(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function soldDepositAmount(quote: SoldQuoteSmsInput): number {
  const depositPaid = Number(quote.deposit_paid) || 0;
  if (depositPaid > 0) return depositPaid;
  return (Number(quote.total_amount) || 0) * 0.5;
}

function buildContractUrl(shareToken?: string | null): string | null {
  const token = shareToken?.trim();
  if (!token) return null;
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://805shutters.com";
  return `${origin.replace(/\/+$/, "")}/quote/${encodeURIComponent(token)}`;
}

function optionalSmsLine(label: string, value?: string | null): string | null {
  const text = value?.trim();
  return text ? `${label}: ${text}` : null;
}

function technicalMeasureSmsLine(value?: SoldQuoteSmsInput["technical_measure"]): string {
  return `Technical Measure: ${value === "needed" ? "Needed" : "Not Needed"}`;
}

export function build805SoldQuoteSmsMessage(
  quote: SoldQuoteSmsInput,
  contractUrl = buildContractUrl(quote.share_token),
  includeCustomerContact = false
): string {
  const customerName = quote.customer_name?.trim() || "Unknown customer";
  const lines = [
    `Customer Name: ${customerName}`,
    `Total Sale Amount: ${money(Number(quote.total_amount) || 0)}`,
    `Deposit Amount: ${money(soldDepositAmount(quote))}`,
    technicalMeasureSmsLine(quote.technical_measure),
    includeCustomerContact ? optionalSmsLine("Customer Phone", quote.customer_phone) : null,
    includeCustomerContact ? optionalSmsLine("Customer Address", quote.customer_address) : null,
  ].filter((line): line is string => Boolean(line));
  if (contractUrl) lines.push(`Contract PDF: ${contractUrl}`);
  return lines.join("\n");
}

export function build805SoldQuoteSmsMessageForRecipient(
  recipient: string,
  quote: SoldQuoteSmsInput,
  contractUrl = buildContractUrl(quote.share_token)
): string {
  return build805SoldQuoteSmsMessage(
    quote,
    contractUrl,
    recipient === SOLD_QUOTE_CONTACT_NOTIFICATION_RECIPIENT,
  );
}

export async function send805SoldQuoteNotification({
  supabaseClient: _supabaseClient,
  quoteId: _quoteId,
}: Send805SoldQuoteNotificationArgs): Promise<void> {
  return;
}
