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
}

export function ManufacturerProductButtons({
  products,
  selectedManufacturer,
  selectedProductId,
  onSelectManufacturer,
  onSelectProduct,
  loading = false,
}: ManufacturerProductButtonsProps) {
  const manufacturers = quoteManufacturers(products);
  const manufacturerProducts = productsForManufacturer(
    products,
    selectedManufacturer,
  );

  return (
    <div
      className="quote-add-card space-y-3 rounded-[1.5rem] border border-white/80 bg-white/70 p-3 shadow-[0_18px_45px_rgba(15,35,70,0.08)] backdrop-blur"
      aria-label="Choose manufacturer and exact product"
    >
      <div>
        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
          1. Manufacturer
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
          2. Exact product
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
