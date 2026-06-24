import { ACCOUNT_IDS } from "@mts/lib/accounts";

export const SOLD_QUOTE_NOTIFICATION_RECIPIENTS = ["805-630-0848", "805-298-5555"] as const;

interface SoldQuoteSmsInput {
  account_id?: string | null;
  customer_name: string | null;
  total_amount: number | null;
  deposit_paid: number | null;
  share_token?: string | null;
}

interface SalesQuoteQuery {
  select: (columns: string) => {
    eq: (
      column: string,
      value: string
    ) => {
      single: () => Promise<{ data: SoldQuoteSmsInput | null; error: Error | null }>;
    };
  };
}

interface Send805SoldQuoteNotificationArgs {
  supabaseClient: {
    from: (table: "sales_quotes") => SalesQuoteQuery;
    functions: {
      invoke: (functionName: string, args: { body: Record<string, unknown> }) => Promise<unknown>;
    };
  };
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
      : "https://mtsinstallationsandrepairs.com";
  return `${origin.replace(/\/+$/, "")}/quote/${encodeURIComponent(token)}`;
}

export function build805SoldQuoteSmsMessage(
  quote: SoldQuoteSmsInput,
  contractUrl = buildContractUrl(quote.share_token)
): string {
  const customerName = quote.customer_name?.trim() || "Unknown customer";
  const lines = [
    `Customer Name: ${customerName}`,
    `Total Sale: ${money(Number(quote.total_amount) || 0)}`,
    `Deposit Made: ${money(soldDepositAmount(quote))}`,
  ];
  if (contractUrl) lines.push(`Contract PDF: ${contractUrl}`);
  return lines.join("\n");
}

export async function send805SoldQuoteNotification({
  supabaseClient,
  quoteId,
}: Send805SoldQuoteNotificationArgs): Promise<void> {
  const { data, error } = await supabaseClient
    .from("sales_quotes")
    .select("account_id, customer_name, total_amount, deposit_paid, share_token")
    .eq("id", quoteId)
    .single();

  if (error) throw error;
  if (!data || data.account_id !== ACCOUNT_IDS.SHUTTERS_805) return;

  const message = build805SoldQuoteSmsMessage(data);
  const failures: string[] = [];

  for (const to of SOLD_QUOTE_NOTIFICATION_RECIPIENTS) {
    try {
      const result = await supabaseClient.functions.invoke("send-sms", {
        body: {
          to,
          message,
          skip_hours_check: true,
        },
      });

      const invokeError = (result as { error?: Error | null } | null)?.error;
      if (invokeError) throw invokeError;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      failures.push(`${to}: ${detail}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Sold SMS failed for ${failures.length} recipient(s): ${failures.join("; ")}`);
  }
}
