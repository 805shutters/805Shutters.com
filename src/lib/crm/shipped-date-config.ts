/**
 * Shipped-date reader defaults. Mike can change each value on its own line.
 * Sundance is manual: it is not a sender here and must not be added.
 * Never read mtsinstallations@gmail.com. wcbot@mail.grokbot.com is only a
 * co-recipient on the 805 copy; dedupe notices by order number, not message id.
 */

export type NormanShipDate =
  | "email_received_america_los_angeles"
  | "email_received_america_los_angeles_minus_one_day";

export type MultiOrderReceivedAt = "latest_when_all_shipped" | "first_shipment";

/** Norman notices have no ship date. Use the email's received date in America/Los_Angeles. */
export const NORMAN_SHIP_DATE: NormanShipDate = "email_received_america_los_angeles";

/** On a quote with several orders, write received_at only once every order has a notice, using the latest ship date. */
export const MULTI_ORDER_RECEIVED_AT: MultiOrderReceivedAt = "latest_when_all_shipped";

/** Status is never changed. Any other value makes the job refuse to write. */
export const SHIPPED_DATE_STATUS_POLICY = "never" as "never";

/** Quote writes stay off until this is the exact string "true". */
export function shippedDateWritesEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.SHIPPED_DATE_WRITES_ENABLED === "true";
}

/**
 * Gmail search used by the existing order-email cron. Lotus fulfillment mail is
 * From system@sent-via.netsuite.com, so the subject is part of the search.
 * This is a read query, not a mailbox filter or label.
 */
export const SHIPPING_VENDOR_GMAIL_TERMS =
  '(from:normanusa.com OR from:orders@onyxshutters.com OR from:lotusblind.com OR subject:"Lotus & Windoware" OR subject:"Lotus Blind Order Fulfillment Notification")';

export const SHIPPED_DATE_MAILBOXES = ["805shutters@gmail.com", "805@805shutters.com"] as const;
