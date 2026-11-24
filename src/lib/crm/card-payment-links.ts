import { CrmAuthError } from "@/lib/crm/auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cardProvider, type CardProvider } from "@/lib/finance/card-provider";
import {
  type SquarePaymentLinkInput,
} from "@/lib/finance/square";
import { isStripeConfigured } from "@/lib/finance/stripe";
import { createStripePaymentLink } from "./stripe-collection";
export function isCardConfigured() {
  cardProvider();
  return isStripeConfigured();
}
export async function createCardPaymentLink(
  db: SupabaseClient,
  input: SquarePaymentLinkInput,
  provider: CardProvider = cardProvider(),
) {
  if (provider !== "stripe") throw new CrmAuthError(409, "This historical Square request must be retired before creating a Stripe payment link.");
  return createStripePaymentLink(db, input);
}
