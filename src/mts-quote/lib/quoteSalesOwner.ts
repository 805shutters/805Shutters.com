export type QuoteSalesOwner = "mike" | "jessica";

export interface SalesOwnerUser {
  id?: string | null;
  auth_user_id?: string | null;
  email?: string | null;
  display_name?: string | null;
  full_name?: string | null;
}

const JESSICA_EMAILS = new Set(["jessicaacklin@gmail.com"]);
const MIKE_EMAILS = new Set(["mtsshutters@gmail.com", "michael@805shutters.com"]);
const JESSICA_NAMES = new Set(["jessica", "jessica acklin"]);
const MIKE_NAMES = new Set(["mike", "mike shepard", "michael shepard"]);

function normalize(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function resolveSalesOwnerFromUser(
  user: SalesOwnerUser | null | undefined
): QuoteSalesOwner | null {
  if (!user) return null;
  const email = normalize(user.email);
  const displayName = normalize(user.display_name);
  const fullName = normalize(user.full_name);

  if (JESSICA_EMAILS.has(email) || JESSICA_NAMES.has(displayName) || JESSICA_NAMES.has(fullName)) {
    return "jessica";
  }

  if (MIKE_EMAILS.has(email) || MIKE_NAMES.has(displayName) || MIKE_NAMES.has(fullName)) {
    return "mike";
  }

  return null;
}
