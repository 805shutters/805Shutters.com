export type NumberedQuoteLine = {
  id: string;
  quantity: number;
};

export function normalizeLineItemQuantity(value: unknown): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export type LineNumberRange = {
  start: number;
  end: number;
  label: string;
  numbers: number[];
};

/** Builder labels expand quantity, so one line item can occupy several display numbers. */
export function buildLineNumberRanges(lineItems: NumberedQuoteLine[]) {
  let nextNumber = 1;
  const ranges = new Map<string, LineNumberRange>();

  lineItems.forEach((item) => {
    const quantity = normalizeLineItemQuantity(item.quantity);
    const start = nextNumber;
    const end = nextNumber + quantity - 1;
    const numbers = Array.from({ length: quantity }, (_, index) => start + index);

    ranges.set(item.id, {
      start,
      end,
      label: start === end ? `#${start}` : `#${start}-${end}`,
      numbers,
    });
    nextNumber = end + 1;
  });

  return ranges;
}
