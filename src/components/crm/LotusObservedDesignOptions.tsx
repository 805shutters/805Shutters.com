"use client";
import { LOTUS_PARTS_VERSION, lotusPartModelProfile } from "@/lib/quote/lotus-parts";
import { useMemo, useState } from "react";
import type { SalesQuoteDesign } from "@mts/types/quote";
import { lotusObservedOfferings, lotusObservedOffering, LOTUS_OBSERVED_VERSION } from "@/lib/quote/lotus-observed-offerings";
export function LotusObservedDesignOptions({ design, productId, onUpdateFields, pricingOnly = false }: {
  pricingOnly?: boolean;
  design: SalesQuoteDesign | undefined; productId: string; onUpdateFields: (fields: Partial<SalesQuoteDesign>) => void;
}) {
  const [search, setSearch] = useState("");
  const options = (design?.options_json ?? {}) as Record<string, unknown>;
  const selected = lotusObservedOffering(String(options.lotus_observed_offering_id ?? ""));
  const partProfile = lotusPartModelProfile(selected?.id);
  const choices = useMemo(() => lotusObservedOfferings.filter(row => row.productId === productId && !row.discontinued &&
    (!search.trim() || `${row.sku ?? ""} ${row.label}`.toLowerCase().includes(search.trim().toLowerCase()))), [productId, search]);
  return <section className="space-y-3 rounded-lg border border-amber-300 p-3" data-testid="lotus-observed-options">
    <p className="font-semibold">Dealer-listed Lotus item</p>
    <p>{pricingOnly ? "Choose the exact item. Price confirmation required." : "Choose the exact listing. Current availability, compatible options and price require confirmation."}</p>
    <label className="block text-sm">Find by SKU, color or description
      <input aria-label="Find Lotus dealer item" className="w-full rounded border p-2" value={search} onChange={event => setSearch(event.target.value)} />
    </label>
    <label className="block text-sm">Dealer item
      <select aria-label="Lotus dealer item" className="w-full rounded border p-2" value={selected?.id ?? ""} onChange={event => {
        const row = lotusObservedOffering(event.target.value);
        if (!row || row.discontinued || row.productId !== productId) return;
        onUpdateFields({ supplier: "Lotus", material: row.label, fabric: null, unit_price: 0,
          options_json: { ...options, catalog_product_id: row.productId, quote_lab_product_id: row.productId,
            catalog_program_id: `${row.productId}_item`, quote_lab_program_id: `${row.productId}_item`,
            lotus_observed_version: LOTUS_OBSERVED_VERSION, lotus_observed_offering_id: row.id,
            lotus_dealer_sku: row.sku, lotus_dealer_description: row.label, lotus_dealer_source_url: row.sourceUrl,
            lotus_dealer_observed_date: row.observedDate, lotus_dealer_effective_date: null,
            lotus_part_configuration_version: lotusPartModelProfile(row.id) ? LOTUS_PARTS_VERSION : null,
            lotus_part_target_model: null, lotus_part_installed_reference: null,
            manual_price_override: false, surcharges: [], motorization_selections: [] } });
      }}>
        <option value="">Select dealer-listed item</option>
        {selected && !choices.some(row => row.id === selected.id) && <option value={selected.id}>{selected.label}{selected.discontinued ? " — discontinued" : ""}</option>}
        {choices.map(row => <option key={row.id} value={row.id}>{row.sku ? `${row.sku} — ` : "No published SKU — "}{row.label} ({row.kind})</option>)}
      </select>
    </label>
    {!pricingOnly && <p className="text-sm">{choices.length} matching listings observed September 20, 2026. Effective date not supplied.</p>}
    {partProfile && <div className="space-y-2"><label className="block text-sm">Intended installed model<select aria-label="Lotus part intended model" className="w-full rounded border p-2" value={String(options.lotus_part_target_model ?? "")} onChange={event => onUpdateFields({options_json:{...options,lotus_part_configuration_version:LOTUS_PARTS_VERSION,lotus_part_target_model:event.target.value || null}})}><option value="">Select documented model</option>{partProfile.models.map(model => <option key={model} value={model}>{model}</option>)}</select></label>{!pricingOnly && <label className="block text-sm">Installed part / mechanism reference (if known)<input aria-label="Lotus installed mechanism reference" className="w-full rounded border p-2" value={String(options.lotus_part_installed_reference ?? "")} onChange={event => onUpdateFields({options_json:{...options,lotus_part_configuration_version:LOTUS_PARTS_VERSION,lotus_part_installed_reference:event.target.value}})} /></label>}{!pricingOnly && <p className="text-sm">These models are named in the exact dealer listing. Installed mechanism revision and fit still require confirmation; no part price or stock is inferred.</p>}</div>}
    {selected && <div className="text-sm">{!pricingOnly && <p>{selected.exception}</p>}<p>{selected.discontinued ? "Discontinued — history only." : "Price confirmation required."}</p>{!pricingOnly && <a href={selected.sourceUrl} target="_blank" rel="noreferrer">Dealer source listing</a>}</div>}
  </section>;
}
