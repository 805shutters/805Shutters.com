// Customer payment options surfaced on the contract + quote email. Config-driven
// (env-overridable) so the business can change the destination without a code change.
// Square (card) payments plug in alongside these via the Square integration.

/** Zelle destination (phone or email). */
export const ZELLE_DESTINATION = process.env.ZELLE_DESTINATION || "805-806-9344";

export type PaymentOptions = {
  zelleDestination: string;
};
