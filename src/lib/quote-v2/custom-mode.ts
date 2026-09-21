import { getProduct } from "@/lib/quote/catalog";
import { calculateCustomerCharges, customerPhysicalUnits, parseCustomerCharges } from "@/lib/quote/customer-charges";
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
  configuration: unknown = {},
) {
  const quantity = Math.max(1, Math.floor(Number(originalRetail.quantity) || 1));
  const { customerCharges: priorCharges, ...merchandise } = originalRetail;
  const storedCharges = parseCustomerCharges(priorCharges);
  const productId = String(originalRetail.productId ?? "");
  const charges = calculateCustomerCharges({
    product: `${productId} ${getProduct(productId)?.productType ?? originalRetail.productType ?? ""}`,
    program: String(originalRetail.programId ?? ""), quantity,
    physicalUnitsPerWindow: customerPhysicalUnits({productId, configuration,
      pricedConfigurationUnits: storedCharges?.eligibleUnitsPerWindow ?? originalRetail.configurationUnits}),
  });
  return {
    ...merchandise,
    unitPrice: cents(sellPrice + (charges?.perWindowTotal ?? 0)),
    base: cents(sellPrice),
    surchargeLines: [],
    discountPercent: 0,
    discountAmount: 0,
    onceTotal: 0,
    quantity,
    total: cents(sellPrice * quantity + (charges?.total ?? 0)),
    ...(charges ? {customerCharges: charges} : {}),
  };
}

export function isCustomModeSnapshot(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const source = value as Record<string, unknown>;
  return source.mode === "custom_override" && source.internalOnly === true;
}
