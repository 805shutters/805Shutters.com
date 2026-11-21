import { CATALOG_CUSTOMER_CHARGE_RATES } from "./customer-charge-catalog-rates";

/** Customer service charges; deliberately independent of manufacturer freight/cost. */
export const LEGACY_CUSTOMER_CHARGE_POLICY_VERSION = "blind-shade-install-ship-v1" as const;
export const CUSTOMER_CHARGE_POLICY_VERSION = "blind-shade-install-ship-v2-setting" as const;
export type CustomerChargePolicyVersion =
  | typeof CUSTOMER_CHARGE_POLICY_VERSION
  | typeof LEGACY_CUSTOMER_CHARGE_POLICY_VERSION;

export type CustomerCharges = Readonly<{
  version: CustomerChargePolicyVersion;
  eligibleUnitsPerWindow: number;
  quantity: number;
  eligibleUnitCount: number;
  installationPerUnit: number;
  shippingPerUnit: number;
  installationTotal: number;
  shippingTotal: number;
  perWindowTotal: number;
  total: number;
}>;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function customerChargeEligible(product: string, program = ""): boolean {
  const identity = `${product} ${program}`.toLowerCase().replace(/[_-]+/g, " ");
  if (/shutter|headrail|head rail|vane|remote|accessor|parts|pillow|awning|drapery|fabric by|valance only/.test(identity)) return false;
  return /blind|shade|roller|roman|honeycomb|cellular|sheer|smartdrape|smart drape|synchrony|faux|wood|vertical|mini|vinyl|polar (elite|titan|mega|all seasons|allseasons|interior|exterior)/.test(identity);
}

/** Count installed products, not fabric price grids or shared hardware. */
export function customerPhysicalUnits(input: {
  productId: string; configuration?: unknown; pricedConfigurationUnits?: unknown;
}): number {
  const c = record(input.configuration);
  const text = [c.lift_system, c.honeycomb_operating_system, c.shade_type, c.roller_application]
    .filter(v => typeof v === "string").join(" ").toLowerCase().replace(/[_&-]+/g, " ");
  if (input.productId === "honeycomb") {
    return /smartfit.*dual/.test(text) ? 2 : 1;
  }
  const keys = input.productId.startsWith("lotus_") ? ["lotus_blind_count"]
    : ["smartprivacy_faux", "faux_wood"].includes(input.productId) ? ["faux_blind_count"]
    : input.productId === "roller" ? ["roller_coupling_count", "coupled_shade_count", "lightguard_360_shade_count"] : [];
  for (const key of keys) {
    if (c[key] == null || c[key] === "") continue;
    const count = Number(c[key]);
    if (!Number.isSafeInteger(count) || count < 1 || count > 4) throw new Error("Invalid physical blind/shade count.");
    return count;
  }
  if (input.productId === "roman" && /common valance/.test(text)) return 2;
  if (input.productId === "roller" && /dual/.test(text)) return 2;
  const count = input.pricedConfigurationUnits == null ? 1 : Number(input.pricedConfigurationUnits);
  if (!Number.isSafeInteger(count) || count < 1 || count > 4) throw new Error("Invalid physical blind/shade count.");
  return count;
}

function moneyFromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function calculateCustomerCharges(input: {
  product: string; program?: string; physicalUnitsPerWindow: number; quantity: number;
  installationPerUnit?: number; shippingPerUnit?: number;
  policyVersion?: CustomerChargePolicyVersion;
}): CustomerCharges | null {
  if (!customerChargeEligible(input.product, input.program)) return null;
  const units = input.physicalUnitsPerWindow;
  const quantity = input.quantity;
  if (!Number.isInteger(units) || units < 1 || !Number.isInteger(quantity) || quantity < 1) {
    throw new Error("Installation and shipping require positive whole physical-unit and line quantities.");
  }
  const installationPerUnit = input.installationPerUnit ?? CATALOG_CUSTOMER_CHARGE_RATES.installationPerUnit;
  const shippingPerUnit = input.shippingPerUnit ?? CATALOG_CUSTOMER_CHARGE_RATES.shippingPerUnit;
  if (!Number.isFinite(installationPerUnit) || installationPerUnit < 0 || !Number.isFinite(shippingPerUnit) || shippingPerUnit < 0) {
    throw new Error("Installation and shipping settings must be zero or more.");
  }
  const version = input.policyVersion ?? (
    input.installationPerUnit == null && input.shippingPerUnit == null
      ? LEGACY_CUSTOMER_CHARGE_POLICY_VERSION
      : CUSTOMER_CHARGE_POLICY_VERSION
  );
  const eligibleUnitCount = units * quantity;
  const installCents = Math.round(installationPerUnit * 100);
  const shipCents = Math.round(shippingPerUnit * 100);
  const perWindowCents = installCents + shipCents;
  return Object.freeze({
    version, eligibleUnitsPerWindow: units, quantity, eligibleUnitCount,
    installationPerUnit, shippingPerUnit,
    installationTotal: moneyFromCents(installCents * eligibleUnitCount),
    shippingTotal: moneyFromCents(shipCents * eligibleUnitCount),
    perWindowTotal: moneyFromCents(perWindowCents * units),
    total: moneyFromCents((installCents + shipCents) * eligibleUnitCount),
  });
}

function isChargePolicy(value: unknown): value is CustomerChargePolicyVersion {
  return value === CUSTOMER_CHARGE_POLICY_VERSION || value === LEGACY_CUSTOMER_CHARGE_POLICY_VERSION;
}

/** Validate the entire persisted customer-only shape. Never pass through arbitrary JSON. */
export function parseCustomerCharges(value: unknown): CustomerCharges | null {
  const source = record(value);
  if (!isChargePolicy(source.version)) return null;
  const units = Number(source.eligibleUnitsPerWindow), quantity = Number(source.quantity);
  if (!Number.isInteger(units) || units < 1 || !Number.isInteger(quantity) || quantity < 1) return null;
  const installationPerUnit = Number(source.installationPerUnit);
  const shippingPerUnit = Number(source.shippingPerUnit);
  if (!Number.isFinite(installationPerUnit) || installationPerUnit < 0 || !Number.isFinite(shippingPerUnit) || shippingPerUnit < 0) return null;
  const expected = calculateCustomerCharges({
    product: "shade", physicalUnitsPerWindow: units, quantity,
    installationPerUnit, shippingPerUnit, policyVersion: source.version,
  })!;
  return Object.entries(expected).every(([key, amount]) => source[key] === amount) ? expected : null;
}

export function storedCustomerCharges(options: unknown): CustomerCharges | null {
  const data = record(options);
  // Earlier overrides were all-inclusive and may retain stale pre-override fees.
  if (data.manual_price_override === true && !isChargePolicy(data.manual_customer_charge_policy)) return null;
  return parseCustomerCharges(record(data.authoritative_price_breakdown).customerCharges)
    ?? parseCustomerCharges(data.customer_charges);
}

export function customerChargeLabels(charges: CustomerCharges | null): string[] {
  if (!charges) return [];
  const install = charges.installationPerUnit.toFixed(2);
  const ship = charges.shippingPerUnit.toFixed(2);
  return [`Installation: $${charges.installationTotal.toFixed(2)} (${charges.eligibleUnitCount} × $${install})`,
    `Shipping: $${charges.shippingTotal.toFixed(2)} (${charges.eligibleUnitCount} × $${ship})`];
}
