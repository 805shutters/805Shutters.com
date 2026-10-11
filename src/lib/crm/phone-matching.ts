export type PhoneCustomer = {
  id: string;
  display_name: string;
  phone: string | null;
  meta?: Record<string, unknown> | null;
};
export function normalizePhone(
  value: string | null | undefined,
): string | null {
  if (!value || /(?:ext\.?|x|#)\s*\d/i.test(value)) return null;
  if (!/^[+\d().\s-]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  if (value.trim().startsWith("+"))
    return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}
export function matchPhoneCustomer(
  phones: (string | null | undefined)[],
  customers: PhoneCustomer[],
) {
  const numbers = new Set(phones.map(normalizePhone).filter(Boolean));
  const matches = [
    ...new Map(
      customers
        .filter(
          (c) => numbers.has(normalizePhone(c.phone)) && !c.meta?.deleted_at,
        )
        .map((c) => [c.id, c]),
    ).values(),
  ];
  if (matches.length !== 1)
    return {
      customerId: null,
      customerName: null,
      status: matches.length ? "ambiguous" : "unmatched",
    };
  return {
    customerId: matches[0].id,
    customerName: matches[0].display_name,
    status: "matched",
  };
}
