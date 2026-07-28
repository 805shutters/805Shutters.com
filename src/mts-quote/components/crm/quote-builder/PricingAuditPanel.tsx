import type { ReactNode } from "react";
import { cn } from "@mts/lib/utils";

export type PricingAuditSurcharge = {
  id: string;
  name: string;
  type: "percentage" | "fixed";
  value: number;
  quantity: number;
  category: string;
  automatic: boolean;
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
}: {
  label: string;
  value: ReactNode;
  emphasized?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200/80 py-1.5 last:border-b-0">
      <span className="text-slate-600">{label}</span>
      <span className={cn("text-right text-slate-900", emphasized && "font-bold")}>{value}</span>
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
}: PricingAuditPanelProps) {
  const isManual = options.manual_price_override === true;
  const hasStoredPricing =
    options.base_price !== undefined ||
    options.pricing_grid_width !== undefined ||
    options.surcharge_total !== undefined ||
    options.discount_percent !== undefined;
  const hasPrice = hasStoredPricing || isManual || savedUnitPrice > 0;
  const basePrice = Number(options.base_price) || 0;
  const discountPercent = Number(options.discount_percent) || 0;
  const discountAmount = Number(options.discount_amount) || 0;
  const itemizedRetailSurcharges = roundMoney(
    surcharges.reduce((sum, surcharge) => sum + surchargeAmount(basePrice, surcharge), 0)
  );
  const hasSavedSurchargeTotal = Number.isFinite(Number(options.surcharge_total));
  const savedSurchargeTotal = Number(options.surcharge_total) || 0;
  const displayedSurchargeTotal = hasSavedSurchargeTotal
    ? savedSurchargeTotal
    : itemizedRetailSurcharges;
  const retailBeforeDiscount = roundMoney(basePrice + displayedSurchargeTotal);
  const finalUnitPrice = roundMoney(savedUnitPrice);
  const retailLineTotal = roundMoney(finalUnitPrice * quantity);
  const expectedRetailUnit = roundMoney(retailBeforeDiscount - discountAmount);
  const hasRetailMismatch =
    hasPrice && !isManual && basePrice > 0 && Math.abs(expectedRetailUnit - finalUnitPrice) >= 0.01;
  const hasSurchargeMismatch =
    hasSavedSurchargeTotal && Math.abs(savedSurchargeTotal - itemizedRetailSurcharges) >= 0.01;
  const effectiveRetailRate =
    billableSqft && basePrice > 0
      ? roundMoney(basePrice / billableSqft)
      : currentRetailPerSqft;

  const wholesaleBase =
    wholesaleRate !== null && billableSqft !== null
      ? roundMoney(billableSqft * wholesaleRate * (1 + tariffPercent / 100))
      : null;
  const wholesaleSurchargeLines =
    wholesaleBase === null
      ? []
      : surcharges.map((surcharge) => ({
          surcharge,
          amount: surchargeAmount(wholesaleBase, surcharge),
        }));
  const wholesaleSurchargeTotal = roundMoney(
    wholesaleSurchargeLines.reduce((sum, line) => sum + line.amount, 0)
  );
  const wholesaleUnitCost =
    wholesaleBase === null ? null : roundMoney(wholesaleBase + wholesaleSurchargeTotal);
  const wholesaleLineCost =
    wholesaleUnitCost === null ? null : roundMoney(wholesaleUnitCost * quantity);
  const grossProfit =
    wholesaleLineCost === null ? null : roundMoney(retailLineTotal - wholesaleLineCost);
  const grossMargin =
    grossProfit === null || retailLineTotal <= 0
      ? null
      : roundMoney((grossProfit / retailLineTotal) * 100);

  const gridWidth = Number(options.pricing_grid_width);
  const gridHeight = Number(options.pricing_grid_height);
  const hasGridMatch = Number.isFinite(gridWidth) && Number.isFinite(gridHeight);

  return (
    <details
      className="mt-2 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700"
      aria-label="Internal pricing audit"
    >
      <summary className="cursor-pointer font-semibold text-slate-900">
        Why this price? <span className="ml-1 font-normal text-slate-500">Retail + cost</span>
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
          {programName && <DetailRow label="Program / material" value={programName} />}
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
                : String(
                    options.pricing_method ||
                      (productType === "Shutters" ? "Square foot" : "Saved catalog price")
                  )
            }
          />
          {!hasPrice && <DetailRow label="Status" value="Waiting for selections and measurements" />}
          {hasGridMatch && (
            <DetailRow label="Matched grid cell" value={`${gridWidth}\" W x ${gridHeight}\" H`} />
          )}
          {!!options.pricing_grid_key && (
            <DetailRow label="Pricing grid" value={String(options.pricing_grid_key)} />
          )}
          {options.pricing_grid_price !== undefined && (
            <DetailRow label="Grid price" value={money(options.pricing_grid_price)} />
          )}
          {options.pricing_built_in_adjustment !== undefined && (
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
          <DetailRow
            label="Base price"
            value={
              productType === "Shutters" && billableSqft !== null && effectiveRetailRate !== null
                ? `${billableSqft.toFixed(2)} sq ft x ${money(effectiveRetailRate)} = ${money(basePrice)}`
                : money(basePrice)
            }
          />
          {surcharges.map((surcharge) => (
            <div key={surcharge.id} className="border-b border-blue-200/70 py-2">
              <div className="flex items-start justify-between gap-4">
                <span className="font-medium text-slate-900">{surcharge.name}</span>
                <strong className="text-right text-slate-950">
                  {money(surchargeAmount(basePrice, surcharge))}
                </strong>
              </div>
              <div className="mt-0.5 flex items-start justify-between gap-4 text-[11px] text-slate-500">
                <span>{surcharge.category} · {surcharge.automatic ? "Automatic" : "Added manually"}</span>
                <span className="text-right">{surchargeFormula(basePrice, surcharge)}</span>
              </div>
            </div>
          ))}
          <DetailRow label="Total surcharges" value={money(displayedSurchargeTotal)} />
          <DetailRow label="Price before discount" value={money(retailBeforeDiscount)} />
          {discountPercent > 0 && (
            <DetailRow
              label={`${discountPercent}% customer discount`}
              value={`- ${money(discountAmount)}`}
            />
          )}
          <DetailRow label="Final per window" value={money(finalUnitPrice)} emphasized />
          {quantity > 1 && (
            <DetailRow label={`Line total (${quantity} windows)`} value={money(retailLineTotal)} emphasized />
          )}
          {hasSurchargeMismatch && (
            <div className="mt-2 rounded-md border border-red-300 bg-red-50 px-2 py-1.5 text-red-900">
              <strong>Surcharge mismatch:</strong> saved surcharges total {money(savedSurchargeTotal)},
              while the visible itemized charges total {money(itemizedRetailSurcharges)}.
            </div>
          )}
          {hasRetailMismatch && (
            <div className="mt-2 rounded-md border border-red-300 bg-red-50 px-2 py-1.5 text-red-900">
              <strong>Stored price mismatch:</strong> the saved final is {money(finalUnitPrice)}, but
              the displayed base, surcharges, and discount calculate to {money(expectedRetailUnit)}.
              Recalculate this line before sending it.
            </div>
          )}
        </section>

        <section className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 lg:col-span-2" aria-label="Wholesale cost">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-sm font-bold text-emerald-950">Wholesale / our cost</h4>
            <span className="text-[11px] text-emerald-800">
              Internal only · customer discounts never reduce cost
            </span>
          </div>
          {wholesaleBase === null || wholesaleRate === null ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-950">
              No source-backed wholesale cost is loaded for this product/program yet.
            </div>
          ) : (
            <div className="grid gap-x-6 lg:grid-cols-2">
              <div>
                <DetailRow label="Wholesale rate" value={`${money(wholesaleRate)} / sq ft`} />
                {tariffPercent > 0 && <DetailRow label="Tariff" value={`${tariffPercent}%`} />}
                <DetailRow
                  label="Wholesale base"
                  value={`${billableSqft?.toFixed(2)} sq ft x ${money(wholesaleRate)}${
                    tariffPercent > 0 ? ` + ${tariffPercent}% tariff` : ""
                  } = ${money(wholesaleBase)}`}
                />
                {wholesaleSurchargeLines.map(({ surcharge, amount }) => (
                  <div key={surcharge.id} className="border-b border-emerald-200/70 py-2">
                    <div className="flex items-start justify-between gap-4">
                      <span className="font-medium text-slate-900">{surcharge.name} cost</span>
                      <strong className="text-right text-slate-950">{money(amount)}</strong>
                    </div>
                    <div className="mt-0.5 text-right text-[11px] text-slate-500">
                      {surchargeFormula(wholesaleBase, surcharge)}
                    </div>
                  </div>
                ))}
                <DetailRow label="Total wholesale add-ons" value={money(wholesaleSurchargeTotal)} />
              </div>
              <div>
                <DetailRow label="Our cost per window" value={money(wholesaleUnitCost)} emphasized />
                {quantity > 1 && (
                  <DetailRow
                    label={`Our line cost (${quantity} windows)`}
                    value={money(wholesaleLineCost)}
                    emphasized
                  />
                )}
                <DetailRow label="Retail line revenue" value={money(retailLineTotal)} />
                <DetailRow label="Gross profit dollars" value={money(grossProfit)} emphasized />
                <DetailRow
                  label="Gross margin"
                  value={grossMargin === null ? "—" : `${grossMargin.toFixed(1)}%`}
                  emphasized
                />
              </div>
            </div>
          )}
        </section>
      </div>
    </details>
  );
}
