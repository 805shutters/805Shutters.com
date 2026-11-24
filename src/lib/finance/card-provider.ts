import { CrmAuthError } from "@/lib/crm/auth";

/** Historical records retain their provider. All new card collection is Stripe-only. */
export type CardProvider = "square" | "stripe";

export class CardProviderConfigError extends CrmAuthError {
  constructor(message: string) {
    super(503, message);
    this.name = "CardProviderConfigError";
  }
}

export function cardProvider(): CardProvider {
  const value = process.env.CARD_PAYMENT_PROVIDER;
  if (value === "stripe") return "stripe";
  throw new CardProviderConfigError(
    value === undefined || value.trim() === ""
      ? "Card payment provider is not configured."
      : "Card collection requires Stripe. Square collection is retired.",
  );
}

/** Compatibility shim: legacy embedded Square wallets are permanently retired. */
export async function squareWalletApplicationId(
  resolve: () => Promise<string>,
): Promise<string | null> {
  return null;
}
