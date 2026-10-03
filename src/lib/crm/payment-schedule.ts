/** Versioned customer terms. Existing contracts default to standard. */
export type PaymentSchedule = "standard" | "in_house_three_month_v1";
export const IN_HOUSE_SCHEDULE = "in_house_three_month_v1" as const;
export function paymentSchedule(value: unknown): PaymentSchedule {
  return value === IN_HOUSE_SCHEDULE ? value : "standard";
}
export function scheduleAmounts(total: number): [number, number, number] {
  const cents = Math.round(total * 100);
  if (!Number.isSafeInteger(cents) || cents < 3)
    throw new Error("The total must be at least $0.03.");
  const third = Math.floor(cents / 3);
  return [third, third, cents - third * 2];
}
export const IN_HOUSE_TERMS = {
  heading: "In-house 3-month payments",
  paragraphs: [
    "Payment 1 of 3 is a one-third deposit due upon acceptance. Payment 2 is one-third, due one calendar month after the full deposit is received. Payment 3 is the remaining third, due two calendar months after the full deposit is received. Any rounding remainder is included in payment 3.",
    "Dates use Los Angeles time; shorter months use their final day. This schedule applies to the selected accepted products and total. There is no added financing fee or interest and no automatic card charging. Installation does not accelerate these monthly due dates.",
  ],
};
