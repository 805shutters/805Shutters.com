import type { SupabaseClient } from "@supabase/supabase-js";
import { cardProvider, type CardProvider } from "@/lib/finance/card-provider";
import {
  createSquarePaymentLink,
  isSquareConfigured,
  type SquarePaymentLinkInput,
} from "@/lib/finance/square";
import { isStripeConfigured } from "@/lib/finance/stripe";
import { createStripePaymentLink } from "./stripe-collection";
export function isCardConfigured() {
  return cardProvider() === "stripe"
    ? isStripeConfigured()
    : isSquareConfigured();
}
export async function createCardPaymentLink(
  db: SupabaseClient,
  input: SquarePaymentLinkInput,
  provider: CardProvider = cardProvider(),
) {
  return provider === "stripe"
    ? createStripePaymentLink(db, input)
    : createSquarePaymentLink(input);
}
