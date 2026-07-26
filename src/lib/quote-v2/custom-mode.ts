export type CustomModeInput = {
  manufacturerCost: number;
  freightCost: number;
  otherCost: number;
  profitMode: "dollar" | "margin";
  profitValue: number;
  finalSellPrice?: number | null;
};

const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateCustomMode(input: CustomModeInput) {
  for (const [key, value] of Object.entries(input)) {
    if (key === "profitMode" || value == null) continue;
    if (!Number.isFinite(value as number) || (value as number) < 0) {
      throw new TypeError(`${key} must be a nonnegative number.`);
    }
  }
  if (input.profitMode === "margin" && input.profitValue >= 100) {
    throw new TypeError("Margin must be less than 100%.");
  }
  const landedCost = cents(input.manufacturerCost + input.freightCost + input.otherCost);
  const calculatedSellPrice = input.profitMode === "dollar"
    ? cents(landedCost + input.profitValue)
    : cents(landedCost / (1 - input.profitValue / 100));
  const sellPrice = input.finalSellPrice == null ? calculatedSellPrice : cents(input.finalSellPrice);
  const profitDollars = cents(sellPrice - landedCost);
  const marginPercent = sellPrice > 0 ? cents((profitDollars / sellPrice) * 100) : 0;
  return { landedCost, calculatedSellPrice, sellPrice, profitDollars, marginPercent };
}

export function customModeCustomerRetail(
  originalRetail: Record<string, unknown>,
  sellPrice: number,
) {
  const quantity = Math.max(1, Math.floor(Number(originalRetail.quantity) || 1));
  return {
    ...originalRetail,
    unitPrice: cents(sellPrice),
    base: cents(sellPrice),
    surchargeLines: [],
    discountPercent: 0,
    discountAmount: 0,
    onceTotal: 0,
    quantity,
    total: cents(sellPrice * quantity),
  };
}

export function isCustomModeSnapshot(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const source = value as Record<string, unknown>;
  return source.mode === "custom_override" && source.internalOnly === true;
}
