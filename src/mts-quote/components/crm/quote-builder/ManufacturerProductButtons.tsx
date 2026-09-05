import type { QuoteLabCatalogProduct } from "@/lib/quote-lab/types";
import { cn } from "@mts/lib/utils";
import {
  productsForManufacturer,
  quoteManufacturers,
  quoteProductLabel,
} from "@mts/lib/manufacturerProductWorkflow";

interface ManufacturerProductButtonsProps {
  products: QuoteLabCatalogProduct[];
  selectedManufacturer: string | null;
  selectedProductId: string | null;
  onSelectManufacturer: (manufacturer: string | null) => void;
  onSelectProduct: (productId: string | null) => void;
  loading?: boolean;
  mobileProductFamily?: string | null;
  onSelectMobileProductFamily?: (productType: string | null) => void;
  compactMobile?: boolean;
}

export function ManufacturerProductButtons({
  products,
  selectedManufacturer,
  selectedProductId,
  onSelectManufacturer,
  onSelectProduct,
  loading = false,
  mobileProductFamily,
  onSelectMobileProductFamily,
  compactMobile = false,
}: ManufacturerProductButtonsProps) {
  const productFamilies = Array.from(new Set(products.map((product) => product.productType))).sort();
  const familyProducts = onSelectMobileProductFamily
    ? (mobileProductFamily ? products.filter((product) => product.productType === mobileProductFamily) : [])
    : products;
  const manufacturers = quoteManufacturers(familyProducts);
  const manufacturerProducts = productsForManufacturer(
    familyProducts,
    selectedManufacturer,
  );

  return (
    <div
      className={cn("quote-add-card space-y-3 border border-white/80 bg-white/70 shadow-[0_18px_45px_rgba(15,35,70,0.08)] backdrop-blur", compactMobile ? "rounded-xl p-2" : "rounded-[1.5rem] p-3")}
      aria-label="Choose manufacturer and exact product"
    >
      {onSelectMobileProductFamily && <div>
        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">1. Product family</div>
        <div className="quote-add-button-row flex flex-wrap gap-1.5">
          {productFamilies.map((family) => {
            const selected = family === mobileProductFamily;
            return <button key={family} type="button" aria-pressed={selected} onClick={() => { onSelectMobileProductFamily(selected ? null : family); onSelectManufacturer(null); onSelectProduct(null); }} className={cn("min-h-11 rounded-lg border px-3 py-2 text-xs font-bold", selected ? "border-black bg-black text-white" : "border-zinc-300 bg-white text-zinc-900")}>{family}</button>;
          })}
        </div>
      </div>}
      <div>
        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
          {onSelectMobileProductFamily ? "2. Manufacturer" : "1. Manufacturer"}
        </div>
        <div className="quote-add-button-row flex flex-wrap gap-2">
          {loading ? (
            <span className="px-2 py-2 text-sm font-semibold text-slate-500">
              Loading manufacturer catalog…
            </span>
          ) : (
            manufacturers.map((manufacturer) => {
              const isSelected = manufacturer === selectedManufacturer;
              return (
                <button
                  key={manufacturer}
                  type="button"
                  onClick={() =>
                    onSelectManufacturer(isSelected ? null : manufacturer)
                  }
                  className={cn(
                    "quote-product-option rounded-2xl border px-4 py-2.5 text-sm font-bold shadow-sm transition-all duration-200",
                    isSelected
                      ? "quote-product-option--selected border-[#67645e] bg-gradient-to-br from-[#67645e] to-[#343330] text-white shadow-[0_12px_24px_rgba(31,120,180,0.24)]"
                      : "border-slate-200 bg-gradient-to-br from-white to-slate-50 text-slate-800 hover:-translate-y-0.5 hover:border-[#d6d5cf] hover:shadow-[0_12px_24px_rgba(15,35,70,0.10)]",
                  )}
                  aria-pressed={isSelected}
                >
                  {manufacturer}
                </button>
              );
            })
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
          {onSelectMobileProductFamily ? "3. Exact product" : "2. Exact product"}
        </div>
        {!selectedManufacturer ? (
          <p className="px-1 text-sm font-medium text-slate-500">
            Select a manufacturer to see only its independent products.
          </p>
        ) : (
          <div className="quote-add-button-row flex flex-wrap gap-2">
            {manufacturerProducts.map((product) => {
              const isSelected = product.id === selectedProductId;
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => onSelectProduct(isSelected ? null : product.id)}
                  className={cn(
                    "quote-product-option rounded-2xl border px-4 py-2.5 text-left text-sm font-bold shadow-sm transition-all duration-200",
                    isSelected
                      ? "quote-product-option--selected border-[#67645e] bg-gradient-to-br from-[#67645e] to-[#343330] text-white shadow-[0_12px_24px_rgba(31,120,180,0.24)]"
                      : "border-slate-200 bg-gradient-to-br from-white to-slate-50 text-slate-800 hover:-translate-y-0.5 hover:border-[#d6d5cf] hover:shadow-[0_12px_24px_rgba(15,35,70,0.10)]",
                  )}
                  aria-pressed={isSelected}
                  data-catalog-product-id={product.id}
                >
                  <span className="block">{quoteProductLabel(product)}</span>
                  <span
                    className={cn(
                      "mt-0.5 block text-[10px] font-black uppercase tracking-[0.12em]",
                      isSelected ? "text-white/70" : "text-slate-400",
                    )}
                  >
                    · {product.productType}
                    {product.priceBasis === "manual_required"
                      ? " · Quote only"
                      : ""}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
