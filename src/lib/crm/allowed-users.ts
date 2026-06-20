export const allowedCrmEmails = [
  "805shutters@gmail.com",
  "jessica@805shutters.com",
  "khill31@msn.com"
] as const;

export function normalizeCrmEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isAllowedCrmEmail(email: string) {
  return (allowedCrmEmails as readonly string[]).includes(normalizeCrmEmail(email));
}
