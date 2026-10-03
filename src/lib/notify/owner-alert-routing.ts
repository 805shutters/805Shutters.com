import { toE164 } from "./phone";

/** Only explicitly identified alerts to Mike use this sender. */
export const OWNER_ALERT_FROM_PHONE = "+18057931853";

/** Use only inside staff-alert loops; a customer phone match must never select this route. */
export function isMikeAlertRecipient(phone: string | null | undefined): boolean {
  const owner = toE164(process.env.MIKE_805_SALES_SMS_NUMBER);
  return Boolean(owner && toE164(phone) === owner);
}
