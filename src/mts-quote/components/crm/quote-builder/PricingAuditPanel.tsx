import type { ReactNode } from "react";
import { cn } from "@mts/lib/utils";
import type { WholesaleCostResult } from "@/lib/quote/wholesale-ledger";

export type PricingAuditSurcharge = {
  id: string;
  name: string;
  type: "percentage" | "fixed";
  value: number;
  quantity: number;
  category: string;
  automatic: boolean;
};

export type PricingAuditWholesaleCost = {
  ok: true;
  basis: "catalog_factor" | "dealer_net";
  effectiveDealerFactor?: number;
  dealerPolicyId?: string;
  dealerPolicyFixtureId?: string;
  matchedWidth: number | null;
  matchedHeight: number | null;
  wholesaleBase: number;
  wholesaleAddOns: Array<{ id: string; label: string; amount: number }>;
  wholesaleComponents?: PricingAuditWholesaleComponent[];
  wholesaleUnitCost: number;
  quantity: number;
  wholesaleTotal: number;
  freightAllocated?: number;
  oversizeAllocated?: number;
  processingFeeAllocated?: number;
  landedCostTotal?: number;
  freightStatus?: "published" | "estimated" | "unresolved" | "not_applicable";
};

type PricingComponentCategory =
  | "base_grid"
  | "fabric_upgrade"
  | "accessory"
  | "operating_system"
  | "order_charge";

type SummaryComponentCategory = Exclude<PricingComponentCategory, "order_charge">;

type PricingAuditRetailComponent = {
  id: string;
  category: PricingComponentCategory;
  label: string;
  status: string | null;
  basis: unknown;
  catalogAmount: number | null;
  customerAmount: number;
  detail: string | null;
};

export type PricingAuditWholesaleComponent = {
  id: string;
  category: PricingComponentCategory;
  label: string;
  amount: number;
  catalogAmount?: number | null;
  basis?: unknown;
  status?: string | null;
  detail?: string | null;
};

const SUMMARY_CATEGORIES: readonly SummaryComponentCategory[] = [
  "base_grid",
  "fabric_upgrade",
  "accessory",
  "operating_system",
] as const;

const COMPONENT_CATEGORY_LABELS: Record<PricingComponentCategory, string> = {
  base_grid: "Base",
  fabric_upgrade: "Fabric",
  accessory: "Accessories",
  operating_system: "Operating",
  order_charge: "Order charges",
};

const EMPTY_COMPONENT_LABELS: Record<SummaryComponentCategory, string> = {
  base_grid: "Base grid not available",
  fabric_upgrade: "No fabric price upgrade",
  accessory: "No paid accessories",
  operating_system: "No operating-system upgrade",
};

type PricingAuditPanelProps = {
  productType: string;
  supplier: string | null;
  programName: string | null;
  widthIn: number;
  heightIn: number;
  rawSqft: number | null;
  billableSqft: number | null;
  quantity: number;
  savedUnitPrice: number;
  options: Record<string, unknown>;
  currentRetailPerSqft: number | null;
  wholesaleRate: number | null;
  tariffPercent: number;
  surcharges: PricingAuditSurcharge[];
  authoritativeWholesaleCost: PricingAuditWholesaleCost | null;
  canonicalWholesaleCost?: WholesaleCostResult | null;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function money(value: unknown): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "$0";
  return `$${numeric.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(numeric) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function finiteMoney(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? roundMoney(numeric) : null;
}

function pricingComponentCategory(value: unknown): PricingComponentCategory | null {
  return typeof value === "string" &&
    ([...SUMMARY_CATEGORIES, "order_charge"] as string[]).includes(value)
    ? (value as PricingComponentCategory)
    : null;
}

function parseRetailComponents(value: unknown): PricingAuditRetailComponent[] | null {
  if (!Array.isArray(value)) return null;

  const components = value.flatMap((entry, index): PricingAuditRetailComponent[] => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Record<string, unknown>;
    const category = pricingComponentCategory(raw.category);
    const customerAmount = finiteMoney(raw.customerAmount);
    if (!category || customerAmount === null) return [];
    return [{
      id: typeof raw.id === "string" && raw.id.trim() ? raw.id : `component-${index}`,
      category,
      label: typeof raw.label === "string" && raw.label.trim()
        ? raw.label
        : COMPONENT_CATEGORY_LABELS[category],
      status: typeof raw.status === "string" && raw.status.trim() ? raw.status : null,
      basis: raw.basis,
      catalogAmount: finiteMoney(raw.catalogAmount),
      customerAmount,
      detail: typeof raw.detail === "string" && raw.detail.trim() ? raw.detail : null,
    }];
  });

  // An empty or malformed array is not an authoritative ledger. Falling back
  // keeps historic quotes readable while V2 fails closed before sending them.
  return components.length > 0 ? components : null;
}

function parseWholesaleComponents(
  value: PricingAuditWholesaleComponent[] | undefined,
): PricingAuditWholesaleComponent[] | null {
  if (!Array.isArray(value)) return null;

  const components = value.flatMap((entry, index): PricingAuditWholesaleComponent[] => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as unknown as Record<string, unknown>;
    const category = pricingComponentCategory(raw.category);
    const amount = finiteMoney(raw.amount ?? raw.wholesaleAmount);
    if (!category || amount === null) return [];
    return [{
      id: typeof raw.id === "string" && raw.id.trim() ? raw.id : `wholesale-component-${index}`,
      category,
      label: typeof raw.label === "string" && raw.label.trim()
        ? raw.label
        : COMPONENT_CATEGORY_LABELS[category],
      amount,
      catalogAmount: finiteMoney(raw.catalogAmount),
      basis: raw.basis,
      status: typeof raw.status === "string" && raw.status.trim() ? raw.status : null,
      detail: typeof raw.detail === "string" && raw.detail.trim() ? raw.detail : null,
    }];
  });

  return components.length > 0 ? components : null;
}

function componentCategoryTotal(
  components: readonly PricingAuditRetailComponent[],
  category: PricingComponentCategory,
): number {
  return roundMoney(
    components
      .filter((component) => component.category === category)
      .reduce((total, component) => total + component.customerAmount, 0),
  );
}

function wholesaleComponentCategoryTotal(
  components: readonly PricingAuditWholesaleComponent[],
  category: PricingComponentCategory,
): number {
  return roundMoney(
    components
      .filter((component) => component.category === category)
      .reduce((total, component) => total + component.amount, 0),
  );
}

function componentStatus(status: string | null | undefined): string | null {
  if (!status) return null;
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function componentDetail(
  component: Pick<PricingAuditRetailComponent, "catalogAmount" | "detail" | "status">,
): string | null {
  const parts = [componentStatus(component.status), component.detail].filter(Boolean);
  if (component.catalogAmount !== null) {
    parts.push(`Manufacturer source amount ${money(component.catalogAmount)}`);
  }
  return parts.join(" · ") || null;
}

function wholesaleComponentDetail(component: PricingAuditWholesaleComponent): string | null {
  const parts = [componentStatus(component.status), component.detail].filter(Boolean);
  if (component.catalogAmount !== null && component.catalogAmount !== undefined) {
    parts.push(`Manufacturer source amount ${money(component.catalogAmount)}`);
  }
  return parts.join(" · ") || null;
}

function completeRetailComponents(
  components: readonly PricingAuditRetailComponent[],
): PricingAuditRetailComponent[] {
  const complete = [...components];
  for (const category of SUMMARY_CATEGORIES) {
    if (complete.some((component) => component.category === category)) continue;
    complete.push({
      id: `empty-${category}`,
      category,
      label: EMPTY_COMPONENT_LABELS[category],
      status: "not_selected",
      basis: null,
      catalogAmount: 0,
      customerAmount: 0,
      detail: null,
    });
  }
  return complete;
}

function completeWholesaleComponents(
  components: readonly PricingAuditWholesaleComponent[],
): PricingAuditWholesaleComponent[] {
  const complete = [...components];
  for (const category of SUMMARY_CATEGORIES) {
    if (complete.some((component) => component.category === category)) continue;
    complete.push({
      id: `empty-wholesale-${category}`,
      category,
      label: EMPTY_COMPONENT_LABELS[category],
      status: "not_selected",
      catalogAmount: 0,
      amount: 0,
    });
  }
  return complete;
}

function decimalInches(value: number): string {
  return value.toFixed(3).replace(/\.?0+$/, "");
}

function surchargeAmount(basePrice: number, surcharge: PricingAuditSurcharge): number {
  if (surcharge.type === "percentage") {
    return roundMoney(basePrice * (surcharge.value / 100));
  }
  return roundMoney(surcharge.value * Math.max(1, surcharge.quantity || 1));
}

function surchargeFormula(basePrice: number, surcharge: PricingAuditSurcharge): string {
  if (surcharge.type === "percentage") {
    return `${surcharge.value}% of ${money(basePrice)}`;
  }
  const quantity = Math.max(1, surcharge.quantity || 1);
  return quantity > 1
    ? `${money(surcharge.value)} x ${quantity}`
    : `${money(surcharge.value)} fixed`;
}

function DetailRow({
  label,
  value,
  emphasized = false,
  wholesaleCost = false,
}: {
  label: string;
  value: ReactNode;
  emphasized?: boolean;
  wholesaleCost?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200/80 py-1.5 last:border-b-0">
      <span className="text-slate-600">{label}</span>
      <span
        className={cn(
          "text-right",
          wholesaleCost ? "font-semibold text-[#b91c1c]" : "text-slate-900",
          emphasized && "font-bold",
        )}
        data-wholesale-cost-value={wholesaleCost ? "true" : undefined}
      >
        {value}
      </span>
    </div>
  );
}

export function PricingAuditPanel({
  productType,
  supplier,
  programName,
  widthIn,
  heightIn,
  rawSqft,
  billableSqft,
  quantity,
  savedUnitPrice,
  options,
  currentRetailPerSqft,
  wholesaleRate,
  tariffPercent,
  surcharges,
  authoritativeWholesaleCost: protectedWholesaleCost,
  canonicalWholesaleCost,
}: PricingAuditPanelProps) {
  const canonicalWholesaleSuccess =
    canonicalWholesaleCost?.ok === true ? canonicalWholesaleCost : null;
  const canonicalBaseOnly =
    protectedWholesaleCost === null && canonicalWholesaleSuccess !== null;
  const authoritativeWholesaleCost: PricingAuditWholesaleCost | null =
    protectedWholesaleCost ??
    (canonicalWholesaleSuccess
      ? {
          ok: true,
          basis:
            canonicalWholesaleSuccess.basis === "dealer_factor"
              ? "catalog_factor"
              : "dealer_net",
          effectiveDealerFactor:
            canonicalWholesaleSuccess.dealerFactor ?? undefined,
          matchedWidth: canonicalWholesaleSuccess.matchedWidth,
          matchedHeight: canonicalWholesaleSuccess.matchedHeight,
          wholesaleBase: canonicalWholesaleSuccess.wholesaleBase,
          wholesaleAddOns: [],
          wholesaleUnitCost: canonicalWholesaleSuccess.wholesaleUnitCost,
          quantity: canonicalWholesaleSuccess.quantity,
          wholesaleTotal: canonicalWholesaleSuccess.wholesaleTotal,
          freightStatus: "unresolved",
        }
      : null);
  const isManual = options.manual_price_override === true;
  const authoritativeRetailResult =
    options.authoritative_price_breakdown &&
    typeof options.authoritative_price_breakdown === "object"
      ? (options.authoritative_price_breakdown as Record<string, unknown>)
      : null;
  const authoritativeRetailBlocked = authoritativeRetailResult?.ok === false;
  const hasAuthoritativeRetail = authoritativeRetailResult?.ok === true;
  const authoritativeRetailComponents = hasAuthoritativeRetail
    ? parseRetailComponents(authoritativeRetailResult.components)
    : null;
  const displayedRetailComponents = authoritativeRetailComponents
    ? completeRetailComponents(authoritativeRetailComponents)
    : null;
  const retailDisplayCategories: readonly PricingComponentCategory[] =
    authoritativeRetailComponents?.some((component) => component.category === "order_charge")
      ? [...SUMMARY_CATEGORIES, "order_charge"]
      : SUMMARY_CATEGORIES;
  const authoritativeProgramName =
    hasAuthoritativeRetail &&
    typeof authoritativeRetailResult.programName === "string" &&
    authoritativeRetailResult.programName.trim()
      ? authoritativeRetailResult.programName
      : programName;
  const hasStoredPricing =
    !authoritativeRetailBlocked &&
    (hasAuthoritativeRetail ||
      options.base_price !== undefined ||
      options.pricing_grid_width !== undefined ||
      options.surcharge_total !== undefined ||
      options.discount_percent !== undefined);
  const hasPrice = hasStoredPricing || isManual || savedUnitPrice > 0;
  const basePrice = authoritativeRetailComponents
    ? componentCategoryTotal(authoritativeRetailComponents, "base_grid")
    : authoritativeRetailResult?.ok === true
    ? Number(authoritativeRetailResult.base) || 0
    : authoritativeRetailBlocked
      ? 0
      : Number(options.base_price) || 0;
  const discountPercent = hasAuthoritativeRetail
    ? Number(authoritativeRetailResult.discountPercent) || 0
    : Number(options.discount_percent) || 0;
  const discountAmount = hasAuthoritativeRetail
    ? Number(authoritativeRetailResult.discountAmount) || 0
    : Number(options.discount_amount) || 0;
  const authoritativeRetailSurchargeLines =
    !authoritativeRetailComponents &&
    hasAuthoritativeRetail && Array.isArray(authoritativeRetailResult.surchargeLines)
      ? authoritativeRetailResult.surchargeLines.flatMap((entry, index) => {
          if (!entry || typeof entry !== "object") return [];
          const line = entry as Record<string, unknown>;
          const amount = Number(line.amount);
          if (!Number.isFinite(amount)) return [];
          return [{
            id: typeof line.id === "string" ? line.id : `authoritative-${index}`,
            name: typeof line.label === "string" ? line.label : "Catalog option",
            amount: roundMoney(amount),
            detail:
              typeof line.detail === "string" && line.detail.trim()
                ? line.detail
                : "Source-backed catalog charge",
          }];
        })
      : null;
  const retailSurchargeLines = authoritativeRetailSurchargeLines ?? surcharges.map((surcharge) => ({
    id: surcharge.id,
    name: surcharge.name,
    amount: surchargeAmount(basePrice, surcharge),
    detail: `${surcharge.category} · ${surcharge.automatic ? "Automatic" : "Added manually"} · ${surchargeFormula(basePrice, surcharge)}`,
  }));
  const itemizedRetailSurcharges = authoritativeRetailComponents
    ? roundMoney(
        SUMMARY_CATEGORIES
          .filter((category) => category !== "base_grid")
          .reduce(
            (total, category) =>
              total + componentCategoryTotal(authoritativeRetailComponents, category),
            0,
          ),
      )
    : roundMoney(retailSurchargeLines.reduce((sum, surcharge) => sum + surcharge.amount, 0));
  const hasSavedSurchargeTotal =
    !hasAuthoritativeRetail && Number.isFinite(Number(options.surcharge_total));
  const savedSurchargeTotal = Number(options.surcharge_total) || 0;
  const displayedSurchargeTotal =
    hasSavedSurchargeTotal ? savedSurchargeTotal : itemizedRetailSurcharges;
  const retailBeforeDiscount = roundMoney(basePrice + displayedSurchargeTotal);
  const authoritativeUnitPrice = Number(authoritativeRetailResult?.unitPrice);
  const expectedRetailUnit =
    hasAuthoritativeRetail && Number.isFinite(authoritativeUnitPrice)
      ? roundMoney(authoritativeUnitPrice)
      : roundMoney(retailBeforeDiscount - discountAmount);
  const finalUnitPrice = hasAuthoritativeRetail ? expectedRetailUnit : roundMoney(savedUnitPrice);
  const retailOnceTotal = hasAuthoritativeRetail
    ? roundMoney(Number(authoritativeRetailResult.onceTotal) || 0)
    : 0;
  const retailLineTotal = hasAuthoritativeRetail && Number.isFinite(Number(authoritativeRetailResult.total))
    ? roundMoney(Number(authoritativeRetailResult.total))
    : roundMoney(finalUnitPrice * quantity + retailOnceTotal);
  const retailComponentBucketTotals = authoritativeRetailComponents
    ? Object.fromEntries(
        SUMMARY_CATEGORIES.map((category) => [
          category,
          componentCategoryTotal(authoritativeRetailComponents, category),
        ]),
      ) as Record<(typeof SUMMARY_CATEGORIES)[number], number>
    : null;
  const selectedGridCatalogComponents = authoritativeRetailComponents?.filter(
    (component) =>
      (component.category === "base_grid" || component.category === "fabric_upgrade") &&
      component.catalogAmount !== null,
  );
  const selectedGridCatalogAmount = selectedGridCatalogComponents?.length
    ? roundMoney(
        selectedGridCatalogComponents
          .reduce((total, component) => total + (component.catalogAmount ?? 0), 0),
      )
    : null;
  const hasRetailMismatch =
    hasPrice &&
    !isManual &&
    basePrice > 0 &&
    Math.abs(expectedRetailUnit - roundMoney(savedUnitPrice)) >= 0.01;
  const hasSurchargeMismatch =
    hasSavedSurchargeTotal && Math.abs(savedSurchargeTotal - itemizedRetailSurcharges) >= 0.01;
  const effectiveRetailRate =
    billableSqft && basePrice > 0
      ? roundMoney(basePrice / billableSqft)
      : currentRetailPerSqft;

  const authoritativeWholesaleComponents = parseWholesaleComponents(
    authoritativeWholesaleCost?.wholesaleComponents,
  );
  const displayedWholesaleComponents = authoritativeWholesaleComponents
    ? completeWholesaleComponents(authoritativeWholesaleComponents)
    : null;
  const wholesaleDisplayCategories: readonly PricingComponentCategory[] =
    authoritativeWholesaleComponents?.some((component) => component.category === "order_charge")
      ? [...SUMMARY_CATEGORIES, "order_charge"]
      : SUMMARY_CATEGORIES;
  const wholesaleBase = authoritativeWholesaleComponents
    ? wholesaleComponentCategoryTotal(authoritativeWholesaleComponents, "base_grid")
    : authoritativeWholesaleCost?.wholesaleBase ?? null;
  const wholesaleSurchargeLines =
    wholesaleBase === null
      ? []
      : authoritativeWholesaleCost
        ? authoritativeWholesaleCost.wholesaleAddOns.map((line) => ({
            id: line.id,
            name: line.label,
            amount: line.amount,
            detail: "Source-backed wholesale add-on",
          }))
        : surcharges.map((surcharge) => ({
            id: surcharge.id,
            name: surcharge.name,
            amount: surchargeAmount(wholesaleBase, surcharge),
            detail: surchargeFormula(wholesaleBase, surcharge),
          }));
  const wholesaleSurchargeTotal = authoritativeWholesaleComponents
    ? roundMoney(
        SUMMARY_CATEGORIES
          .filter((category) => category !== "base_grid")
          .reduce(
            (total, category) =>
              total + wholesaleComponentCategoryTotal(authoritativeWholesaleComponents, category),
            0,
          ),
      )
    : roundMoney(wholesaleSurchargeLines.reduce((sum, line) => sum + line.amount, 0));
  const wholesaleUnitCost = authoritativeWholesaleCost?.wholesaleUnitCost
    ?? (wholesaleBase === null ? null : roundMoney(wholesaleBase + wholesaleSurchargeTotal));
  const wholesaleLineCost = authoritativeWholesaleCost?.wholesaleTotal
    ?? (wholesaleUnitCost === null ? null : roundMoney(wholesaleUnitCost * quantity));
  const landedCostUnresolved =
    authoritativeWholesaleCost?.freightStatus === "unresolved" &&
    authoritativeWholesaleCost.landedCostTotal === undefined;
  const landedLineCost =
    authoritativeWholesaleCost?.landedCostTotal ??
    (landedCostUnresolved ? null : wholesaleLineCost);
  const grossProfit =
    authoritativeRetailBlocked || landedLineCost === null
      ? null
      : roundMoney(retailLineTotal - landedLineCost);
  const grossMargin =
    grossProfit === null || retailLineTotal <= 0
      ? null
      : roundMoney((grossProfit / retailLineTotal) * 100);
  const componentCatalogGrid = authoritativeWholesaleComponents
    ? roundMoney(
        authoritativeWholesaleComponents
          .filter(
            (component) =>
              component.category === "base_grid" || component.category === "fabric_upgrade",
          )
          .reduce((total, component) => total + (component.catalogAmount ?? 0), 0),
      )
    : null;
  const componentWholesaleGrid = authoritativeWholesaleComponents
    ? roundMoney(
        authoritativeWholesaleComponents
          .filter(
            (component) =>
              component.category === "base_grid" || component.category === "fabric_upgrade",
          )
          .reduce((total, component) => total + component.amount, 0),
      )
    : null;
  const componentDealerFactor =
    componentCatalogGrid !== null &&
    componentCatalogGrid > 0 &&
    componentWholesaleGrid !== null
      ? componentWholesaleGrid / componentCatalogGrid
      : null;
  const dealerFactor =
    authoritativeWholesaleCost?.basis === "catalog_factor" && wholesaleBase !== null && basePrice > 0
      ? wholesaleBase / basePrice
      : null;
  const policyDealerFactor =
    authoritativeWholesaleCost?.effectiveDealerFactor;
  const effectiveDealerFactor = policyDealerFactor ?? componentDealerFactor;
  const formatDealerFactor = (factor: number) =>
    factor.toFixed(
      Math.abs(factor - Math.round(factor * 100) / 100) < 0.000_001
        ? 2
        : 3,
    );
  const costBasis = authoritativeWholesaleCost?.basis === "dealer_net"
    ? "Dealer-net source grid"
    : effectiveDealerFactor !== null
      ? `Manufacturer suggested retail x ${
          policyDealerFactor === undefined
            ? formatDealerFactor(effectiveDealerFactor)
            : policyDealerFactor.toFixed(3)
        }`
    : dealerFactor !== null
      ? `Retail x ${dealerFactor.toFixed(2)}`
      : wholesaleRate !== null
        ? `${money(wholesaleRate)} / sq ft`
        : null;

  const gridWidth = Number(options.pricing_grid_width);
  const gridHeight = Number(options.pricing_grid_height);
  const hasGridMatch = Number.isFinite(gridWidth) && Number.isFinite(gridHeight);

  return (
    <details
      className="mt-2 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700"
      aria-label="Internal pricing audit"
    >
      <summary className="cursor-pointer font-semibold text-slate-900">
        Why this price?{" "}
        {retailComponentBucketTotals ? (
          <span className="ml-1 font-normal text-slate-500">
            Base {money(retailComponentBucketTotals.base_grid)} · Fabric{" "}
            {money(retailComponentBucketTotals.fabric_upgrade)} · Accessories{" "}
            {money(retailComponentBucketTotals.accessory)} · Operating{" "}
            {money(retailComponentBucketTotals.operating_system)}
          </span>
        ) : (
          <span className="ml-1 font-normal text-slate-500">Retail + cost</span>
        )}
      </summary>

      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
        <strong>Staff-only pricing audit.</strong> This information appears only inside the CRM quote
        builder and is not included on the customer quote or contract.
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-3" aria-label="Pricing inputs">
          <h4 className="mb-1 text-sm font-bold text-slate-950">Pricing inputs</h4>
          <DetailRow label="Product" value={productType} />
          {supplier && <DetailRow label="Supplier" value={supplier} />}
          {authoritativeProgramName && (
            <DetailRow label="Program / material" value={authoritativeProgramName} />
          )}
          {widthIn > 0 && heightIn > 0 && (
            <DetailRow
              label="Measured size"
              value={`${decimalInches(widthIn)} x ${decimalInches(heightIn)} in`}
            />
          )}
          <DetailRow label="Quantity" value={quantity} />
          <DetailRow
            label="Pricing mode"
            value={
              isManual
                ? "Manual customer price"
                : authoritativeRetailBlocked
                  ? "Customer retail unavailable"
                : String(
                    options.pricing_method ||
                      (productType === "Shutters" ? "Square foot" : "Saved catalog price")
                  )
            }
          />
          {authoritativeRetailBlocked ? (
            <DetailRow label="Status" value="Customer retail blocked by source policy" />
          ) : !hasPrice ? (
            <DetailRow label="Status" value="Waiting for selections and measurements" />
          ) : null}
          {!authoritativeRetailBlocked && hasGridMatch && (
            <DetailRow label="Matched grid cell" value={`${gridWidth}\" W x ${gridHeight}\" H`} />
          )}
          {!authoritativeRetailBlocked && !!options.pricing_grid_key && (
            <DetailRow label="Pricing grid" value={String(options.pricing_grid_key)} />
          )}
          {!authoritativeRetailBlocked && options.pricing_grid_price !== undefined && (
            <DetailRow label="Grid price" value={money(options.pricing_grid_price)} />
          )}
          {!authoritativeRetailBlocked && selectedGridCatalogAmount !== null && (
            <DetailRow label="Actual selected grid" value={money(selectedGridCatalogAmount)} />
          )}
          {!authoritativeRetailBlocked && options.pricing_built_in_adjustment !== undefined && (
            <DetailRow
              label="Built-in adjustment"
              value={money(options.pricing_built_in_adjustment)}
            />
          )}
          {productType === "Shutters" && rawSqft !== null && billableSqft !== null && (
            <>
              <DetailRow label="Actual square feet" value={rawSqft.toFixed(2)} />
              <DetailRow
                label="Billable square feet"
                value={`${billableSqft.toFixed(2)} (8.00 minimum)`}
              />
            </>
          )}
        </section>

        <section className="rounded-lg border border-blue-200 bg-blue-50/50 p-3" aria-label="Retail pricing">
          <h4 className="mb-1 text-sm font-bold text-blue-950">Retail / customer price</h4>
          {authoritativeRetailBlocked ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-950">
              <strong>Customer retail is blocked.</strong>{" "}
              {typeof authoritativeRetailResult?.error === "string"
                ? authoritativeRetailResult.error
                : "The source does not define a customer retail price for this configuration."}
            </div>
          ) : (
            <>
          {productType === "Shutters" && effectiveRetailRate !== null && (
            <DetailRow label="Billed retail rate" value={`${money(effectiveRetailRate)} / sq ft`} />
          )}
          {productType === "Shutters" &&
            currentRetailPerSqft !== null &&
            effectiveRetailRate !== null &&
            Math.abs(currentRetailPerSqft - effectiveRetailRate) >= 0.01 && (
              <DetailRow
                label="Current catalog rate"
                value={`${money(currentRetailPerSqft)} / sq ft`}
              />
            )}
          {displayedRetailComponents ? (
            <div aria-label="Authoritative retail price components">
              {retailDisplayCategories.map((category) => (
                <div key={category} className="border-b border-blue-200/70 py-2 last:border-b-0">
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-blue-900">
                    {COMPONENT_CATEGORY_LABELS[category]}
                  </div>
                  {displayedRetailComponents
                    .filter((component) => component.category === category)
                    .map((component) => {
                      const detail = componentDetail(component);
                      return (
                        <div key={component.id} className="py-1">
                          <div className="flex items-start justify-between gap-4">
                            <span className="font-medium text-slate-900">{component.label}</span>
                            <strong className="text-right text-slate-950">
                              {money(component.customerAmount)}
                            </strong>
                          </div>
                          {detail && (
                            <div className="mt-0.5 text-[11px] text-slate-500">{detail}</div>
                          )}
                        </div>
                      );
                    })}
                  <div className="mt-1 flex items-start justify-between gap-4 text-[11px] text-slate-600">
                    <span>{COMPONENT_CATEGORY_LABELS[category]} subtotal</span>
                    <span>{money(componentCategoryTotal(displayedRetailComponents, category))}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <DetailRow
                label="Base price"
                value={
                  productType === "Shutters" && billableSqft !== null && effectiveRetailRate !== null
                    ? `${billableSqft.toFixed(2)} sq ft x ${money(effectiveRetailRate)} = ${money(basePrice)}`
                    : money(basePrice)
                }
              />
              {retailSurchargeLines.map((surcharge) => (
                <div key={surcharge.id} className="border-b border-blue-200/70 py-2">
                  <div className="flex items-start justify-between gap-4">
                    <span className="font-medium text-slate-900">{surcharge.name}</span>
                    <strong className="text-right text-slate-950">
                      {money(surcharge.amount)}
                    </strong>
                  </div>
                  <div className="mt-0.5 flex items-start justify-between gap-4 text-[11px] text-slate-500">
                    <span>{surcharge.detail}</span>
                  </div>
                </div>
              ))}
              <DetailRow label="Total surcharges" value={money(displayedSurchargeTotal)} />
            </>
          )}
          <DetailRow label="Price before discount" value={money(retailBeforeDiscount)} />
          {discountPercent > 0 && (
            <DetailRow
              label={`${discountPercent}% customer discount`}
              value={`- ${money(discountAmount)}`}
            />
          )}
          <DetailRow label="Final per window" value={money(finalUnitPrice)} emphasized />
          {(quantity > 1 || retailOnceTotal > 0) && (
            <DetailRow label={`Line total (${quantity} window${quantity === 1 ? "" : "s"})`} value={money(retailLineTotal)} emphasized />
          )}
          {retailOnceTotal > 0 && (
            <DetailRow label="Once-per-line customer charges" value={money(retailOnceTotal)} />
          )}
          {hasSurchargeMismatch && (
            <div className="mt-2 rounded-md border border-red-300 bg-red-50 px-2 py-1.5 text-red-900">
              <strong>Surcharge mismatch:</strong> saved surcharges total {money(savedSurchargeTotal)},
              while the visible itemized charges total {money(itemizedRetailSurcharges)}.
            </div>
          )}
          {hasRetailMismatch && (
            <div className="mt-2 rounded-md border border-red-300 bg-red-50 px-2 py-1.5 text-red-900">
              <strong>Stored price mismatch:</strong> the saved final is {money(roundMoney(savedUnitPrice))}, but
              the authoritative result is {money(expectedRetailUnit)}.
              Recalculate this line before sending it.
            </div>
          )}
            </>
          )}
        </section>

        <section className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 lg:col-span-2" aria-label="Wholesale cost">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-sm font-bold text-emerald-950">Wholesale / our cost</h4>
            <span className="text-[11px] text-emerald-800">
              Internal only · customer discounts never reduce cost
            </span>
          </div>
          {wholesaleBase === null || costBasis === null ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-950">
              No source-backed wholesale cost is loaded for this product/program yet.
            </div>
          ) : (
            <div className="grid gap-x-6 lg:grid-cols-2">
              <div>
                <DetailRow label="Cost basis" value={costBasis} />
                {authoritativeWholesaleCost?.matchedWidth !== null && authoritativeWholesaleCost?.matchedWidth !== undefined && (
                  <DetailRow
                    label="Cost source cell"
                    value={authoritativeWholesaleCost.matchedHeight == null
                      ? `${authoritativeWholesaleCost.matchedWidth}\" W`
                      : `${authoritativeWholesaleCost.matchedWidth}\" W x ${authoritativeWholesaleCost.matchedHeight}\" H`}
                  />
                )}
                {canonicalWholesaleSuccess?.source && (
                  <>
                    <DetailRow
                      label="Manufacturer source"
                      value={`${canonicalWholesaleSuccess.source.title} · ${canonicalWholesaleSuccess.source.revision}`}
                    />
                    <DetailRow
                      label="Effective date"
                      value={canonicalWholesaleSuccess.source.effectiveDate ?? "Not stated — customer pricing remains blocked"}
                    />
                    {canonicalWholesaleSuccess.source.pages.length > 0 && (
                      <DetailRow
                        label="Source pages"
                        value={canonicalWholesaleSuccess.source.pages.join(", ")}
                      />
                    )}
                    <DetailRow
                      label="Source hash"
                      value={canonicalWholesaleSuccess.source.sha256}
                    />
                  </>
                )}
                {canonicalWholesaleSuccess && (
                  <DetailRow
                    label="Ledger status"
                    value={
                      canonicalWholesaleSuccess.customerPriceEligible
                        ? "Wholesale verified; customer pricing eligible"
                        : `Internal cost only · ${canonicalWholesaleSuccess.productStatus.replaceAll("_", " ")}`
                    }
                  />
                )}
                {canonicalWholesaleSuccess?.authorityFindings?.map((finding) => (
                  <div
                    key={finding.code}
                    className="mt-2 rounded-md border border-red-300 bg-red-50 px-2 py-1.5 text-red-950"
                  >
                    <strong>{finding.summary}:</strong> {finding.detail}
                  </div>
                ))}
                {tariffPercent > 0 && !authoritativeWholesaleCost && <DetailRow label="Tariff" value={`${tariffPercent}%`} />}
                {displayedWholesaleComponents ? (
                  <div aria-label="Authoritative wholesale price components">
                    {wholesaleDisplayCategories.map((category) => (
                      <div key={category} className="border-b border-emerald-200/70 py-2 last:border-b-0">
                        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-emerald-900">
                          {COMPONENT_CATEGORY_LABELS[category]}
                        </div>
                        {displayedWholesaleComponents
                          .filter((component) => component.category === category)
                          .map((component) => {
                            const detail = wholesaleComponentDetail(component);
                            return (
                              <div key={component.id} className="py-1">
                                <div className="flex items-start justify-between gap-4">
                                  <span className="font-medium text-slate-900">{component.label} cost</span>
                                  <strong
                                    className="text-right text-[#b91c1c]"
                                    data-wholesale-cost-value="true"
                                  >
                                    {money(component.amount)}
                                  </strong>
                                </div>
                                {detail && (
                                  <div className="mt-0.5 text-[11px] text-slate-500">{detail}</div>
                                )}
                              </div>
                            );
                          })}
                        <div className="mt-1 flex items-start justify-between gap-4 text-[11px] text-slate-600">
                          <span>{COMPONENT_CATEGORY_LABELS[category]} cost subtotal</span>
                          <strong
                            className="text-right text-[#b91c1c]"
                            data-wholesale-cost-value="true"
                          >
                            {money(wholesaleComponentCategoryTotal(displayedWholesaleComponents, category))}
                          </strong>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <DetailRow label="Wholesale base" value={money(wholesaleBase)} wholesaleCost />
                    {wholesaleSurchargeLines.map((line) => (
                      <div key={line.id} className="border-b border-emerald-200/70 py-2">
                        <div className="flex items-start justify-between gap-4">
                          <span className="font-medium text-slate-900">{line.name} cost</span>
                          <strong className="text-right text-[#b91c1c]" data-wholesale-cost-value="true">
                            {money(line.amount)}
                          </strong>
                        </div>
                        <div className="mt-0.5 text-right text-[11px] text-slate-500">{line.detail}</div>
                      </div>
                    ))}
                    {canonicalBaseOnly ? (
                      <DetailRow
                        label="Wholesale add-ons"
                        value="Unresolved — protected price snapshot required"
                      />
                    ) : (
                      <DetailRow label="Total wholesale add-ons" value={money(wholesaleSurchargeTotal)} wholesaleCost />
                    )}
                  </>
                )}
              </div>
              <div>
                <DetailRow
                  label={canonicalBaseOnly ? "Known base cost per window" : "Our cost per window"}
                  value={money(wholesaleUnitCost)}
                  emphasized
                  wholesaleCost
                />
                {quantity > 1 && (
                  <DetailRow
                    label={`${canonicalBaseOnly ? "Known base line cost" : "Our line cost"} (${quantity} windows)`}
                    value={money(wholesaleLineCost)}
                    emphasized
                    wholesaleCost
                  />
                )}
                {(authoritativeWholesaleCost?.freightAllocated ?? 0) > 0 && (
                  <DetailRow
                    label="Allocated freight"
                    value={money(authoritativeWholesaleCost?.freightAllocated)}
                    wholesaleCost
                  />
                )}
                {(authoritativeWholesaleCost?.oversizeAllocated ?? 0) > 0 && (
                  <DetailRow
                    label="Allocated oversize"
                    value={money(authoritativeWholesaleCost?.oversizeAllocated)}
                    wholesaleCost
                  />
                )}
                {(authoritativeWholesaleCost?.processingFeeAllocated ?? 0) > 0 && (
                  <DetailRow
                    label="Allocated processing fee"
                    value={money(authoritativeWholesaleCost?.processingFeeAllocated)}
                    wholesaleCost
                  />
                )}
                {authoritativeWholesaleCost?.landedCostTotal !== undefined && (
                  <DetailRow
                    label="Landed line cost"
                    value={money(authoritativeWholesaleCost.landedCostTotal)}
                    emphasized
                    wholesaleCost
                  />
                )}
                {landedCostUnresolved && (
                  <DetailRow
                    label="Margin status"
                    value="Landed cost unresolved — margin withheld"
                  />
                )}
                {authoritativeRetailBlocked ? (
                  <DetailRow label="Margin status" value="Incomplete - customer retail undefined" />
                ) : (
                  <>
                    <DetailRow label="Retail line revenue" value={money(retailLineTotal)} />
                    <DetailRow
                      label="Gross profit dollars"
                      value={grossProfit === null ? "—" : money(grossProfit)}
                      emphasized
                    />
                    <DetailRow
                      label="Gross margin"
                      value={grossMargin === null ? "—" : `${grossMargin.toFixed(1)}%`}
                      emphasized
                    />
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </details>
  );
}
