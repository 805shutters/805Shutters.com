export const allowedCrmEmails = [
  "805shutters@gmail.com",
  "jessica@805shutters.com",
  "khill31@msn.com"
] as const;

export const MIKE_PAYMENT_ADMIN_EMAIL = "805shutters@gmail.com";
export const KEN_CRM_EMAIL = "khill31@msn.com";

export function normalizeCrmEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isAllowedCrmEmail(email: string) {
  return (allowedCrmEmails as readonly string[]).includes(normalizeCrmEmail(email));
}

export function isMikePaymentAdminEmail(email: string | null | undefined) {
  return Boolean(email && normalizeCrmEmail(email) === MIKE_PAYMENT_ADMIN_EMAIL);
}

export function isCrmOwnerAdminEmail(email: string | null | undefined) {
  return isMikePaymentAdminEmail(email);
}

export function crmPaymentPersonForEmail(email: string | null | undefined) {
  const normalized = email ? normalizeCrmEmail(email) : "";
  if (normalized === MIKE_PAYMENT_ADMIN_EMAIL) return "mike" as const;
  if (normalized === "jessica@805shutters.com") return "jessica" as const;
  if (normalized === KEN_CRM_EMAIL) return "ken" as const;
  return null;
}

export function isKenCrmEmail(email: string | null | undefined) {
  return Boolean(email && normalizeCrmEmail(email) === KEN_CRM_EMAIL);
}
