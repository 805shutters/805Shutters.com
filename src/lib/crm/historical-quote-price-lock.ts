export type HistoricalQuotePriceLock = {
  total: number;
  designUnitPrices: Record<string, number>;
};

type HistoricalPriceDesign = {
  id: string;
  unit_price?: number | string | null;
};

function positiveMoney(value: unknown): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function buildHistoricalQuotePriceLock(
  total: unknown,
  designs: readonly HistoricalPriceDesign[],
): HistoricalQuotePriceLock | null {
  const lockedTotal = positiveMoney(total);
  if (lockedTotal === null) return null;

  const designUnitPrices = Object.fromEntries(
    designs.flatMap((design) => {
      const unitPrice = positiveMoney(design.unit_price);
      return design.id && unitPrice !== null ? [[design.id, unitPrice]] : [];
    }),
  );

  return { total: lockedTotal, designUnitPrices };
}

export function historicalUnitPrice(
  currentUnitPrice: unknown,
  lockedUnitPrice: unknown,
): { amount: number; fromHistoricalLock: boolean } {
  const current = Number(currentUnitPrice);
  if (Number.isFinite(current) && current > 0) {
    return { amount: current, fromHistoricalLock: false };
  }

  const locked = positiveMoney(lockedUnitPrice);
  if (locked !== null) {
    return { amount: locked, fromHistoricalLock: true };
  }

  return {
    amount: Number.isFinite(current) && current >= 0 ? current : 0,
    fromHistoricalLock: false,
  };
}

export function shouldUseHistoricalQuotePriceLock(input: {
  quoteV2Backend: boolean;
  quoteV2Status: string | null | undefined;
  priceLock: HistoricalQuotePriceLock | null | undefined;
}): boolean {
  return Boolean(
    input.quoteV2Backend &&
      input.priceLock &&
      input.priceLock.total > 0 &&
      input.quoteV2Status !== "priced" &&
      input.quoteV2Status !== "sent",
  );
}
