import type { QuoteBuilderDatabase } from "@mts/integrations/supabase/quoteBuilderDatabase";

export type QuoteV2DeliveryCapability = Readonly<{
  schemaVersion: 1;
  enabled: boolean;
  native: boolean;
  canSend: boolean;
  reserved: boolean;
}>;

export async function getQuoteV2DeliveryCapability(
  database: QuoteBuilderDatabase,
  quoteId: string,
  signal?: AbortSignal,
): Promise<QuoteV2DeliveryCapability> {
  const { data, error } = await database.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error("Your CRM session is unavailable. Sign in again.");
  const response = await fetch(`/api/crm/sales-quotes/${encodeURIComponent(quoteId)}/v2/delivery`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.schemaVersion !== 1 ||
      ["enabled", "native", "canSend", "reserved"].some((key) => typeof payload[key] !== "boolean")) {
    throw new Error("Quote delivery availability could not be verified.");
  }
  return payload as QuoteV2DeliveryCapability;
}
