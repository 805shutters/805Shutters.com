import { PRODUCT_TYPES } from "@mts/lib/quoteConstants";
import { cn } from "@mts/lib/utils";

interface ProductTypeButtonsProps {
  selected: string | null;
  onSelect: (type: string | null) => void;
}

export function ProductTypeButtons({ selected, onSelect }: ProductTypeButtonsProps) {
  return (
    <div className="rounded-[1.5rem] border border-white/80 bg-white/70 p-3 shadow-[0_18px_45px_rgba(15,35,70,0.08)] backdrop-blur">
      <div className="mb-2 px-1 text-[0.7rem] font-black uppercase tracking-[0.22em] text-slate-500">
        Product line
      </div>
      <div className="flex flex-wrap gap-2">
        {PRODUCT_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => onSelect(selected === type ? null : type)}
            className={cn(
              "rounded-2xl border px-4 py-2.5 text-sm font-bold text-slate-800 shadow-sm transition-all duration-200",
              selected === type
                ? "border-[#1f78b4] bg-gradient-to-br from-[#1f78b4] to-[#0e4f82] text-white shadow-[0_12px_24px_rgba(31,120,180,0.24)]"
                : "border-slate-200 bg-gradient-to-br from-white to-slate-50 hover:-translate-y-0.5 hover:border-[#8abce5] hover:shadow-[0_12px_24px_rgba(15,35,70,0.10)]"
            )}
          >
            {type}
          </button>
        ))}
      </div>
    </div>
  );
}
