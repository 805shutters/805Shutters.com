export const YELP_PAGE_URL = "https://www.yelp.com/biz/805-shutters-camarillo-4";

export type YelpSmsStatus = {
  phone: string;
  status: "sending" | "accepted" | "needs_review";
  attemptedAt: string;
};

export function yelpSmsPhone(value: string | null | undefined): string | null {
  const digits = (value || "").replace(/\D/g, "");
  const phone = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : null;
  return phone && /^\+1[2-9]\d{2}[2-9]\d{6}$/.test(phone) ? phone : null;
}

export function yelpSmsBody(customerName: string): string {
  const firstName = customerName.trim().split(/\s+/)[0];
  return `${firstName ? `Hi ${firstName},` : "Hi,"} here's 805 Shutters on Yelp: ${YELP_PAGE_URL}`;
}
