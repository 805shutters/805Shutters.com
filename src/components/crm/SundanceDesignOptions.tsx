"use client";
import { QuoteChoiceButtons } from "./QuoteChoiceButtons";
import { SundanceSharedAccessories } from "./SundanceSharedAccessories";
import { SundanceAssemblyOptions } from "./SundanceAssemblyOptions";
import { SundanceCellularConfiguration } from "./SundanceCellularConfiguration";
import { sundanceCellularColors, sundanceCellularColorMatchesContext } from "@/lib/quote/sundance/cellular-assortment";
import { sundanceDraperyTrackFields } from "@/lib/quote/sundance/drapery-track";
import { sundanceCellularFilterPatch, sundanceCellularSelectionPatch } from "@/lib/quote/sundance/configuration";
import { SundanceSupplementalOptions } from "./SundanceSupplementalOptions";
import { SundanceHorizontalOptions } from "./SundanceHorizontalOptions";
import { sundanceHorizontalProductIds } from "@/lib/quote/sundance/horizontal-assortment";
import { sundanceShadeProductIds } from "@/lib/quote/sundance/shade-fabrics";
import { SundanceExteriorZipOptions } from "./SundanceExteriorZipOptions";
import { SundancePortfolioOptions } from "./SundancePortfolioOptions";
import { SundanceSheerviewOptions } from "./SundanceSheerviewOptions";
import { SundanceShadeOptions } from "./SundanceShadeOptions";
import type { SalesQuoteDesign } from "@mts/types/quote";

/** Source-backed identity capture while the manufacturer's full pricing rules remain gated. */
export function SundanceDesignOptions({ design, productId, onUpdateFields, widthInches, heightInches, isAssemblyComponent = false }: {
  design: Pick<SalesQuoteDesign, "options_json"> | undefined;
  productId: string;
  isAssemblyComponent?: boolean;
  widthInches?: number; heightInches?: number;
  onUpdateFields: (fields: Partial<SalesQuoteDesign>) => void;
}) {
  const options = (design?.options_json ?? {}) as Record<string, unknown>;
  const cellular = productId === "sundance_cellular";
  const rows = sundanceCellularColors.filter(row => sundanceCellularColorMatchesContext(row, options));
  const filter = (field: "cell_size" | "light_control", value: string) =>
    onUpdateFields({fabric: null, options_json: sundanceCellularFilterPatch(options, field, value)});
  return <section className="space-y-3 rounded-lg border border-slate-200 p-3" data-testid="sundance-design-options">
    <p className="text-sm text-amber-900">Save these Sundance selections with a dealer-confirmed manual price. Configuration compatibility, accessory charges and freight still require confirmation.</p>
    {cellular ? <>
      <div className="block text-sm">Cell size<QuoteChoiceButtons aria-label="Sundance cell size" value={String(options.cell_size ?? "")} onChange={value => filter("cell_size", value)}>
        <option value="">All cell sizes</option>{[...new Set(sundanceCellularColors.map(row => row.automaticDetails.cell_size))].map(value => <option key={value} value={value}>{value}</option>)}
      </QuoteChoiceButtons></div>
      <div className="block text-sm">Light control<QuoteChoiceButtons aria-label="Sundance light control" value={String(options.light_control ?? "")} onChange={value => filter("light_control", value)}>
        <option value="">All light controls</option><option>Light Filtering</option><option>Blackout</option>
      </QuoteChoiceButtons></div>
      <div className="block text-sm">Fabric and color<QuoteChoiceButtons aria-label="Sundance fabric and color" value={String(options.fabric_color_id ?? "")} onChange={value => {
        const patch = sundanceCellularSelectionPatch(options, value);
        const row = rows.find(candidate => candidate.id === value);
        if (patch && row) onUpdateFields({fabric: `${row.collection} · ${row.colorName}`, options_json: patch});
      }}>
        <option value="">Select fabric and color</option>{rows.map(row => <option key={row.id} value={row.id}>{row.colorCode} · {row.collection} · {row.colorName} · {row.fabricType}</option>)}
      </QuoteChoiceButtons></div>
      <SundanceCellularConfiguration options={options} widthInches={widthInches} heightInches={heightInches} onUpdateFields={onUpdateFields} />
    </> : productId === "sundance_exterior_zip" ? <SundanceExteriorZipOptions options={options} onUpdateFields={onUpdateFields} /> : productId === "sundance_portfolio_roman" ? <SundancePortfolioOptions options={options} onUpdateFields={onUpdateFields} widthInches={widthInches} heightInches={heightInches} /> : productId === "sundance_sheerview" ? <SundanceSheerviewOptions options={options} onUpdateFields={onUpdateFields} widthInches={widthInches} heightInches={heightInches} /> : sundanceShadeProductIds.includes(productId) ? <SundanceShadeOptions productId={productId} options={options} onUpdateFields={onUpdateFields} widthInches={widthInches} heightInches={heightInches} /> : sundanceHorizontalProductIds.includes(productId) ? <SundanceHorizontalOptions productId={productId} options={options} onUpdateFields={onUpdateFields} widthInches={widthInches} heightInches={heightInches} /> : ["sundance_vertical_essence", "sundance_walden_premier", "sundance_walden_select"].includes(productId) ? <SundanceSupplementalOptions productId={productId} options={options} onUpdateFields={onUpdateFields} widthInches={widthInches} heightInches={heightInches} /> : sundanceDraperyTrackFields.map(field => <div key={field.id} className="block text-sm">{field.label}
      <QuoteChoiceButtons aria-label={`Sundance ${field.label}`} value={String(options[field.id] ?? "")} onChange={value => onUpdateFields({options_json: {...options, [field.id]: value || null}})}>
        <option value="">Select</option>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </QuoteChoiceButtons>
    </div>)}
    {!isAssemblyComponent && <SundanceSharedAccessories productId={productId} options={options} onChange={next=>onUpdateFields({options_json:next})} />}
    {!isAssemblyComponent && <SundanceAssemblyOptions productId={productId} options={options} widthInches={widthInches} heightInches={heightInches} onUpdateFields={onUpdateFields} renderComponent={(component, update) => <SundanceDesignOptions productId={component.productId} design={{options_json:component.configuration}} widthInches={component.widthInches ?? undefined} heightInches={component.heightInches ?? undefined} onUpdateFields={update} isAssemblyComponent />} />}
  </section>;
}
