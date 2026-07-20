"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, RotateCcw, Server, ShieldCheck, X } from "lucide-react";
import "@mts/mts-quote.css";
import { ProductTypeButtons } from "@mts/components/crm/quote-builder/ProductTypeButtons";
import { RoomPresetButtons } from "@mts/components/crm/quote-builder/RoomPresetButtons";
import {
  copyQuoteLabLine,
  createQuoteLabDesign,
  createQuoteLabLine,
  quoteLabDefaultProduct,
  quoteLabProductType,
  type QuoteLabProductType,
} from "@/lib/quote-lab/builder";
import type {
  QuoteLabCatalogResponse,
  QuoteLabComparison,
  QuoteLabDesignInput,
  QuoteLabLineInput,
  QuoteLabQuoteInput,
} from "@/lib/quote-lab/types";
import { QUOTE_LAB_MAX_DESIGNS_PER_LINE, QUOTE_LAB_MAX_LINES } from "@/lib/quote-lab/types";
import { QuoteLabAudit } from "./QuoteLabAudit";
import { QuoteLabLineCard } from "./QuoteLabLineCard";
import styles from "./QuoteLab.module.css";

function money(value: number | null | undefined): string {
  if (value == null) return "$0.00";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

type QuoteLabBuilderProps = {
  catalog: QuoteLabCatalogResponse;
  quote: QuoteLabQuoteInput;
  fixtureId: string;
  comparison: QuoteLabComparison | null;
  pricing: boolean;
  error: string | null;
  onLoadFixture: (fixtureId: string) => void;
  onQuoteChange: (quote: QuoteLabQuoteInput) => void;
  onReprice: () => void;
  onLogout: () => void;
};

export function QuoteLabBuilder({
  catalog,
  quote,
  fixtureId,
  comparison,
  pricing,
  error,
  onLoadFixture,
  onQuoteChange,
  onReprice,
  onLogout,
}: QuoteLabBuilderProps) {
  const [selectedProductType, setSelectedProductType] = useState<QuoteLabProductType | null>(null);
  const [collapsedLineIds, setCollapsedLineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCollapsedLineIds(new Set(quote.lines.slice(1).map((line) => line.id)));
  }, [quote.id]);

  const productTypeLineNumbers = useMemo(() => {
    const numbers = new Map<string, number[]>();
    quote.lines.forEach((line, index) => {
      const selected = line.designs.find((design) => design.id === line.selectedDesignId) ?? line.designs[0];
      if (!selected) return;
      const type = quoteLabProductType(selected.productId);
      if (!type) return;
      numbers.set(type, [...(numbers.get(type) ?? []), index + 1]);
    });
    return numbers;
  }, [quote.lines]);

  const roomLineNumbers = useMemo(() => {
    const numbers = new Map<string, number[]>();
    quote.lines.forEach((line, index) => numbers.set(line.room, [...(numbers.get(line.room) ?? []), index + 1]));
    return numbers;
  }, [quote.lines]);

  const comparisonByLineId = useMemo(
    () => new Map(comparison?.lines.map((line) => [line.lineId, line]) ?? []),
    [comparison],
  );

  function replaceLines(lines: QuoteLabLineInput[]) {
    onQuoteChange({ ...quote, lines });
  }

  function updateLine(lineId: string, patch: Partial<QuoteLabLineInput>) {
    replaceLines(quote.lines.map((line) => line.id === lineId ? { ...line, ...patch } : line));
  }

  function updateDesign(lineId: string, designId: string, patch: Partial<QuoteLabDesignInput>) {
    replaceLines(quote.lines.map((line) => line.id === lineId ? {
      ...line,
      designs: line.designs.map((design) => design.id === designId ? { ...design, ...patch } : design),
    } : line));
  }

  function addRoom(room: string) {
    if (!selectedProductType || quote.lines.length >= QUOTE_LAB_MAX_LINES) return;
    const line = createQuoteLabLine(catalog.products, selectedProductType, room);
    setCollapsedLineIds(new Set(quote.lines.map((existing) => existing.id)));
    replaceLines([...quote.lines, line]);
  }

  function copyLine(line: QuoteLabLineInput) {
    if (quote.lines.length >= QUOTE_LAB_MAX_LINES) return;
    const copy = copyQuoteLabLine(line);
    setCollapsedLineIds((current) => new Set([...current, line.id]));
    replaceLines([...quote.lines, copy]);
  }

  function changeProduct(line: QuoteLabLineInput, design: QuoteLabDesignInput, productId: string) {
    const product = catalog.products.find((candidate) => candidate.id === productId);
    if (!product) return;
    updateDesign(line.id, design.id, {
      productId,
      programId: product.programs[0]?.id,
      fabric: undefined,
      surcharges: [],
      motorization: [],
      legacyRetailOverride: undefined,
      legacyStoredUnitPrice: undefined,
    });
  }

  function changeProductType(line: QuoteLabLineInput, productType: QuoteLabProductType) {
    const design = createQuoteLabDesign(quoteLabDefaultProduct(catalog.products, productType));
    updateLine(line.id, { designs: [design], selectedDesignId: design.id });
  }

  function toggleSurcharge(line: QuoteLabLineInput, design: QuoteLabDesignInput, surchargeId: string, checked: boolean) {
    const existing = design.surcharges ?? [];
    updateDesign(line.id, design.id, {
      surcharges: checked
        ? [...existing.filter((item) => item.id !== surchargeId), { id: surchargeId, units: 1 }]
        : existing.filter((item) => item.id !== surchargeId),
    });
  }

  function setMotorization(line: QuoteLabLineInput, design: QuoteLabDesignInput, groupId: string, optionId: string) {
    const existing = (design.motorization ?? []).filter((item) => item.groupId !== groupId);
    updateDesign(line.id, design.id, {
      motorization: optionId ? [...existing, { groupId, optionId, units: 1 }] : existing,
    });
  }

  function addAlternative(line: QuoteLabLineInput) {
    if (line.designs.length >= QUOTE_LAB_MAX_DESIGNS_PER_LINE) return;
    const selected = line.designs.find((design) => design.id === line.selectedDesignId) ?? line.designs[0];
    const product = catalog.products.find((candidate) => candidate.id === selected?.productId) ?? catalog.products[0];
    const design = createQuoteLabDesign(product, String.fromCharCode(65 + line.designs.length));
    updateLine(line.id, { designs: [...line.designs, design], selectedDesignId: design.id });
  }

  function removeDesign(line: QuoteLabLineInput, designId: string) {
    if (line.designs.length <= 1) return;
    const designs = line.designs.filter((design) => design.id !== designId);
    updateLine(line.id, { designs, selectedDesignId: designs[0]?.id ?? null });
  }

  function freshStart() {
    onQuoteChange({ id: `test-${Date.now()}`, name: "New isolated quote", lines: [] });
    setCollapsedLineIds(new Set());
    setSelectedProductType(null);
  }

  const pricedLines = comparison?.lines.filter((line) => !line.sendBlocked).length ?? 0;
  const atLimit = quote.lines.length >= QUOTE_LAB_MAX_LINES;

  return (
    <main className={`${styles.builderPage} mts-quote-scope`}>
      <div className={styles.commandShell}>
        <header className={styles.commandBar}>
          <div className={styles.brandBlock}>
            <div className={styles.brandMark}>805</div>
            <div><h1>Quote Builder</h1><p>Window treatment studio · isolated backend preview</p></div>
          </div>
          <div className={styles.commandActions}>
            <button type="button" onClick={freshStart}><RotateCcw size={16} />Fresh Start</button>
            <button type="button" onClick={onReprice} disabled={pricing || quote.lines.length === 0}><RefreshCw size={16} className={pricing ? styles.spin : ""} />{pricing ? "Pricing…" : "Reprice"}</button>
            <button type="button" onClick={onLogout} aria-label="Lock test builder"><X size={17} />Close</button>
          </div>
        </header>

        <div className={styles.backendStrip}>
          <span><Server size={15} />Server-authoritative pricing</span>
          <span><ShieldCheck size={15} />No production writes</span>
          <span><CheckCircle2 size={15} />{quote.lines.length}/{QUOTE_LAB_MAX_LINES} line items</span>
          <label>Test scenario
            <select value={fixtureId} onChange={(event) => onLoadFixture(event.target.value)}>
              <option value="custom">Custom test quote</option>
              {catalog.fixtures.map((fixture) => <option key={fixture.id} value={fixture.id}>{fixture.name}</option>)}
            </select>
          </label>
        </div>

        <div className={styles.quoteMetaBar}>
          <label>Test quote
            <input value={quote.name} onChange={(event) => onQuoteChange({ ...quote, name: event.target.value })} />
          </label>
          <div>
            <span>Authoritative catalog</span>
            <strong>{catalog.source}</strong>
            <small>{catalog.effectiveDate}</small>
          </div>
        </div>

        <div className={styles.addControls} aria-label="Add quote line item">
          <ProductTypeButtons
            selected={selectedProductType}
            onSelect={(type) => setSelectedProductType(type as QuoteLabProductType | null)}
            lineNumbers={productTypeLineNumbers}
          />
          <RoomPresetButtons
            onSelect={addRoom}
            disabled={!selectedProductType || atLimit}
            lineNumbers={roomLineNumbers}
          />
          {atLimit && <p className={styles.limitNotice}>This quote has reached the 40-line limit. Copy and add controls are safely disabled.</p>}
        </div>
      </div>

      <section className={styles.quoteFlow}>
        <div className={styles.saveStatus} data-pricing={pricing || undefined} role="status" aria-live="polite">
          {pricing ? "Server is repricing the quote…" : quote.lines.length === 0 ? "Choose a product and room to add the first line." : comparison?.sendBlocked ? "Authoritative validation found lines that need attention." : `${pricedLines} line${pricedLines === 1 ? "" : "s"} priced by the server.`}
        </div>

        {quote.lines.length === 0 ? (
          <div className={styles.emptyQuote}>
            <Server size={28} />
            <h2>Start the quote the same way you do now</h2>
            <p>Select a product type, then choose a room. Nothing on this screen can write to the production CRM.</p>
          </div>
        ) : quote.lines.map((line, index) => (
          <QuoteLabLineCard
            key={line.id}
            catalogProducts={catalog.products}
            line={line}
            lineNumber={index + 1}
            comparison={comparisonByLineId.get(line.id)}
            collapsed={collapsedLineIds.has(line.id)}
            pricing={pricing}
            canCopy={!atLimit}
            onToggleCollapsed={() => setCollapsedLineIds((current) => {
              const next = new Set(current);
              if (next.has(line.id)) next.delete(line.id);
              else next.add(line.id);
              return next;
            })}
            onUpdateLine={(patch) => updateLine(line.id, patch)}
            onUpdateDesign={(designId, patch) => updateDesign(line.id, designId, patch)}
            onChangeProduct={(design, productId) => changeProduct(line, design, productId)}
            onChangeProductType={(productType) => changeProductType(line, productType)}
            onToggleSurcharge={(design, surchargeId, checked) => toggleSurcharge(line, design, surchargeId, checked)}
            onSetMotorization={(design, groupId, optionId) => setMotorization(line, design, groupId, optionId)}
            onAddAlternative={() => addAlternative(line)}
            onRemoveDesign={(designId) => removeDesign(line, designId)}
            onCopy={() => copyLine(line)}
            onDelete={() => replaceLines(quote.lines.filter((candidate) => candidate.id !== line.id))}
          />
        ))}

        {error && <p className={styles.error}>{error}</p>}
        <QuoteLabAudit comparison={comparison} />
      </section>

      <aside className={styles.floatingTotal} data-blocked={comparison?.sendBlocked || undefined}>
        <span>{comparison?.sendBlocked ? "Send blocked" : pricing ? "Server pricing" : "Authoritative total"}</span>
        <strong>{money(comparison?.authoritativeTotal)}</strong>
        <small>{quote.lines.length}/{QUOTE_LAB_MAX_LINES} lines · {comparison?.sendBlocked ? "fix highlighted lines" : "selected designs only"}</small>
      </aside>
    </main>
  );
}
