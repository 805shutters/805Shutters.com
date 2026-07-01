import { PRODUCT_TYPES } from "@mts/lib/quoteConstants";
import { cn } from "@mts/lib/utils";

interface ProductTypeButtonsProps {
  selected: string | null;
  onSelect: (type: string | null) => void;
  counts?: ReadonlyMap<string, number>;
}

export function ProductTypeButtons({ selected, onSelect, counts }: ProductTypeButtonsProps) {
  return (
    <div className="quote-add-card rounded-[1.5rem] border border-white/80 bg-white/70 p-3 shadow-[0_18px_45px_rgba(15,35,70,0.08)] backdrop-blur">
      <div className="quote-add-label mb-2 px-1 text-[0.7rem] font-black uppercase tracking-[0.22em] text-slate-500">
        Product type
      </div>
      <div className="quote-add-button-row flex flex-wrap gap-2">
        {PRODUCT_TYPES.map((type) => {
          const count = counts?.get(type) ?? 0;
          const isSelected = selected === type;

          return (
            <button
              key={type}
              onClick={() => onSelect(isSelected ? null : type)}
              className={cn(
                "quote-product-option rounded-2xl border px-4 py-2.5 text-sm font-bold text-slate-800 shadow-sm transition-all duration-200",
                isSelected
                  ? "border-[#67645e] bg-gradient-to-br from-[#67645e] to-[#343330] text-white shadow-[0_12px_24px_rgba(31,120,180,0.24)]"
                  : "border-slate-200 bg-gradient-to-br from-white to-slate-50 hover:-translate-y-0.5 hover:border-[#d6d5cf] hover:shadow-[0_12px_24px_rgba(15,35,70,0.10)]"
              )}
            >
              <span>{type}</span>
              {count > 0 && (
                <span className={cn("quote-count-badge", isSelected && "quote-count-badge--active")}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
