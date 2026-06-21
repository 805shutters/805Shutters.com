"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type {
  UiPricingReference,
  UiPricingReferenceMotorizationGroup,
  UiPricingReferenceProduct,
  UiPricingReferenceProgram,
  UiReferenceSurcharge,
} from "@/lib/quote/ui-catalog";

type Props = {
  session: Session;
};

const PRODUCT_ORDER = [
  "honeycomb",
  "vertical_honeycomb",
  "roller",
  "roman",
  "perfectsheer",
  "smartdrape",
  "smartfold",
  "synchrony_vertical",
  "faux_wood",
  "smartprivacy_faux",
  "wood_blinds",
  "citylights_aluminum",
  "norman_shutters",
  "onyx_shutters",
  "palladian_shelf",
];

async function crmApi<T>(session: Session, path: string): Promise<T> {
  const res = await fetch(path, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof body?.message === "string"
        ? body.message
        : typeof body?.error === "string"
          ? body.error
          : "Request failed.";
    throw new Error(message);
  }
  return body as T;
}

function money(value: number | null | undefined, fractionDigits?: number) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  const numeric = Number(value);
  const digits = fractionDigits ?? (Number.isInteger(numeric) ? 0 : 2);
  return numeric.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatCharge(surcharge: UiReferenceSurcharge) {
  if (surcharge.widthGraduated) return "By width";
  if (surcharge.value == null) return "Varies";
  if (surcharge.kind === "percent") return `${surcharge.value}%`;
  const per = surcharge.per === "unit" ? "" : `/${surcharge.per}`;
  return `${money(surcharge.value)}${per}`;
}

function formatMotorPrice(option: UiPricingReferenceMotorizationGroup["options"][number]) {
  const mapped = option.priceByProduct ? Object.values(option.priceByProduct) : [];
  const mappedPrices = mapped.filter((price): price is number => typeof price === "number" && Number.isFinite(price));
  if (mappedPrices.length) {
    const min = Math.min(...mappedPrices);
    const max = Math.max(...mappedPrices);
    const range = min === max ? money(min) : `${money(min)}-${money(max)}`;
    return mapped.some((price) => price == null) ? `${range}; N/A by product` : range;
  }
  return money(option.price);
}

function productRank(productId: string) {
  const index = PRODUCT_ORDER.indexOf(productId);
  return index === -1 ? PRODUCT_ORDER.length : index;
}

function sortProducts(products: UiPricingReferenceProduct[]) {
  return [...products].sort((a, b) => {
    const rank = productRank(a.productId) - productRank(b.productId);
    return rank || a.productName.localeCompare(b.productName);
  });
}

function productLabel(product: UiPricingReferenceProduct) {
  return product.productName.replace("Ultimate ", "").replace("Cordless ", "");
}

export function PricingGuidePanel({ session }: Props) {
  const [reference, setReference] = useState<UiPricingReference | null>(null);
  const [activeProductId, setActiveProductId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    crmApi<{ reference: UiPricingReference }>(session, "/api/crm/quote-catalog/reference")
      .then(({ reference: nextReference }) => {
        if (!active) return;
        const products = sortProducts(nextReference.products);
        setReference(nextReference);
        setActiveProductId((current) =>
          current && products.some((product) => product.productId === current)
            ? current
            : products.find((product) => product.productId === "honeycomb")?.productId || products[0]?.productId || "",
        );
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Pricing guide could not load.");
      });
    return () => {
      active = false;
    };
  }, [session]);

  const products = useMemo(() => sortProducts(reference?.products || []), [reference]);
  const programsByProduct = useMemo(() => {
    const map = new Map<string, UiPricingReferenceProgram[]>();
    for (const program of reference?.programs || []) {
      const existing = map.get(program.productId) || [];
      existing.push(program);
      map.set(program.productId, existing);
    }
    return map;
  }, [reference]);

  const activeProduct = products.find((product) => product.productId === activeProductId) || products[0];
  const activePrograms = activeProduct ? programsByProduct.get(activeProduct.productId) || [] : [];

  if (error) {
    return (
      <section className="crm-ledger crm-pricing-guide">
        <p className="crm-empty">{error}</p>
      </section>
    );
  }

  if (!reference || !activeProduct) {
    return (
      <section className="crm-ledger crm-pricing-guide">
        <p className="crm-empty">Loading pricing guide...</p>
      </section>
    );
  }

  return (
    <section className="crm-ledger crm-pricing-guide">
      <div className="crm-section-head crm-pricing-head">
        <div>
          <p className="eyebrow">Pricing Guide</p>
          <h2>{reference.source}</h2>
          <strong>{reference.effectiveDate || "Current catalog"}</strong>
        </div>
      </div>

      <div className="crm-pricing-tabs" role="tablist" aria-label="Pricing product groups">
        {products.map((product) => {
          const count = programsByProduct.get(product.productId)?.length || 0;
          return (
            <button
              type="button"
              role="tab"
              aria-selected={activeProduct.productId === product.productId}
              className={activeProduct.productId === product.productId ? "active" : ""}
              key={product.productId}
              onClick={() => setActiveProductId(product.productId)}
            >
              {productLabel(product)}
              <span>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="crm-pricing-product-head">
        <div>
          <h3>{activeProduct.productName}</h3>
          <p>
            {activeProduct.productType.replaceAll("_", " ")}
            {activeProduct.provisional ? " - provisional MTS pricing" : ""}
          </p>
        </div>
        {activeProduct.source ? <span>{activeProduct.source}</span> : null}
      </div>

      <div className="crm-pricing-programs">
        {activePrograms.map((program) => (
          <ProgramPricingCard key={program.programId} program={program} />
        ))}
      </div>

      <SurchargeTable title="Product Surcharges" surcharges={activeProduct.surcharges} />
      <SurchargeTable title="Global Surcharges" surcharges={reference.globalSurcharges} />
      <MotorizationReference groups={reference.motorization} />
    </section>
  );
}

function ProgramPricingCard({ program }: { program: UiPricingReferenceProgram }) {
  return (
    <article className="crm-pricing-program-card">
      <header>
        <div>
          <h4>{program.programName}</h4>
          <p>
            {program.priceAxis === "sqft" ? "Square foot pricing" : program.priceAxis === "width" ? "Width grid" : "Width x height grid"}
            {program.priceGroup ? ` - Group ${program.priceGroup}` : ""}
          </p>
        </div>
        <span>
          {program.maxWidth ? `Max W ${program.maxWidth}"` : "No width cap"}
          {program.maxHeight ? ` / Max H ${program.maxHeight}"` : ""}
        </span>
      </header>
      {program.priceAxis === "sqft" ? <SqftPricing program={program} /> : <PriceGridTable program={program} />}
      {program.notes.length ? (
        <ul className="crm-pricing-notes">
          {program.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function SqftPricing({ program }: { program: UiPricingReferenceProgram }) {
  return (
    <div className="crm-pricing-sqft">
      <div>
        <span>Retail</span>
        <strong>{program.pricePerSqft == null ? "-" : `${money(program.pricePerSqft, 2)}/sqft`}</strong>
      </div>
      <div>
        <span>Our cost</span>
        <strong className="crm-pricing-cost-value">
          {program.costPerSqft == null ? "-" : `${money(program.costPerSqft, 2)}/sqft`}
        </strong>
      </div>
      <div>
        <span>Minimum</span>
        <strong>{program.minSqft ? `${program.minSqft} sqft` : "-"}</strong>
      </div>
    </div>
  );
}

function PriceGridTable({ program }: { program: UiPricingReferenceProgram }) {
  const rows =
    program.priceAxis === "width"
      ? [{ label: "Price", prices: program.prices[0] || [], costs: program.costs[0] || [] }]
      : program.heights.map((height, index) => ({
          label: `${height}"`,
          prices: program.prices[index] || [],
          costs: program.costs[index] || [],
        }));

  if (!program.widths.length || !rows.length) {
    return <p className="crm-empty">No grid data for this program.</p>;
  }

  return (
    <div className="crm-pricing-grid-wrap">
      <div className="crm-pricing-grid-legend">
        <span>Retail grid price</span>
        <strong>Cost appears only when source-backed</strong>
      </div>
      <table className="crm-pricing-grid">
        <thead>
          <tr>
            <th>{program.priceAxis === "width" ? "Width" : "Height / Width"}</th>
            {program.widths.map((width) => (
              <th key={width}>{width}"</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th>{row.label}</th>
              {program.widths.map((width, index) => {
                const price = row.prices[index];
                const cost = row.costs[index];
                return (
                  <td key={`${row.label}-${width}`}>
                    <PriceCell price={price} cost={cost} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PriceCell({ price, cost }: { price: number | null | undefined; cost: number | null | undefined }) {
  if (price == null) return <span className="crm-pricing-empty-cell">-</span>;
  if (cost == null) {
    return (
      <span className="crm-pricing-price-pair" aria-label={`Retail ${money(price)}. No source-backed cost.`}>
        <span className="crm-pricing-retail-price">{money(price)}</span>
      </span>
    );
  }
  return (
    <span
      className="crm-pricing-price-pair"
      aria-label={`Retail ${money(price)}. Our cost ${money(cost)}.`}
    >
      <span className="crm-pricing-retail-price">{money(price)}</span>
      <span className="crm-pricing-cost-price">({money(cost)})</span>
    </span>
  );
}

function SurchargeTable({ title, surcharges }: { title: string; surcharges: UiReferenceSurcharge[] }) {
  if (!surcharges.length) return null;
  return (
    <section className="crm-pricing-reference-block">
      <h3>{title}</h3>
      <div className="crm-pricing-reference-table-wrap">
        <table className="crm-pricing-reference-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Charge</th>
              <th>Applies</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {surcharges.map((surcharge) => (
              <tr key={surcharge.id}>
                <td>{surcharge.name}</td>
                <td>{formatCharge(surcharge)}</td>
                <td>{surcharge.appliesTo || "-"}</td>
                <td>{surcharge.notes || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MotorizationReference({ groups }: { groups: UiPricingReferenceMotorizationGroup[] }) {
  if (!groups.length) return null;
  return (
    <section className="crm-pricing-reference-block">
      <h3>Motorization Options</h3>
      <div className="crm-pricing-motor-grid">
        {groups.map((group) => (
          <article key={group.groupId}>
            <h4>{group.name}</h4>
            <div>
              {group.options.map((option) => (
                <span key={option.id}>
                  {option.name}
                  <strong>{formatMotorPrice(option)}</strong>
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
