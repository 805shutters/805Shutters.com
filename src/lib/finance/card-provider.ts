import { CrmAuthError } from "@/lib/crm/auth";

/** Server-only selection. Exactly "square" or "stripe"; anything else fails closed. */
export type CardProvider = "square" | "stripe";

export class CardProviderConfigError extends CrmAuthError {
  constructor(message: string) {
    super(503, message);
    this.name = "CardProviderConfigError";
  }
}

export function cardProvider(): CardProvider {
  const value = process.env.CARD_PAYMENT_PROVIDER;
  if (value === "square" || value === "stripe") return value;
  const missing = value === undefined || value.trim() === "";
  throw new CardProviderConfigError(
    missing
      ? "Card payment provider is not configured."
      : "Unsupported card payment provider.",
  );
}

/** Square wallet application id only when Square is the explicit provider. */
export async function squareWalletApplicationId(
  resolve: () => Promise<string>,
): Promise<string | null> {
  if (cardProvider() !== "square") return null;
  return resolve();
}
