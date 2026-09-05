"use client";

import { useEffect, useState, type ReactNode } from "react";
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

export type ChoiceGroupAction<T extends string> = { toggleExpanded: boolean; nextValue?: T | null };

export function choiceGroupAction<T extends string>(choice: T, isSelected: boolean, compact: boolean): ChoiceGroupAction<T> {
  if (isSelected) return compact ? { toggleExpanded: true } : { toggleExpanded: false, nextValue: null };
  return { toggleExpanded: false, nextValue: choice };
}

type ChoiceGroupProps<T extends string> = {
  choices: T[];
  selected: T | null | undefined;
  compact: boolean;
  label: string;
  className?: string;
  renderChoice: (choice: T, selected: boolean) => ReactNode;
  choiceLabel?: (choice: T) => string;
  buttonClassName?: (selected: boolean) => string;
  catalogProductIds?: boolean;
  onChange: (choice: T | null) => void;
};

function ChoiceGroup<T extends string>({ choices, selected, compact, label, className, renderChoice, choiceLabel = (choice) => choice, buttonClassName, catalogProductIds = false, onChange }: ChoiceGroupProps<T>) {
  const valid = Boolean(selected && choices.includes(selected));
  const [expanded, setExpanded] = useState(() => !compact || !valid);

  useEffect(() => {
    if (!compact) setExpanded(true);
    else if (!valid) setExpanded(true);
  }, [compact, valid, choices]);

  const visible = compact && valid && !expanded ? [selected as T] : choices;
  return <div className={cn("quote-add-button-row flex flex-wrap gap-1.5", className)} role="group" aria-label={label}>
    {visible.map((choice) => {
      const isSelected = choice === selected;
      return <button
        key={choice}
        type="button"
        aria-pressed={isSelected}
        aria-expanded={compact && isSelected ? expanded : undefined}
        aria-label={compact && isSelected ? `${label}: ${choiceLabel(choice)}. ${expanded ? "Choose an option" : "Show choices"}` : undefined}
        data-catalog-product-id={catalogProductIds ? choice : undefined}
        onClick={() => {
          const action = choiceGroupAction(choice, isSelected, compact);
          if (action.toggleExpanded) setExpanded((open) => !open);
          else {
            onChange(action.nextValue!);
            if (compact) setExpanded(false);
          }
        }}
        className={buttonClassName ? buttonClassName(isSelected) : cn(
          "min-h-11 rounded-lg border px-3 py-2 text-xs font-bold",
          isSelected ? "border-black bg-black text-white" : "border-zinc-300 bg-white text-zinc-900",
        )}
      >{renderChoice(choice, isSelected)}</button>;
    })}
  </div>;
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
  const manufacturerProducts = productsForManufacturer(familyProducts, selectedManufacturer);
  const manufacturer = selectedManufacturer && manufacturers.includes(selectedManufacturer) ? selectedManufacturer : null;
  const productIds = manufacturerProducts.map((product) => product.id);
  const productId = selectedProductId && productIds.includes(selectedProductId) ? selectedProductId : null;

  if (!compactMobile) {
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

  return (
    <div
      className={cn("quote-add-card space-y-3 border border-white/80 bg-white/70 shadow-[0_18px_45px_rgba(15,35,70,0.08)] backdrop-blur", compactMobile ? "rounded-xl p-2" : "rounded-[1.5rem] p-3")}
      aria-label="Choose manufacturer and exact product"
    >
      {onSelectMobileProductFamily && <div>
        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">1. Product family</div>
        <ChoiceGroup
          choices={productFamilies}
          selected={mobileProductFamily}
          compact={compactMobile}
          label="Product family"
          renderChoice={(family) => family}
          onChange={(family) => {
            onSelectMobileProductFamily(family);
            onSelectManufacturer(null);
            onSelectProduct(null);
          }}
        />
      </div>}
      <div>
        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
          {onSelectMobileProductFamily ? "2. Manufacturer" : "1. Manufacturer"}
        </div>
        {loading ? <span className="px-2 py-2 text-sm font-semibold text-slate-500">Loading manufacturer catalog…</span> : <ChoiceGroup
          choices={manufacturers}
          selected={manufacturer}
          compact={compactMobile}
          label="Manufacturer"
          className="gap-2"
          renderChoice={(choice) => choice}
          buttonClassName={(isSelected) => cn(
            "quote-product-option rounded-2xl border px-4 py-2.5 text-sm font-bold shadow-sm transition-all duration-200",
            isSelected
              ? "quote-product-option--selected border-[#67645e] bg-gradient-to-br from-[#67645e] to-[#343330] text-white shadow-[0_12px_24px_rgba(31,120,180,0.24)]"
              : "border-slate-200 bg-gradient-to-br from-white to-slate-50 text-slate-800 hover:-translate-y-0.5 hover:border-[#d6d5cf] hover:shadow-[0_12px_24px_rgba(15,35,70,0.10)]",
          )}
          onChange={onSelectManufacturer}
        />}
      </div>

      <div>
        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
          {onSelectMobileProductFamily ? "3. Exact product" : "2. Exact product"}
        </div>
        {!manufacturer ? (
          <p className="px-1 text-sm font-medium text-slate-500">Select a manufacturer to see only its independent products.</p>
        ) : (
          <ChoiceGroup
            choices={productIds}
            selected={productId}
            compact={compactMobile}
            label="Exact product"
            className="gap-2"
            choiceLabel={(id) => quoteProductLabel(manufacturerProducts.find((candidate) => candidate.id === id)!)}
            catalogProductIds
            buttonClassName={(isSelected) => cn(
              "quote-product-option rounded-2xl border px-4 py-2.5 text-left text-sm font-bold shadow-sm transition-all duration-200",
              isSelected
                ? "quote-product-option--selected border-[#67645e] bg-gradient-to-br from-[#67645e] to-[#343330] text-white shadow-[0_12px_24px_rgba(31,120,180,0.24)]"
                : "border-slate-200 bg-gradient-to-br from-white to-slate-50 text-slate-800 hover:-translate-y-0.5 hover:border-[#d6d5cf] hover:shadow-[0_12px_24px_rgba(15,35,70,0.10)]",
            )}
            onChange={onSelectProduct}
            renderChoice={(id, isSelected) => {
              const product = manufacturerProducts.find((candidate) => candidate.id === id)!;
              return <>
                <span className="block">{quoteProductLabel(product)}</span>
                <span className={cn("mt-0.5 block text-[10px] font-black uppercase tracking-[0.12em]", isSelected ? "text-white/70" : "text-slate-400")}>· {product.productType}{product.priceBasis === "manual_required" ? " · Quote only" : ""}</span>
              </>;
            }}
          />
        )}
      </div>
    </div>
  );
}
