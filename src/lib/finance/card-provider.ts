/** Server-only selection. Rollout is explicit; an unavailable provider never falls back. */
export type CardProvider = "square" | "stripe";
export function cardProvider(): CardProvider {
  const value = process.env.CARD_PAYMENT_PROVIDER || "square";
  if (value !== "square" && value !== "stripe")
    throw new Error("Unsupported card payment provider.");
  return value;
}
