export const SOLD_QUOTE_NOTIFICATION_RECIPIENTS = ["805-298-5555", "805-630-0848", "805-914-4917"] as const;

interface SoldQuoteSmsInput {
  account_id?: string | null;
  customer_name: string | null;
  total_amount: number | null;
  deposit_paid: number | null;
  share_token?: string | null;
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

export function build805SoldQuoteSmsMessage(
  quote: SoldQuoteSmsInput,
  contractUrl = buildContractUrl(quote.share_token)
): string {
  const customerName = quote.customer_name?.trim() || "Unknown customer";
  const lines = [
    `Customer Name: ${customerName}`,
    `Total Sale Amount: ${money(Number(quote.total_amount) || 0)}`,
    `Deposit Amount: ${money(soldDepositAmount(quote))}`,
  ];
  if (contractUrl) lines.push(`Contract PDF: ${contractUrl}`);
  return lines.join("\n");
}

export async function send805SoldQuoteNotification({
  supabaseClient: _supabaseClient,
  quoteId: _quoteId,
}: Send805SoldQuoteNotificationArgs): Promise<void> {
  return;
}
