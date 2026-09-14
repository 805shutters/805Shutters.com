/** Customer service charges; deliberately independent of manufacturer freight/cost. */
export const CUSTOMER_CHARGE_POLICY_VERSION = "blind-shade-install-ship-v1" as const;
export type CustomerCharges = Readonly<{
  version: typeof CUSTOMER_CHARGE_POLICY_VERSION;
  eligibleUnitsPerWindow: number;
  quantity: number;
  eligibleUnitCount: number;
  installationPerUnit: 25;
  shippingPerUnit: 14;
  installationTotal: number;
  shippingTotal: number;
  perWindowTotal: number;
  total: number;
}>;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function customerChargeEligible(product: string, program = ""): boolean {
  const identity = `${product} ${program}`.toLowerCase().replace(/[_-]+/g, " ");
  if (/shutter|headrail|head rail|vane|remote|accessory|awning|drapery|fabric by|valance only/.test(identity)) return false;
  return /blind|shade|roller|roman|honeycomb|cellular|sheer|smartdrape|smart drape|synchrony|faux|wood|vertical|mini|vinyl|polar (elite|titan|mega|all seasons|allseasons|interior|exterior)/.test(identity);
}

export function calculateCustomerCharges(input: {
  product: string; program?: string; physicalUnitsPerWindow: number; quantity: number;
}): CustomerCharges | null {
  if (!customerChargeEligible(input.product, input.program)) return null;
  const units = input.physicalUnitsPerWindow;
  const quantity = input.quantity;
  if (!Number.isInteger(units) || units < 1 || !Number.isInteger(quantity) || quantity < 1) {
    throw new Error("Installation and shipping require positive whole physical-unit and line quantities.");
  }
  const eligibleUnitCount = units * quantity;
  return Object.freeze({ version: CUSTOMER_CHARGE_POLICY_VERSION, eligibleUnitsPerWindow: units,
    quantity, eligibleUnitCount, installationPerUnit: 25, shippingPerUnit: 14,
    installationTotal: eligibleUnitCount * 25, shippingTotal: eligibleUnitCount * 14,
    perWindowTotal: units * 39, total: eligibleUnitCount * 39 });
}

/** Validate the entire persisted customer-only shape. Never pass through arbitrary JSON. */
export function parseCustomerCharges(value: unknown): CustomerCharges | null {
  const source = record(value);
  if (source.version !== CUSTOMER_CHARGE_POLICY_VERSION) return null;
  const units = Number(source.eligibleUnitsPerWindow), quantity = Number(source.quantity);
  if (!Number.isInteger(units) || units < 1 || !Number.isInteger(quantity) || quantity < 1) return null;
  const expected = calculateCustomerCharges({product: "shade", physicalUnitsPerWindow: units, quantity})!;
  return Object.entries(expected).every(([key, amount]) => source[key] === amount) ? expected : null;
}

export function storedCustomerCharges(options: unknown): CustomerCharges | null {
  const data = record(options);
  if (data.manual_price_override === true) return null;
  return parseCustomerCharges(record(data.authoritative_price_breakdown).customerCharges)
    ?? parseCustomerCharges(data.customer_charges);
}

export function customerChargeLabels(charges: CustomerCharges | null): string[] {
  if (!charges) return [];
  return [`Installation: $${charges.installationTotal.toFixed(2)} (${charges.eligibleUnitCount} × $25)`,
    `Shipping: $${charges.shippingTotal.toFixed(2)} (${charges.eligibleUnitCount} × $14)`];
}
