// Customer payment options surfaced on the contract + quote email. Config-driven
// (env-overridable) so the business can change handles/numbers without a code change.
// Square (card) payments plug in alongside these via the Square integration.

/** Venmo handle without the leading @ (e.g. "ken-hill-13"). */
export const VENMO_HANDLE = process.env.VENMO_HANDLE || "ken-hill-13";
/** Zelle destination (phone or email). */
export const ZELLE_DESTINATION = process.env.ZELLE_DESTINATION || "805-806-9344";

/** Venmo profile URL — a QR of this opens the profile so the customer can pay. */
export function venmoProfileUrl(): string {
  return `https://venmo.com/${VENMO_HANDLE}`;
}

export type PaymentOptions = {
  venmoHandle: string;
  /** Inline SVG (a QR of the Venmo profile URL) the customer can scan. */
  venmoQrSvg: string;
  zelleDestination: string;
};
