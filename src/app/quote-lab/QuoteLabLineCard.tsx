"use client";

import { Copy, Layers, Trash2 } from "lucide-react";
import {
  QUOTE_LAB_PRODUCT_TYPES,
  quoteLabProductsForType,
  quoteLabProductType,
  type QuoteLabProductType,
} from "@/lib/quote-lab/builder";
import type {
  QuoteLabCatalogProduct,
  QuoteLabDesignInput,
  QuoteLabLineComparison,
  QuoteLabLineInput,
} from "@/lib/quote-lab/types";
import styles from "./QuoteLab.module.css";

function money(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

type QuoteLabLineCardProps = {
  catalogProducts: QuoteLabCatalogProduct[];
  line: QuoteLabLineInput;
  lineNumber: number;
  comparison?: QuoteLabLineComparison;
  collapsed: boolean;
  pricing: boolean;
  canCopy: boolean;
  onToggleCollapsed: () => void;
  onUpdateLine: (patch: Partial<QuoteLabLineInput>) => void;
  onUpdateDesign: (designId: string, patch: Partial<QuoteLabDesignInput>) => void;
  onChangeProduct: (design: QuoteLabDesignInput, productId: string) => void;
  onChangeProductType: (productType: QuoteLabProductType) => void;
  onToggleSurcharge: (design: QuoteLabDesignInput, surchargeId: string, checked: boolean) => void;
  onSetMotorization: (design: QuoteLabDesignInput, groupId: string, optionId: string) => void;
  onAddAlternative: () => void;
  onRemoveDesign: (designId: string) => void;
  onCopy: () => void;
  onDelete: () => void;
};

export function QuoteLabLineCard({
  catalogProducts,
  line,
  lineNumber,
  comparison,
  collapsed,
  pricing,
  canCopy,
  onToggleCollapsed,
  onUpdateLine,
  onUpdateDesign,
  onChangeProduct,
  onChangeProductType,
  onToggleSurcharge,
  onSetMotorization,
  onAddAlternative,
  onRemoveDesign,
  onCopy,
  onDelete,
}: QuoteLabLineCardProps) {
  const selectedDesign = line.designs.find((design) => design.id === line.selectedDesignId) ?? line.designs[0];
  if (!selectedDesign) return null;
  const product = catalogProducts.find((candidate) => candidate.id === selectedDesign.productId) ?? catalogProducts[0];
  const productType = quoteLabProductType(product.id) ?? "Roller Shades";
  const compatibleProducts = quoteLabProductsForType(catalogProducts, productType);
  const selectedComparison = comparison?.designs.find((design) => design.designId === selectedDesign.id);
  const selectedPrice = selectedComparison?.authoritative.ok ? selectedComparison.authoritative.total : null;
  const selectedPricingError = selectedComparison && !selectedComparison.authoritative.ok
    ? selectedComparison.authoritative.error
    : null;
  const status = pricing
    ? "Pricing…"
    : comparison?.sendBlocked
      ? "Needs attention"
      : selectedComparison?.authoritative.ok
        ? "Server priced"
        : "Ready to price";

  return (
    <article className={styles.lineCard} data-blocked={comparison?.sendBlocked || undefined}>
      <header className={styles.lineCardHeader}>
        <button type="button" className={styles.lineNumber} onClick={onToggleCollapsed} aria-expanded={!collapsed}>
          <span>Line</span>
          <strong>{lineNumber}</strong>
        </button>
        <label className={styles.headerField}>
          <span>Room</span>
          <input value={line.room} onChange={(event) => onUpdateLine({ room: event.target.value })} />
        </label>
        <label className={styles.headerFieldSmall}>
          <span>Qty</span>
          <input type="number" min="1" max="100" value={line.quantity} onChange={(event) => onUpdateLine({ quantity: Number(event.target.value) })} />
        </label>
        <label className={styles.headerFieldProduct}>
          <span>Product type</span>
          <select value={productType} onChange={(event) => onChangeProductType(event.target.value as QuoteLabProductType)}>
            {QUOTE_LAB_PRODUCT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <div className={styles.linePrice} data-blocked={comparison?.sendBlocked || undefined}>
          <span>{status}</span>
          <strong>{comparison?.sendBlocked ? "Blocked" : money(selectedPrice)}</strong>
        </div>
        <div className={styles.lineActions}>
          <button type="button" onClick={onToggleCollapsed} title={collapsed ? "Open line" : "Stack line"}><Layers size={15} />{collapsed ? "Open" : "Stack"}</button>
          <button type="button" onClick={onCopy} disabled={!canCopy} title="Copy line item"><Copy size={15} />Copy</button>
          <button type="button" onClick={onDelete} title="Remove line item"><Trash2 size={15} />Remove</button>
        </div>
      </header>

      {collapsed ? (
        <button type="button" className={styles.collapsedSummary} onClick={onToggleCollapsed}>
          <span>{product.name}</span>
          <span>{selectedDesign.widthInches}&quot; × {selectedDesign.heightInches}&quot;</span>
          <span>Design {selectedDesign.label}</span>
          <strong>{money(selectedPrice)}</strong>
        </button>
      ) : (
        <div className={styles.lineBody}>
          <div className={styles.designTabs} role="group" aria-label={`Line ${lineNumber} designs`}>
            {line.designs.map((design) => {
              const result = comparison?.designs.find((candidate) => candidate.designId === design.id);
              const designPrice = result?.authoritative.ok ? result.authoritative.total : null;
              const selected = line.selectedDesignId === design.id;
              return (
                <button
                  type="button"
                  key={design.id}
                  className={selected ? styles.designTabActive : styles.designTab}
                  onClick={() => onUpdateLine({ selectedDesignId: design.id })}
                  aria-pressed={selected}
                >
                  <span>Design {design.label}</span>
                  <strong>{result && !result.authoritative.ok ? "Blocked" : money(designPrice)}</strong>
                  {selected && <small>Billable</small>}
                </button>
              );
            })}
            {line.designs.length < 6 && <button type="button" className={styles.addDesignTab} onClick={onAddAlternative}>+ Add design</button>}
          </div>

          <section className={styles.designEditor}>
            <div className={styles.designEditorHeading}>
              <div>
                <p>Selected design</p>
                <h2>{line.room} · Design {selectedDesign.label}</h2>
              </div>
              {line.designs.length > 1 && <button type="button" className={styles.removeDesign} onClick={() => onRemoveDesign(selectedDesign.id)}>Remove design</button>}
            </div>

            <div className={styles.formGrid}>
              <label>Product
                <select value={selectedDesign.productId} onChange={(event) => onChangeProduct(selectedDesign, event.target.value)}>
                  {compatibleProducts.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}{candidate.provisional ? " · provisional" : ""}</option>)}
                </select>
              </label>
              <label>Program
                <select value={selectedDesign.programId ?? ""} onChange={(event) => onUpdateDesign(selectedDesign.id, { programId: event.target.value })}>
                  {product.programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}
                </select>
              </label>
              <label>Width (in)
                <input type="number" min="0.0625" step="0.0625" value={selectedDesign.widthInches} onChange={(event) => onUpdateDesign(selectedDesign.id, { widthInches: Number(event.target.value) })} />
              </label>
              <label>Height (in)
                <input type="number" min="0.0625" step="0.0625" value={selectedDesign.heightInches} onChange={(event) => onUpdateDesign(selectedDesign.id, { heightInches: Number(event.target.value) })} />
              </label>
              <label>Discount %
                <input type="number" min="0" max="100" step="0.5" value={selectedDesign.discountPercent ?? 0} onChange={(event) => onUpdateDesign(selectedDesign.id, { discountPercent: Number(event.target.value) })} />
              </label>
              <div className={styles.serverPriceField} data-blocked={selectedComparison && !selectedComparison.authoritative.ok ? true : undefined}>
                <span>Authoritative server price</span>
                <strong>{selectedComparison && !selectedComparison.authoritative.ok ? "Cannot price" : money(selectedPrice)}</strong>
                <small>{selectedComparison?.authoritative.ok ? `${money(selectedComparison.authoritative.unitPrice)} each` : selectedPricingError ?? "Waiting for valid dimensions"}</small>
              </div>
            </div>

            {(product.surcharges.length > 0 || product.motorizationGroups.length > 0) && (
              <details className={styles.optionsPanel}>
                <summary>Options, surcharges and motorization</summary>
                {product.surcharges.length > 0 && (
                  <div className={styles.checkboxGrid}>
                    {product.surcharges.map((surcharge) => (
                      <label key={surcharge.id}>
                        <input type="checkbox" checked={Boolean(selectedDesign.surcharges?.some((item) => item.id === surcharge.id))} onChange={(event) => onToggleSurcharge(selectedDesign, surcharge.id, event.target.checked)} />
                        <span>{surcharge.name}<small>{surcharge.value == null ? "Price pending" : surcharge.kind === "percent" ? `${surcharge.value}%` : money(surcharge.value)}</small></span>
                      </label>
                    ))}
                  </div>
                )}
                {product.motorizationGroups.map((group) => (
                  <label className={styles.motorField} key={group.groupId}>{group.name}
                    <select value={selectedDesign.motorization?.find((item) => item.groupId === group.groupId)?.optionId ?? ""} onChange={(event) => onSetMotorization(selectedDesign, group.groupId, event.target.value)}>
                      <option value="">None</option>
                      {group.options.map((option) => <option key={option.id} value={option.id} disabled={option.price == null}>{option.name} {option.price == null ? "· N/A" : `· ${money(option.price)}`}</option>)}
                    </select>
                  </label>
                ))}
              </details>
            )}

            <details className={styles.auditControls}>
              <summary>Legacy audit simulation</summary>
              <div className={styles.formGrid}>
                {product.productType === "shutter" && <label>Legacy browser $/ft²<input type="number" min="0" step="0.5" placeholder="Default" value={selectedDesign.legacyRetailOverride ?? ""} onChange={(event) => onUpdateDesign(selectedDesign.id, { legacyRetailOverride: event.target.value ? Number(event.target.value) : undefined })} /></label>}
                <label>Simulated stored price<input type="number" min="0" step="0.01" placeholder="None" value={selectedDesign.legacyStoredUnitPrice ?? ""} onChange={(event) => onUpdateDesign(selectedDesign.id, { legacyStoredUnitPrice: event.target.value ? Number(event.target.value) : undefined })} /></label>
              </div>
            </details>
          </section>
        </div>
      )}
    </article>
  );
}
