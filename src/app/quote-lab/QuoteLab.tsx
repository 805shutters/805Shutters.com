"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  QuoteLabCatalogProduct,
  QuoteLabCatalogResponse,
  QuoteLabComparison,
  QuoteLabDesignInput,
  QuoteLabLineInput,
  QuoteLabQuoteInput,
} from "@/lib/quote-lab/types";
import styles from "./QuoteLab.module.css";

type AccessState = "loading" | "locked" | "ready" | "misconfigured";

function money(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function cloneQuote(quote: QuoteLabQuoteInput): QuoteLabQuoteInput {
  return JSON.parse(JSON.stringify(quote)) as QuoteLabQuoteInput;
}

function uniqueId(prefix: string): string {
  const value = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

function firstDesign(products: QuoteLabCatalogProduct[], label = "A"): QuoteLabDesignInput {
  const product = products[0];
  return {
    id: uniqueId("design"),
    label,
    productId: product.id,
    programId: product.programs[0]?.id,
    widthInches: 36,
    heightInches: 60,
    discountPercent: 0,
    surcharges: [],
    motorization: [],
  };
}

function newLine(products: QuoteLabCatalogProduct[], index: number): QuoteLabLineInput {
  const design = firstDesign(products);
  return {
    id: uniqueId("window"),
    room: `Window ${index}`,
    quantity: 1,
    selectedDesignId: design.id,
    designs: [design],
  };
}

function AccessGate({ onUnlocked, onMisconfigured }: { onUnlocked: () => void; onMisconfigured: (message: string) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/quote-lab/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        if (response.status === 503) onMisconfigured(body.error || "Quote Lab is not configured.");
        else setError(body.error || "Access was denied.");
        return;
      }
      onUnlocked();
    } catch {
      setError("The Quote Lab could not be reached.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.accessPage}>
      <section className={styles.accessCard}>
        <div className={styles.labMark}>805</div>
        <p className={styles.eyebrow}>Isolated testing environment</p>
        <h1>Quote Lab</h1>
        <p>Enter the test access code. This environment cannot write production data, send messages, collect payments, or place orders.</p>
        <form onSubmit={unlock} className={styles.accessForm}>
          <label htmlFor="quote-lab-code">Access code</label>
          <input
            id="quote-lab-code"
            type="password"
            autoComplete="current-password"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoFocus
          />
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" disabled={busy || !code}>{busy ? "Checking…" : "Open Quote Lab"}</button>
        </form>
      </section>
    </main>
  );
}

export function QuoteLab() {
  const [access, setAccess] = useState<AccessState>("loading");
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<QuoteLabCatalogResponse | null>(null);
  const [quote, setQuote] = useState<QuoteLabQuoteInput | null>(null);
  const [fixtureId, setFixtureId] = useState("");
  const [comparison, setComparison] = useState<QuoteLabComparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add("quote-lab-active");
    return () => document.body.classList.remove("quote-lab-active");
  }, []);

  const loadCatalog = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/quote-lab/catalog", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as QuoteLabCatalogResponse & { error?: string };
      if (response.status === 401) {
        setAccess("locked");
        return;
      }
      if (!response.ok) {
        setConfigurationError(body.error || "Quote Lab is not configured.");
        setAccess("misconfigured");
        return;
      }
      setCatalog(body);
      const initial = body.fixtures[0];
      if (initial) {
        setFixtureId(initial.id);
        setQuote(cloneQuote(initial.quote));
      }
      setAccess("ready");
    } catch {
      setConfigurationError("Quote Lab could not load its isolated catalog.");
      setAccess("misconfigured");
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const productsById = useMemo(() => new Map(catalog?.products.map((product) => [product.id, product]) ?? []), [catalog]);

  async function compare(nextQuote = quote) {
    if (!nextQuote) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/quote-lab/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextQuote),
      });
      const body = (await response.json().catch(() => ({}))) as { comparison?: QuoteLabComparison; error?: string };
      if (response.status === 401) {
        setAccess("locked");
        return;
      }
      if (!response.ok || !body.comparison) throw new Error(body.error || "Comparison failed.");
      setComparison(body.comparison);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Comparison failed.");
    } finally {
      setBusy(false);
    }
  }

  function loadFixture(id: string) {
    if (!catalog) return;
    const fixture = catalog.fixtures.find((candidate) => candidate.id === id);
    if (!fixture) return;
    const next = cloneQuote(fixture.quote);
    setFixtureId(id);
    setQuote(next);
    setComparison(null);
    setError(null);
  }

  function updateLine(lineId: string, patch: Partial<QuoteLabLineInput>) {
    setQuote((current) => current ? {
      ...current,
      lines: current.lines.map((line) => line.id === lineId ? { ...line, ...patch } : line),
    } : current);
    setComparison(null);
  }

  function updateDesign(lineId: string, designId: string, patch: Partial<QuoteLabDesignInput>) {
    setQuote((current) => current ? {
      ...current,
      lines: current.lines.map((line) => line.id === lineId ? {
        ...line,
        designs: line.designs.map((design) => design.id === designId ? { ...design, ...patch } : design),
      } : line),
    } : current);
    setComparison(null);
  }

  function changeProduct(lineId: string, design: QuoteLabDesignInput, productId: string) {
    const product = productsById.get(productId);
    if (!product) return;
    updateDesign(lineId, design.id, {
      productId,
      programId: product.programs[0]?.id,
      fabric: undefined,
      surcharges: [],
      motorization: [],
      legacyRetailOverride: undefined,
      legacyStoredUnitPrice: undefined,
    });
  }

  function toggleSurcharge(lineId: string, design: QuoteLabDesignInput, surchargeId: string, checked: boolean) {
    const existing = design.surcharges ?? [];
    updateDesign(lineId, design.id, {
      surcharges: checked
        ? [...existing.filter((item) => item.id !== surchargeId), { id: surchargeId, units: 1 }]
        : existing.filter((item) => item.id !== surchargeId),
    });
  }

  function setMotorization(lineId: string, design: QuoteLabDesignInput, groupId: string, optionId: string) {
    const existing = (design.motorization ?? []).filter((item) => item.groupId !== groupId);
    updateDesign(lineId, design.id, {
      motorization: optionId ? [...existing, { groupId, optionId, units: 1 }] : existing,
    });
  }

  function addAlternative(line: QuoteLabLineInput) {
    if (!catalog || line.designs.length >= 6) return;
    const label = String.fromCharCode(65 + line.designs.length);
    updateLine(line.id, { designs: [...line.designs, firstDesign(catalog.products, label)] });
  }

  function removeDesign(line: QuoteLabLineInput, designId: string) {
    if (line.designs.length <= 1) return;
    const designs = line.designs.filter((design) => design.id !== designId);
    updateLine(line.id, {
      designs,
      selectedDesignId: line.selectedDesignId === designId ? designs[0].id : line.selectedDesignId,
    });
  }

  async function logout() {
    await fetch("/api/quote-lab/access", { method: "DELETE" });
    setCatalog(null);
    setQuote(null);
    setComparison(null);
    setAccess("locked");
  }

  if (access === "loading") {
    return <main className={styles.loading}>Loading isolated Quote Lab…</main>;
  }
  if (access === "locked") {
    return <AccessGate onUnlocked={loadCatalog} onMisconfigured={(message) => { setConfigurationError(message); setAccess("misconfigured"); }} />;
  }
  if (access === "misconfigured") {
    return <main className={styles.loading}><strong>Quote Lab unavailable</strong><span>{configurationError}</span></main>;
  }
  if (!catalog || !quote) return null;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>805 Shutters · isolated testing environment</p>
          <h1>Quote Lab</h1>
          <p>Compare the active MTS pricing behavior with the server-authoritative engine before any production cutover.</p>
        </div>
        <button className={styles.textButton} onClick={logout}>Lock lab</button>
      </header>

      <section className={styles.safetyBar} aria-label="Isolation guarantees">
        <span>✓ No production database</span>
        <span>✓ No email or SMS</span>
        <span>✓ No payments</span>
        <span>✓ No manufacturer orders</span>
        <span>✓ Browser-session only</span>
      </section>

      <section className={styles.scenarioBar}>
        <div>
          <label htmlFor="fixture">Test scenario</label>
          <select id="fixture" value={fixtureId} onChange={(event) => loadFixture(event.target.value)}>
            {catalog.fixtures.map((fixture) => <option key={fixture.id} value={fixture.id}>{fixture.name}</option>)}
          </select>
        </div>
        <p>{catalog.fixtures.find((fixture) => fixture.id === fixtureId)?.description}</p>
        <div className={styles.catalogStamp}>
          <span>Authoritative catalog</span>
          <strong>{catalog.source}</strong>
          <small>{catalog.effectiveDate}</small>
        </div>
      </section>

      <section className={styles.workspace}>
        <div className={styles.builder}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Ephemeral test quote</p>
              <input
                className={styles.quoteName}
                value={quote.name}
                onChange={(event) => { setQuote({ ...quote, name: event.target.value }); setComparison(null); }}
                aria-label="Test quote name"
              />
            </div>
            <button
              className={styles.secondaryButton}
              onClick={() => {
                const line = newLine(catalog.products, quote.lines.length + 1);
                setQuote({ ...quote, lines: [...quote.lines, line] });
                setComparison(null);
              }}
            >+ Add window</button>
          </div>

          {quote.lines.map((line, lineIndex) => (
            <article className={styles.windowCard} key={line.id}>
              <div className={styles.windowHeader}>
                <div className={styles.inlineFields}>
                  <label>Room<input value={line.room} onChange={(event) => updateLine(line.id, { room: event.target.value })} /></label>
                  <label>Quantity<input type="number" min="1" max="100" value={line.quantity} onChange={(event) => updateLine(line.id, { quantity: Number(event.target.value) })} /></label>
                </div>
                {quote.lines.length > 1 && <button className={styles.dangerText} onClick={() => { setQuote({ ...quote, lines: quote.lines.filter((item) => item.id !== line.id) }); setComparison(null); }}>Remove window</button>}
              </div>

              <div className={styles.designGrid}>
                {line.designs.map((design) => {
                  const product = productsById.get(design.productId) ?? catalog.products[0];
                  return (
                    <section className={`${styles.designCard} ${line.selectedDesignId === design.id ? styles.selectedDesign : ""}`} key={design.id}>
                      <div className={styles.designTitle}>
                        <label className={styles.radioLabel}>
                          <input type="radio" name={`selected-${line.id}`} checked={line.selectedDesignId === design.id} onChange={() => updateLine(line.id, { selectedDesignId: design.id })} />
                          Design {design.label} {line.selectedDesignId === design.id && <span>Billable</span>}
                        </label>
                        {line.designs.length > 1 && <button className={styles.dangerText} onClick={() => removeDesign(line, design.id)}>Remove</button>}
                      </div>
                      <div className={styles.formGrid}>
                        <label>Product<select value={design.productId} onChange={(event) => changeProduct(line.id, design, event.target.value)}>{catalog.products.map((item) => <option key={item.id} value={item.id}>{item.name}{item.provisional ? " · provisional" : ""}</option>)}</select></label>
                        <label>Program<select value={design.programId ?? ""} onChange={(event) => updateDesign(line.id, design.id, { programId: event.target.value })}>{product.programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}</select></label>
                        <label>Width (in)<input type="number" min="0.01" step="0.125" value={design.widthInches} onChange={(event) => updateDesign(line.id, design.id, { widthInches: Number(event.target.value) })} /></label>
                        <label>Height (in)<input type="number" min="0.01" step="0.125" value={design.heightInches} onChange={(event) => updateDesign(line.id, design.id, { heightInches: Number(event.target.value) })} /></label>
                        <label>Discount %<input type="number" min="0" max="100" step="0.5" value={design.discountPercent ?? 0} onChange={(event) => updateDesign(line.id, design.id, { discountPercent: Number(event.target.value) })} /></label>
                        {product.productType === "shutter" && <label>Legacy browser $/ft²<input type="number" min="0" step="0.5" placeholder="Default" value={design.legacyRetailOverride ?? ""} onChange={(event) => updateDesign(line.id, design.id, { legacyRetailOverride: event.target.value ? Number(event.target.value) : undefined })} /></label>}
                        <label>Simulated stored price<input type="number" min="0" step="0.01" placeholder="None" value={design.legacyStoredUnitPrice ?? ""} onChange={(event) => updateDesign(line.id, design.id, { legacyStoredUnitPrice: event.target.value ? Number(event.target.value) : undefined })} /></label>
                      </div>

                      {product.surcharges.length > 0 && (
                        <details className={styles.optionDetails}>
                          <summary>Add-ons and surcharges ({design.surcharges?.length ?? 0} selected)</summary>
                          <div className={styles.checkboxGrid}>
                            {product.surcharges.map((surcharge) => (
                              <label key={surcharge.id}>
                                <input type="checkbox" checked={Boolean(design.surcharges?.some((item) => item.id === surcharge.id))} onChange={(event) => toggleSurcharge(line.id, design, surcharge.id, event.target.checked)} />
                                <span>{surcharge.name}<small>{surcharge.value == null ? "Price pending" : surcharge.kind === "percent" ? `${surcharge.value}%` : money(surcharge.value)}</small></span>
                              </label>
                            ))}
                          </div>
                        </details>
                      )}

                      {product.motorizationGroups.map((group) => (
                        <label className={styles.motorField} key={group.groupId}>{group.name}
                          <select value={design.motorization?.find((item) => item.groupId === group.groupId)?.optionId ?? ""} onChange={(event) => setMotorization(line.id, design, group.groupId, event.target.value)}>
                            <option value="">None</option>
                            {group.options.map((option) => <option key={option.id} value={option.id} disabled={option.price == null}>{option.name} {option.price == null ? "· N/A" : `· ${money(option.price)}`}</option>)}
                          </select>
                        </label>
                      ))}
                    </section>
                  );
                })}
                {line.designs.length < 6 && <button className={styles.addDesign} onClick={() => addAlternative(line)}>+ Add alternative design</button>}
              </div>
              <small className={styles.windowNumber}>Test window {lineIndex + 1}</small>
            </article>
          ))}

          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.compareButton} onClick={() => compare()} disabled={busy}>{busy ? "Comparing engines…" : "Compare pricing engines"}</button>
        </div>

        <aside className={styles.results}>
          {!comparison ? (
            <div className={styles.emptyResults}>
              <strong>Ready to compare</strong>
              <p>Run the quote to see selected-design totals, stale-price behavior, unsupported products, send guards and manufacturer order charges.</p>
            </div>
          ) : (
            <>
              <div className={styles.resultStatus} data-blocked={comparison.sendBlocked}>
                <span>{comparison.sendBlocked ? "SEND BLOCKED" : "SAFE TO SEND"}</span>
                <strong>{comparison.sendBlocked ? "Authoritative validation stopped this quote" : "Every selected design priced successfully"}</strong>
              </div>
              <div className={styles.totalGrid}>
                <div><span>Active legacy behavior</span><strong>{money(comparison.legacyTotal)}</strong></div>
                <div><span>Authoritative selected total</span><strong>{money(comparison.authoritativeTotal)}</strong></div>
                <div><span>Difference</span><strong className={comparison.difference === 0 ? styles.neutral : styles.difference}>{money(comparison.difference)}</strong></div>
                <div><span>Manufacturer net charges</span><strong>{money(comparison.orderChargeTotal)}</strong><small>Tracked separately from retail</small></div>
              </div>

              {comparison.findings.length > 0 && <section className={styles.findings}><h2>What the lab found</h2><ul>{comparison.findings.map((finding) => <li key={finding}>{finding}</li>)}</ul></section>}

              {comparison.orderCharges.length > 0 && <section className={styles.chargeList}><h2>Order-level cost exposure</h2>{comparison.orderCharges.map((charge) => <div key={charge.id}><span><strong>{charge.label}</strong><small>{charge.detail}</small></span><b>{money(charge.amount)}</b></div>)}</section>}

              <section className={styles.lineResults}>
                <h2>Window-by-window evidence</h2>
                {comparison.lines.map((line) => (
                  <article key={line.lineId}>
                    <header><strong>{line.room}</strong><span>Legacy {money(line.legacyTotal)} · New {money(line.authoritativeTotal)}</span></header>
                    {line.blockReason && <p className={styles.blockReason}>{line.blockReason}</p>}
                    {line.designs.map((design) => (
                      <div className={styles.designResult} key={design.designId}>
                        <div><b>{design.label}{design.selected ? " · selected" : " · alternative"}</b><span>Legacy: {design.legacy.status} · {money(design.legacy.total)}</span></div>
                        <div><b>{design.authoritative.ok ? "Authoritative: priced" : `Authoritative: ${design.authoritative.code}`}</b><span>{design.authoritative.ok ? `${money(design.authoritative.unitPrice)} each · ${money(design.authoritative.total)} line` : design.authoritative.error}</span></div>
                      </div>
                    ))}
                  </article>
                ))}
              </section>
            </>
          )}
        </aside>
      </section>
    </main>
  );
}
