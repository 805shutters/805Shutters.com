"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import type { CrmQuoteDesign, CrmQuoteLineItem, CrmQuoteWithItems } from "@/lib/crm/types";
import type { UiCatalog, UiDetailField, UiMotorizationOption, UiPricingReference, UiPricingReferenceProgram, UiProduct, UiSurcharge } from "@/lib/quote/ui-catalog";
import { FRACTION_STEPS, formatInches, splitInches, toInches } from "@/lib/quote/measurements";
import { summarizePriceBreakdown } from "@/lib/quote/price-explanation";
import { shutterVariantsFor } from "@/lib/quote/product-options";
import type { PriceBreakdown } from "@/lib/quote/pricing";

type Props = {
  session: Session;
  quoteId: string;
  onClose: () => void;
  onChanged?: () => void;
  onSwitch?: (id: string) => void;
  /** Render inline (no modal overlay / Close button) — used inside the Quotes workspace. */
  embedded?: boolean;
};

type Version = { id: string; label: string; status: string; quote_total: number; share_token: string | null; signed: boolean };
type DetailValue = string | number | boolean | null;

async function api<T>(session: Session, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const b = body as { message?: string; error?: string };
    throw new Error(b.message || b.error || `Request failed (${res.status})`);
  }
  return body as T;
}

function money(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function round2(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function selectedDesign(lineItem: CrmQuoteLineItem): CrmQuoteDesign | null {
  if (!lineItem.selected_design_id) return null;
  return lineItem.designs.find((design) => design.id === lineItem.selected_design_id) ?? null;
}

function designOnceTotal(design: CrmQuoteDesign | null): number {
  if (!design || design.price_status !== "ok") return 0;
  const breakdown = design.price_breakdown as { onceTotal?: unknown } | null;
  const once = breakdown && typeof breakdown.onceTotal === "number" ? breakdown.onceTotal : 0;
  return round2(Math.max(0, once));
}

function lineSubtotal(lineItem: CrmQuoteLineItem): number {
  const design = selectedDesign(lineItem);
  if (!design || design.price_status !== "ok") return 0;
  const qty = Math.max(1, Math.floor(Number(lineItem.quantity) || 1));
  return round2(Number(design.unit_price) * qty + designOnceTotal(design));
}

/** Short price hint shown next to a surcharge toggle (accurate per unit/basis). */
function surchargeHint(s: UiSurcharge): string {
  if (s.widthGraduated) return "priced by width";
  if (s.kind === "percent") return `${s.value}%`;
  const amt = money(s.value);
  if (s.per === "sqft") return `${amt}/sq ft`;
  if (s.per === "side") return `${amt}/side`;
  if (s.per === "foot") return `${amt}/ft`;
  if (s.per === "once") return `${amt}/order`;
  return amt;
}

function motorOptionPrice(productId: string, option: UiMotorizationOption): { price: number | null; unavailable: boolean; pending: boolean } {
  if (option.priceByProduct && Object.prototype.hasOwnProperty.call(option.priceByProduct, productId)) {
    const mapped = option.priceByProduct[productId];
    return { price: mapped ?? null, unavailable: mapped == null, pending: false };
  }
  return { price: option.price, unavailable: false, pending: option.price == null };
}

function motorOptionHint(productId: string, option: UiMotorizationOption): string {
  const priced = motorOptionPrice(productId, option);
  if (priced.unavailable) return "(N/A for this product)";
  if (priced.pending) return "(price pending)";
  return `(${money(priced.price)})`;
}

const LABELS = ["A", "B", "C", "D", "E", "F"];

// Friendly labels for the catalog's productType keys, shown on the product-line
// tiles. Any type missing here falls back to a title-cased version of the key.
const PRODUCT_TYPE_LABELS: Record<string, string> = {
  shutter: "Shutters",
  roller_shade: "Roller Shades",
  roman_shade: "Roman Shades",
  honeycomb_shade: "Honeycomb Shades",
  vertical_honeycomb_shade: "Vertical Honeycomb",
  sheer_shade: "Sheer Shades",
  smartfold_shade: "SmartFold Shades",
  smart_drape: "Smart Drapes",
  faux_wood_blind: "Faux Wood Blinds",
  wood_blind: "Wood Blinds",
  vertical_blind: "Vertical Blinds",
  aluminum_blind: "Aluminum Blinds",
  accessory: "Accessories",
};

function typeLabel(t: string): string {
  return PRODUCT_TYPE_LABELS[t] || t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Quick-add room buttons (union of the old MTS quote-builder and measure-form room presets).
const ROOM_PRESETS = [
  "Living Room",
  "Family Room",
  "Dining Room",
  "Kitchen",
  "Breakfast Nook",
  "Hall",
  "Hallway",
  "Foyer",
  "Primary Bedroom",
  "Primary Bed",
  "Primary Bathroom",
  "Primary Bath",
  "Bedroom",
  "Bedroom 1",
  "Bedroom 2",
  "Bedroom 3",
  "Guest Room",
  "Nursery",
  "Bathroom",
  "Stair",
  "Stairs",
  "Loft",
  "Office",
  "Den",
  "Studio",
  "Library",
  "Gym",
  "Garage",
  "Closet",
];

type ProductTypeTile = { type: string; label: string; defaultProductId: string; count: number };

export function QuoteBuilderPanel({ session, quoteId, onClose, onChanged, onSwitch, embedded }: Props) {
  const [catalog, setCatalog] = useState<UiCatalog | null>(null);
  const [quote, setQuote] = useState<CrmQuoteWithItems | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [customRoom, setCustomRoom] = useState("");
  const [pricingReference, setPricingReference] = useState<UiPricingReference | null>(null);
  const [showPricingReference, setShowPricingReference] = useState(false);
  const [measuringId, setMeasuringId] = useState<string | null>(null);
  const [discountMode, setDiscountMode] = useState<"all" | "select">("all");
  const [selectedForDiscount, setSelectedForDiscount] = useState<Set<string>>(new Set());
  const [sendChannel, setSendChannel] = useState<"both" | "email" | "sms">("both");
  const [copySourceId, setCopySourceId] = useState<string | null>(null);
  const [copyTargets, setCopyTargets] = useState<Set<string>>(new Set());
  const [activeDesignTab, setActiveDesignTab] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    // Clear transient per-quote UI state so a version switch doesn't leak the
    // previous quote's share link / send message / error.
    setShareUrl(null);
    setSendMsg(null);
    setError(null);
    // Clear the previous quote so switching versions never shows the old quote's
    // windows briefly under the new version's header/total.
    setQuote(null);
    setCustomRoom("");
    setMeasuringId(null);
    setCopySourceId(null);
    setCopyTargets(new Set());
    setActiveDesignTab({});
    (async () => {
      try {
        const [c, q] = await Promise.all([
          api<{ catalog: UiCatalog }>(session, "/api/crm/quote-catalog"),
          api<{ quote: CrmQuoteWithItems; versions: Version[] }>(session, `/api/crm/quotes/${quoteId}/builder`),
        ]);
        if (!active) return;
        setCatalog(c.catalog);
        setQuote(q.quote);
        setVersions(q.versions || []);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load builder.");
      }
    })();
    return () => {
      active = false;
    };
  }, [session, quoteId]);

  const productsById = useMemo(() => {
    const map = new Map<string, UiProduct>();
    catalog?.products.forEach((p) => map.set(p.id, p));
    return map;
  }, [catalog]);

  // Group catalog products into product-line tiles (one per productType). The
  // default product is the first non-provisional product in the group (so a
  // tapped room seeds real pricing where we have it), else the first product.
  const productTypes = useMemo<ProductTypeTile[]>(() => {
    if (!catalog) return [];
    const groups = new Map<string, UiProduct[]>();
    catalog.products.forEach((p) => {
      const arr = groups.get(p.productType) || [];
      arr.push(p);
      groups.set(p.productType, arr);
    });
    return Array.from(groups.entries())
      .map(([type, prods]) => {
        const preferred = prods.find((p) => !p.provisional) || prods[0];
        return {
          type,
          label: typeLabel(type),
          defaultProductId: preferred.id,
          count: prods.length,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [catalog]);

  // Default the active product line to Shutters (or the first tile) once loaded.
  useEffect(() => {
    if (!activeType && productTypes.length > 0) {
      const shutter = productTypes.find((t) => t.type === "shutter");
      setActiveType(shutter?.type ?? productTypes[0].type);
    }
  }, [productTypes, activeType]);

  const activeTile = useMemo(
    () => productTypes.find((t) => t.type === activeType) ?? null,
    [productTypes, activeType],
  );

  const mutate = useCallback(
    async (path: string, init: RequestInit) => {
      setBusy(true);
      setError(null);
      try {
        const res = await api<{ quote: CrmQuoteWithItems }>(session, path, init);
        setQuote(res.quote);
        onChanged?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed.");
      } finally {
        setBusy(false);
      }
    },
    [session, onChanged],
  );

  const ensureCustomerLink = useCallback(async () => {
    const res = await api<{ url: string }>(session, `/api/crm/quotes/${quoteId}/share`, { method: "POST" });
    setShareUrl(res.url);
    return res.url;
  }, [session, quoteId]);

  const shareLink = useCallback(async () => {
    setError(null);
    try {
      const url = await ensureCustomerLink();
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        /* clipboard may be blocked; the link is still shown below */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the customer link.");
    }
  }, [ensureCustomerLink]);

  const openContract = useCallback(async () => {
    setError(null);
    try {
      const url = shareUrl || (await ensureCustomerLink());
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the contract.");
    }
  }, [shareUrl, ensureCustomerLink]);

  const togglePricingReference = useCallback(async () => {
    if (showPricingReference) {
      setShowPricingReference(false);
      return;
    }

    setShowPricingReference(true);
    if (pricingReference) return;

    setBusy(true);
    setError(null);
    try {
      const res = await api<{ reference: UiPricingReference }>(session, "/api/crm/quote-catalog/reference");
      setPricingReference(res.reference);
    } catch (e) {
      setShowPricingReference(false);
      setError(e instanceof Error ? e.message : "Could not load the pricing reference.");
    } finally {
      setBusy(false);
    }
  }, [session, showPricingReference, pricingReference]);

  const addWindow = () =>
    mutate(`/api/crm/quotes/${quoteId}/builder`, {
      method: "POST",
      body: JSON.stringify({ room: "", quantity: 1, sort_order: quote?.lineItems.length ?? 0 }),
    });

  // Tap a room preset (or custom room) to add a window pre-loaded with the
  // active product line as design "A" — the MTS-style quick-add flow.
  const addWindowWithRoom = (room: string) =>
    mutate(`/api/crm/quotes/${quoteId}/builder`, {
      method: "POST",
      body: JSON.stringify({
        room,
        quantity: 1,
        sort_order: quote?.lineItems.length ?? 0,
        seed_product_id: activeTile?.defaultProductId,
      }),
    });

  const patchWindow = (id: string, patch: Record<string, unknown>) =>
    mutate(`/api/crm/quote-line-items/${id}`, { method: "PATCH", body: JSON.stringify(patch) });

  // Per-line discount: patch one window's discount_percent (clamped server-side too).
  const setLineDiscount = (id: string, percent: number) =>
    patchWindow(id, { discount_percent: Math.min(100, Math.max(0, percent)) });

  // Apply a preset discount to every window (All mode) or just the checked ones
  // (Select mode). Sequential awaits — each patch reprices that line's designs and
  // recalculates the quote total; `mutate` refreshes the quote after each.
  const applyBulkDiscount = async (percent: number) => {
    if (!quote) return;
    const ids =
      discountMode === "all"
        ? quote.lineItems.map((li) => li.id)
        : quote.lineItems.filter((li) => selectedForDiscount.has(li.id)).map((li) => li.id);
    for (const id of ids) {
      await patchWindow(id, { discount_percent: percent });
    }
    setSelectedForDiscount(new Set());
  };

  const deleteWindow = (id: string) =>
    mutate(`/api/crm/quote-line-items/${id}`, { method: "DELETE" });

  const duplicateWindow = (id: string) =>
    mutate(`/api/crm/quote-line-items/${id}/duplicate`, { method: "POST" });

  // Copy this window's selected spec + size + discount to every other window
  // (the MTS "Copy All" flow). Confirms first since it overwrites the targets.
  const copySpecToAll = async (sourceId: string) => {
    if (!quote) return;
    const others = quote.lineItems.filter((li) => li.id !== sourceId);
    if (others.length === 0) return;
    const ok = window.confirm(`Copy this window's spec, size, and discount to all ${others.length} other window(s)? This overwrites them.`);
    if (!ok) return;
    await mutate(`/api/crm/quote-line-items/${sourceId}/copy-spec`, {
      method: "POST",
      body: JSON.stringify({ targetIds: others.map((li) => li.id) }),
    });
  };

  // Copy Some: pick a source, then check a subset of other windows to receive it.
  const startCopySome = (sourceId: string) => {
    setDiscountMode("all");
    setSelectedForDiscount(new Set());
    setCopySourceId(sourceId);
    setCopyTargets(new Set());
  };
  const cancelCopySome = () => {
    setCopySourceId(null);
    setCopyTargets(new Set());
  };
  const confirmCopySome = async () => {
    if (!copySourceId || copyTargets.size === 0) return;
    const sourceId = copySourceId;
    const targets = [...copyTargets];
    cancelCopySome();
    await mutate(`/api/crm/quote-line-items/${sourceId}/copy-spec`, {
      method: "POST",
      body: JSON.stringify({ targetIds: targets }),
    });
  };

  const saveAdjustments = (adj: Record<string, unknown>) =>
    mutate(`/api/crm/quotes/${quoteId}/adjustments`, { method: "PATCH", body: JSON.stringify(adj) });

  const sendToCustomer = useCallback(async () => {
    setBusy(true);
    setError(null);
    setSendMsg(null);
    try {
      const res = await api<{ url: string; sms: { sent: boolean; skipped?: string }; email: { sent: boolean; skipped?: string }; status: string }>(
        session,
        `/api/crm/quotes/${quoteId}/send`,
        { method: "POST", body: JSON.stringify({ channels: { email: sendChannel !== "sms", sms: sendChannel !== "email" } }) },
      );
      const parts: string[] = [];
      if (sendChannel !== "email") parts.push(res.sms.sent ? "texted" : `SMS ${res.sms.skipped ?? "skipped"}`);
      if (sendChannel !== "sms") parts.push(res.email.sent ? "emailed" : `email ${res.email.skipped ?? "skipped"}`);
      setSendMsg(`${parts.length ? parts.join(", ") : "done"}. Quote is now "${res.status}".`);
      setShareUrl(res.url);
      const q = await api<{ quote: CrmQuoteWithItems }>(session, `/api/crm/quotes/${quoteId}/builder`);
      setQuote(q.quote);
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed.");
    } finally {
      setBusy(false);
    }
  }, [session, quoteId, onChanged, sendChannel]);

  const addVersion = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ quoteId: string }>(session, `/api/crm/quotes/${quoteId}/version`, { method: "POST" });
      onChanged?.();
      onSwitch?.(res.quoteId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create a version.");
    } finally {
      setBusy(false);
    }
  }, [session, quoteId, onChanged, onSwitch]);

  const selectDesign = (lineItemId: string, designId: string) =>
    mutate(`/api/crm/quote-line-items/${lineItemId}/select`, {
      method: "POST",
      body: JSON.stringify({ designId }),
    });

  const addDesign = (li: CrmQuoteLineItem) => {
    const used = new Set(li.designs.map((d) => d.label));
    const label = LABELS.find((l) => !used.has(l)) || `Option ${li.designs.length + 1}`;
    const firstProduct = activeTile?.defaultProductId ?? catalog?.products[0]?.id ?? "";
    return mutate("/api/crm/quote-designs", {
      method: "POST",
      body: JSON.stringify({
        line_item_id: li.id,
        label,
        product_id: firstProduct,
        sort_order: li.designs.length,
      }),
    });
  };

  const saveDesign = (li: CrmQuoteLineItem, design: CrmQuoteDesign, changes: Record<string, unknown>) =>
    mutate("/api/crm/quote-designs", {
      method: "POST",
      body: JSON.stringify({
        id: design.id,
        line_item_id: li.id,
        label: design.label,
        sort_order: design.sort_order,
        product_id: design.product_id,
        program_id: design.program_id,
        fabric: design.fabric,
        details: design.details ?? {},
        surcharges: design.surcharges,
        motorization: design.motorization,
        ...changes,
      }),
    });

  const deleteDesign = (id: string) =>
    mutate(`/api/crm/quote-designs/${id}`, { method: "DELETE" });

  const toggleSurcharge = (li: CrmQuoteLineItem, design: CrmQuoteDesign, surchargeId: string) => {
    const has = design.surcharges.some((s) => s.id === surchargeId);
    const next = has
      ? design.surcharges.filter((s) => s.id !== surchargeId)
      : [...design.surcharges, { id: surchargeId }];
    return saveDesign(li, design, { surcharges: next });
  };

  const setDetail = (li: CrmQuoteLineItem, design: CrmQuoteDesign, key: string, value: DetailValue) => {
    const next = { ...(design.details ?? {}) };
    if (value === "" || value === null || value === false) delete next[key];
    else next[key] = value;
    return saveDesign(li, design, { details: next });
  };

  const toggleMotorization = (li: CrmQuoteLineItem, design: CrmQuoteDesign, groupId: string, optionId: string) => {
    const has = design.motorization.some((m) => m.groupId === groupId && m.optionId === optionId);
    const next = has
      ? design.motorization.filter((m) => !(m.groupId === groupId && m.optionId === optionId))
      : [...design.motorization, { groupId, optionId }];
    return saveDesign(li, design, { motorization: next });
  };

  const inner = (
      <div style={embedded ? embeddedPanelStyle : panelStyle}>
        {!embedded ? (
        <header style={headerStyle}>
          <div>
            <p style={{ margin: 0, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", opacity: 0.7 }}>
              Quote Builder
            </p>
            <h2 style={{ margin: "2px 0 0" }}>
              {quote?.customer_name || quote?.quote_number || "Quote"} — {money(quote?.quote_total)}
            </h2>
            <span style={savingPill}>{busy ? "Saving…" : "All changes saved"}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ display: "inline-flex", border: "1px solid #d8d5cf", borderRadius: 6, overflow: "hidden" }} title="How to send">
              {(["both", "email", "sms"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  style={{ ...segBtn, ...(sendChannel === c ? segBtnActive : {}) }}
                  onClick={() => setSendChannel(c)}
                  title={c === "both" ? "Send email and text" : c === "email" ? "Send email only" : "Send text only"}
                >
                  {c === "both" ? "Email + Text" : c === "email" ? "Email" : "Text"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={sendToCustomer}
              disabled={busy}
              style={{ ...closeBtn, background: "#111111", color: "#ffffff", borderColor: "#111111" }}
            >
              Send to customer
            </button>
            <button type="button" onClick={openContract} style={closeBtn}>
              Open contract
            </button>
            <button type="button" onClick={shareLink} style={closeBtn}>
              {shareUrl ? "Link copied ✓" : "Customer link"}
            </button>
            <button type="button" onClick={onClose} aria-label="Close quote builder" style={xBtn} title="Exit to CRM">
              ✕
            </button>
          </div>
        </header>
        ) : null}

        {quote ? (
          <div style={floatingTotalStyle} aria-label="Quote total">
            <span style={{ opacity: 0.7, fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>Total</span>
            <strong style={{ fontSize: 20 }}>{money(quote.quote_total)}</strong>
          </div>
        ) : null}

        {error ? <p style={errorStyle}>{error}</p> : null}
        {shareUrl ? (
          <p style={{ padding: "6px 16px", margin: 0, fontSize: 12, wordBreak: "break-all" }}>
            Customer link:{" "}
            <a href={shareUrl} target="_blank" rel="noreferrer">
              {shareUrl}
            </a>
          </p>
        ) : null}
        {sendMsg ? (
          <p style={{ padding: "6px 16px", margin: 0, fontSize: 13, color: "#3a3a36", background: "#eeeeeb" }}>{sendMsg}</p>
        ) : null}
        {!quote || !catalog ? (
          <p style={{ padding: 24 }}>Loading…</p>
        ) : (
          <div style={{ padding: "0 16px 16px", overflowY: "auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Versions:</span>
              {versions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => v.id !== quoteId && onSwitch?.(v.id)}
                  style={{ ...ghostBtn, background: v.id === quoteId ? "#0b0b0b" : "#ffffff", color: v.id === quoteId ? "#ffffff" : "#0b0b0b" }}
                >
                  Quote {v.label}
                  {v.signed ? " ✓" : ""}
                </button>
              ))}
              <button type="button" style={addBtn} disabled={busy} onClick={addVersion}>
                + Add version
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "0 0 12px", flexWrap: "wrap" }}>
              <p style={{ margin: 0, fontSize: 12, color: "#4d4d49" }}>
                Pricing source: {catalog.source}
                {catalog.effectiveDate ? ` (${catalog.effectiveDate})` : ""}. Shutter products marked provisional use the legacy MTS shutter rate table until a current guide replaces it.
              </p>
              <button type="button" style={ghostBtn} disabled={busy} onClick={togglePricingReference}>
                {showPricingReference ? "Hide pricing reference" : "Pricing reference"}
              </button>
            </div>
            {showPricingReference ? (
              pricingReference ? <PricingReferencePanel reference={pricingReference} /> : <p style={{ fontSize: 13, opacity: 0.7 }}>Loading pricing reference...</p>
            ) : null}

            {/* Sticky add bar: product line + room quick-add stay pinned at the top
                while the windows scroll underneath. */}
            <div style={stickyAddBar}>
            {embedded ? (
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                <button type="button" onClick={onClose} aria-label="Close quote builder" style={xBtn} title="Exit to CRM">✕</button>
              </div>
            ) : null}
            {/* Product line tiles — pick which product the room buttons add. */}
            <div style={sectionLabel}>Product line</div>
            <div style={tileRow}>
              {productTypes.map((t) => {
                const active = t.type === activeType;
                return (
                  <button
                    key={t.type}
                    type="button"
                    onClick={() => setActiveType(t.type)}
                    style={{
                      ...productTile,
                      borderColor: active ? "#bdb9b0" : "#d8d5cf",
                      background: active ? "#dedbd5" : "#ebeae6",
                      color: "#0b0b0b",
                      boxShadow: active ? "inset 0 0 0 1px #b1ada5" : "none",
                    }}
                  >
                    <span style={productTileLabel}>{t.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Room quick-add — tap a room to add a window using the active product. */}
            <div style={{ ...sectionLabel, marginTop: 14 }}>
              Add a window
              {activeTile ? <span style={{ fontWeight: 400, opacity: 0.6 }}> · {activeTile.label}</span> : null}
            </div>
            <div style={tileRow}>
              {ROOM_PRESETS.map((room) => (
                <button
                  key={room}
                  type="button"
                  style={roomPill}
                  disabled={busy || !activeTile}
                  onClick={() => addWindowWithRoom(room)}
                >
                  + {room}
                </button>
              ))}
              <span style={{ display: "inline-flex", gap: 4 }}>
                <input
                  value={customRoom}
                  onChange={(e) => setCustomRoom(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customRoom.trim()) {
                      addWindowWithRoom(customRoom.trim());
                      setCustomRoom("");
                    }
                  }}
                  placeholder="Custom room…"
                  style={{ ...customRoomInput }}
                />
                <button
                  type="button"
                  style={roomPill}
                  disabled={busy || !activeTile || !customRoom.trim()}
                  onClick={() => {
                    addWindowWithRoom(customRoom.trim());
                    setCustomRoom("");
                  }}
                >
                  + Add
                </button>
              </span>
              <button type="button" style={{ ...roomPill, borderStyle: "dashed" }} disabled={busy} onClick={addWindow}>
                + Blank window
              </button>
            </div>
            </div>

            <div style={{ height: 1, background: "#eeeeeb", margin: "16px 0" }} />

            {/* Per-line discount toolbar — apply a preset % to all or selected windows. */}
            <div style={discountToolbar}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Line discount:</span>
              <div style={{ display: "inline-flex", border: "1px solid #d8d5cf", borderRadius: 6, overflow: "hidden" }}>
                <button type="button" style={{ ...segBtn, ...(discountMode === "all" ? segBtnActive : {}) }} onClick={() => setDiscountMode("all")}>All lines</button>
                <button type="button" style={{ ...segBtn, ...(discountMode === "select" ? segBtnActive : {}) }} onClick={() => setDiscountMode("select")}>Select lines</button>
              </div>
              {[10, 15, 20].map((p) => (
                <button key={p} type="button" style={roomPill} disabled={busy || quote.lineItems.length === 0} onClick={() => applyBulkDiscount(p)}>
                  {p}% off
                </button>
              ))}
              <button type="button" style={ghostBtn} disabled={busy || quote.lineItems.length === 0} onClick={() => applyBulkDiscount(0)}>
                Clear
              </button>
              {discountMode === "select" ? (
                <span style={{ fontSize: 12, opacity: 0.7 }}>
                  {selectedForDiscount.size > 0 ? `${selectedForDiscount.size} selected` : "Check windows below to include them"}
                </span>
              ) : null}
            </div>

            {quote.lineItems.length === 0 ? (
              <p style={{ opacity: 0.7 }}>No windows yet. Pick a product line above, then tap a room to start pricing.</p>
            ) : null}

            {copySourceId ? (() => {
              const source = quote.lineItems.find((li) => li.id === copySourceId);
              return (
                <div style={copyBar}>
                  <div>
                    <strong>Copying “{source?.room || "this window"}”</strong>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Check the windows below to update with this spec, size &amp; discount.</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      type="button"
                      disabled={busy || copyTargets.size === 0}
                      onClick={confirmCopySome}
                      style={{ border: "none", background: copyTargets.size === 0 ? "#bdb9b0" : "#0b0b0b", color: "#ffffff", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600 }}
                    >
                      Copy to {copyTargets.size}
                    </button>
                    <button type="button" style={ghostBtn} onClick={cancelCopySome}>
                      Cancel
                    </button>
                  </div>
                </div>
              );
            })() : null}

            {quote.lineItems.map((li) => (
              <section key={li.id} style={windowCard}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                  {discountMode === "select" ? (
                    <Field label="Include" width={64}>
                      <input
                        type="checkbox"
                        style={{ width: 20, height: 20, margin: "8px 0 0" }}
                        checked={selectedForDiscount.has(li.id)}
                        onChange={(e) => {
                          const next = new Set(selectedForDiscount);
                          if (e.target.checked) next.add(li.id);
                          else next.delete(li.id);
                          setSelectedForDiscount(next);
                        }}
                      />
                    </Field>
                  ) : null}
                  {copySourceId && li.id !== copySourceId ? (
                    <Field label="Copy here" width={80}>
                      <input
                        type="checkbox"
                        style={{ width: 20, height: 20, margin: "8px 0 0" }}
                        checked={copyTargets.has(li.id)}
                        onChange={(e) => {
                          const next = new Set(copyTargets);
                          if (e.target.checked) next.add(li.id);
                          else next.delete(li.id);
                          setCopyTargets(next);
                        }}
                      />
                    </Field>
                  ) : null}
                  <Field label="Room / Opening">
                    <input
                      defaultValue={li.room || ""}
                      onBlur={(e) => e.target.value !== (li.room || "") && patchWindow(li.id, { room: e.target.value })}
                      placeholder="e.g. Living Room"
                    />
                  </Field>
                  <Field label="Size (W × H)">
                    <button
                      type="button"
                      style={sizeChip}
                      disabled={busy}
                      onClick={() => setMeasuringId(li.id)}
                    >
                      {li.width_in && li.height_in
                        ? `${formatInches(li.width_in)} × ${formatInches(li.height_in)}`
                        : "＋ Add size"}
                    </button>
                  </Field>
                  <Field label="Qty" width={70}>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      defaultValue={li.quantity}
                      onBlur={(e) => patchWindow(li.id, { quantity: e.target.value })}
                    />
                  </Field>
                  <Field label="Disc %" width={70}>
                    <input
                      key={li.discount_percent ?? 0}
                      type="number"
                      min="0"
                      max="100"
                      defaultValue={li.discount_percent ?? 0}
                      onBlur={(e) => {
                        const v = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                        if (v !== (li.discount_percent ?? 0)) setLineDiscount(li.id, v);
                      }}
                    />
                  </Field>
                  {li.discount_percent ? (
                    <span style={discountBadge}>{li.discount_percent}% off</span>
                  ) : null}
                  <button type="button" style={ghostBtn} disabled={busy || quote.lineItems.length < 2} onClick={() => copySpecToAll(li.id)}>
                    Copy to all
                  </button>
                  <button type="button" style={ghostBtn} disabled={busy || quote.lineItems.length < 2 || copySourceId !== null} onClick={() => startCopySome(li.id)}>
                    Copy to some…
                  </button>
                  <button type="button" style={ghostBtn} disabled={busy} onClick={() => duplicateWindow(li.id)}>
                    Duplicate
                  </button>
                  <button type="button" style={ghostBtn} disabled={busy} onClick={() => deleteWindow(li.id)}>
                    Remove window
                  </button>
                </div>

                {shutterVariantsFor(li.designs[0]?.product_id ?? "") && li.designs.length > 1 ? (() => {
                  const vdef = shutterVariantsFor(li.designs[0]?.product_id ?? "")!;
                  const activeId = activeDesignTab[li.id] ?? li.selected_design_id ?? li.designs[0]?.id;
                  return (
                    <div style={variantTabStrip}>
                      {li.designs.map((d) => {
                        const v = vdef.find((x) => x.variant === d.label);
                        const isActive = d.id === activeId;
                        const isBilled = li.selected_design_id === d.id;
                        return (
                          <button key={d.id} type="button" onClick={() => setActiveDesignTab((prev) => ({ ...prev, [li.id]: d.id }))} style={{ ...variantTab, ...(isActive ? variantTabActive : {}) }}>
                            <strong>{d.label}</strong>
                            {v ? <span style={{ opacity: 0.65, marginLeft: 6 }}>{v.label}</span> : null}
                            <span style={{ marginLeft: 10 }}>{d.price_status === "ok" ? money(d.unit_price) : "—"}</span>
                            {isBilled ? <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.8 }}>✓ billed</span> : null}
                          </button>
                        );
                      })}
                    </div>
                  );
                })() : null}

                {/* Detail summary at the top of the line item — shows the selected
                    design's fabric, mount, valance, control, etc. as chips so the
                    key specs are visible at a glance (they populate here as the rep
                    selects them in the design card below). */}
                {selectedDesign(li) ? (() => {
                  const sel = selectedDesign(li)!;
                  const prod = productsById.get(sel.product_id);
                  const chips: string[] = [];
                  if (sel.fabric) chips.push(sel.fabric);
                  for (const field of prod?.details ?? []) {
                    const val = (sel.details ?? {})[field.id];
                    if (val === true) chips.push(field.label);
                    else if (typeof val === "string" && val) {
                      const opt = field.options?.find((o) => o.value === val);
                      chips.push(`${field.label}: ${opt?.label ?? val}`);
                    }
                  }
                  for (const s of sel.surcharges ?? []) {
                    const name = prod?.surcharges.find((x) => x.id === s.id)?.name;
                    if (name) chips.push(name);
                  }
                  return chips.length ? (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 2 }}>
                      {chips.map((c, i) => (
                        <span key={i} style={{ fontSize: 11, background: "#f0f0ee", borderRadius: 4, padding: "2px 8px", color: "#4d4d49" }}>{c}</span>
                      ))}
                    </div>
                  ) : null;
                })() : null}

                <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                  {(shutterVariantsFor(li.designs[0]?.product_id ?? "") ? li.designs.filter((d) => d.id === (activeDesignTab[li.id] ?? li.selected_design_id ?? li.designs[0]?.id)) : li.designs).map((design) => {
                    const product = productsById.get(design.product_id);
                    const motorizationGroups = product
                      ? catalog.motorization.filter((group) => product.motorizationGroups.includes(group.groupId))
                      : [];
                    const productId = product?.id ?? design.product_id;
                    const isSelected = li.selected_design_id === design.id;
                    const priceOk = design.price_status === "ok";
                    return (
                      <div key={design.id} style={{ ...designCard, borderColor: isSelected ? "#111111" : "#d8d8d2" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                            <input
                              type="radio"
                              name={`sel-${li.id}`}
                              checked={isSelected}
                              disabled={busy}
                              onChange={() => selectDesign(li.id, design.id)}
                            />
                            Option {design.label}
                          </label>
                          <span style={{ marginLeft: "auto", fontWeight: 700, color: priceOk ? "#0b0b0b" : "#4d4d49" }}>
                            {priceOk ? money(design.unit_price) : design.price_status}
                            {priceOk && design.wholesale_unit_price != null ? (
                              <span style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#686862", textAlign: "right" }}>
                                Wholesale {money(design.wholesale_unit_price)}
                              </span>
                            ) : null}
                          </span>
                          <button type="button" style={ghostBtn} disabled={busy} onClick={() => deleteDesign(design.id)}>
                            ✕
                          </button>
                        </div>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Field label="Product">
                            <select
                              value={design.product_id}
                              onChange={(e) => saveDesign(li, design, { product_id: e.target.value, program_id: null, fabric: null, details: {}, surcharges: [], motorization: [] })}
                            >
                              {catalog.products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                  {p.provisional ? " (provisional pricing)" : ""}
                                </option>
                              ))}
                            </select>
                          </Field>

                          {product && product.programs.length > 1 ? (
                            <Field label="Program / Style">
                              <select
                                value={design.program_id || ""}
                                onChange={(e) => saveDesign(li, design, { program_id: e.target.value || null })}
                              >
                                <option value="">— choose —</option>
                                {product.programs.map((pr) => (
                                  <option key={pr.id} value={pr.id}>
                                    {pr.name}
                                  </option>
                                ))}
                              </select>
                            </Field>
                          ) : null}

                          {product && product.fabrics.length > 0 ? (
                            <Field label="Fabric">
                              <select
                                value={design.fabric || ""}
                                onChange={(e) => saveDesign(li, design, { fabric: e.target.value || null, program_id: null })}
                              >
                                <option value="">— choose —</option>
                                {product.fabrics.map((f) => (
                                  <option key={f.name} value={f.name}>
                                    {f.name}
                                  </option>
                                ))}
                              </select>
                            </Field>
                          ) : null}
                        </div>

                        {product && product.details.length > 0 ? (
                          <div style={detailGrid}>
                            {product.details.map((field) => (
                              <DetailControl
                                key={field.id}
                                field={field}
                                value={(design.details ?? {})[field.id]}
                                onChange={(value) => setDetail(li, design, field.id, value)}
                              />
                            ))}
                          </div>
                        ) : null}

                        {!priceOk && design.price_breakdown && "error" in design.price_breakdown ? (
                          <p style={{ color: "#4d4d49", fontSize: 13, margin: "8px 0 0" }}>
                            {String((design.price_breakdown as { error?: string }).error)}
                          </p>
                        ) : null}

                        {product && product.surcharges.length > 0 ? (
                          <details style={{ marginTop: 8 }}>
                            <summary style={{ cursor: "pointer", fontSize: 13 }}>
                              Options &amp; upgrades ({design.surcharges.length} selected)
                            </summary>
                            <div style={surchargeList}>
                              {product.surcharges.map((s) => (
                                <label key={s.id} style={{ display: "flex", gap: 6, fontSize: 13, alignItems: "center" }}>
                                  <input
                                    type="checkbox"
                                    checked={design.surcharges.some((x) => x.id === s.id)}
                                    onChange={() => toggleSurcharge(li, design, s.id)}
                                  />
                                  {s.name}{" "}
                                  <span style={{ opacity: 0.6 }}>({surchargeHint(s)})</span>
                                </label>
                              ))}
                            </div>
                          </details>
                        ) : null}

                        {motorizationGroups.length > 0 ? (
                          <details style={{ marginTop: 8 }}>
                            <summary style={{ cursor: "pointer", fontSize: 13 }}>
                              Motorization ({design.motorization.length} selected)
                            </summary>
                            <div style={surchargeList}>
                              {motorizationGroups.flatMap((group) =>
                                group.options.map((option) => {
                                  const selected = design.motorization.some((m) => m.groupId === group.groupId && m.optionId === option.id);
                                  const priced = motorOptionPrice(productId, option);
                                  return (
                                    <label key={`${group.groupId}:${option.id}`} style={{ display: "flex", gap: 6, fontSize: 13, alignItems: "center", opacity: priced.unavailable && !selected ? 0.55 : 1 }}>
                                      <input
                                        type="checkbox"
                                        checked={selected}
                                        disabled={busy || (priced.unavailable && !selected)}
                                        onChange={() => toggleMotorization(li, design, group.groupId, option.id)}
                                      />
                                      {group.name}: {option.name}{" "}
                                      <span style={{ opacity: 0.6 }}>{motorOptionHint(productId, option)}</span>
                                    </label>
                                  );
                                }),
                              )}
                            </div>
                          </details>
                        ) : null}

                        {priceOk && design.price_breakdown ? (
                          <details style={{ marginTop: 8 }}>
                            <summary style={{ cursor: "pointer", fontSize: 13 }}>Why this price?</summary>
                            <PriceExplanation breakdown={design.price_breakdown as PriceBreakdown} quantity={Math.max(1, Math.floor(Number(li.quantity) || 1))} />
                          </details>
                        ) : null}
                      </div>
                    );
                  })}

                  <button type="button" style={addBtn} disabled={busy} onClick={() => addDesign(li)}>
                    + Add alternative option
                  </button>
                </div>
              </section>
            ))}

            <button type="button" style={primaryBtn} disabled={busy} onClick={addWindow}>
              + Add window
            </button>

            <Adjustments key={quote.id} quote={quote} busy={busy} onSave={saveAdjustments} />

            {/* Bottom action bar (dedicated page only) — customer/total + send/contract/link.
                On the overlay mode these live in the header; here they go at the bottom
                so the top stays clean for product/room add-buttons. */}
            {embedded ? (
              <div style={{ marginTop: 16, padding: 14, borderTop: "2px solid #0b0b0b", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <strong>{quote?.customer_name || quote?.quote_number || "Quote"}</strong>
                  <span style={{ marginLeft: 8, fontSize: 16 }}>{money(quote?.quote_total)}</span>
                  <span style={{ ...savingPill, marginLeft: 8 }}>{busy ? "Saving…" : "Saved"}</span>
                </div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ display: "inline-flex", border: "1px solid #d8d5cf", borderRadius: 6, overflow: "hidden" }}>
                    {(["both", "email", "sms"] as const).map((c) => (
                      <button key={c} type="button" style={{ ...segBtn, ...(sendChannel === c ? segBtnActive : {}) }} onClick={() => setSendChannel(c)}>
                        {c === "both" ? "Email+Text" : c === "email" ? "Email" : "Text"}
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={sendToCustomer} disabled={busy} style={{ ...closeBtn, background: "#111111", color: "#ffffff", borderColor: "#111111" }}>
                    Send
                  </button>
                  <button type="button" onClick={openContract} style={closeBtn}>
                    Contract
                  </button>
                  <button type="button" onClick={shareLink} style={closeBtn}>
                    {shareUrl ? "Link ✓" : "Link"}
                  </button>
                </div>
              </div>
            ) : null}

            {measuringId ? (() => {
              const target = quote.lineItems.find((x) => x.id === measuringId);
              if (!target) return null;
              return (
                <MeasurementGridModal
                  widthIn={target.width_in}
                  heightIn={target.height_in}
                  onClose={() => setMeasuringId(null)}
                  onSave={(w, h) => {
                    patchWindow(target.id, { width_in: w, height_in: h });
                    setMeasuringId(null);
                  }}
                />
              );
            })() : null}
          </div>
        )}
      </div>
  );

  return embedded ? inner : (
    <div className="qb-overlay" role="dialog" aria-modal="true" style={overlayStyle}>
      {inner}
    </div>
  );
}

function PricingReferencePanel({ reference }: { reference: UiPricingReference }) {
  const [programKey, setProgramKey] = useState(reference.programs[0] ? pricingProgramKey(reference.programs[0]) : "");
  const program = reference.programs.find((item) => pricingProgramKey(item) === programKey) || reference.programs[0];

  if (!program) {
    return <p style={{ fontSize: 13, opacity: 0.7 }}>No pricing programs found.</p>;
  }

  return (
    <section style={pricingReferencePanel}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
        <Field label="Reference grid">
          <select value={pricingProgramKey(program)} onChange={(event) => setProgramKey(event.target.value)}>
            {reference.programs.map((item) => (
              <option key={pricingProgramKey(item)} value={pricingProgramKey(item)}>
                {item.productName} - {item.programName}
                {item.provisional ? " (provisional)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          {reference.source}
          {reference.effectiveDate ? ` / ${reference.effectiveDate}` : ""}
        </div>
      </div>

      <div style={{ marginTop: 8, fontSize: 13 }}>
        <strong>{program.productName}</strong> / {program.programName}
        {program.priceGroup ? ` / ${program.priceGroup}` : ""} / {program.priceAxis}
        {program.source ? <span style={{ opacity: 0.65 }}> / {program.source}</span> : null}
      </div>

      {program.priceAxis === "sqft" ? (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8, fontSize: 13 }}>
          <span>Retail: <strong>{program.pricePerSqft == null ? "N/A" : money(program.pricePerSqft)} / sq ft</strong></span>
          <span>Minimum: <strong>{program.minSqft ?? 0} sq ft</strong></span>
          <span>Max width: <strong>{program.maxWidth ?? "N/A"}</strong></span>
          <span>Max height: <strong>{program.maxHeight ?? "N/A"}</strong></span>
        </div>
      ) : (
        <PricingGrid program={program} />
      )}
    </section>
  );
}

function pricingProgramKey(program: UiPricingReferenceProgram) {
  return `${program.productId}::${program.programId}`;
}

function PricingGrid({ program }: { program: UiPricingReferenceProgram }) {
  const rowLabels = program.heights.length ? program.heights : [null];
  const rows = program.heights.length ? program.prices : [program.prices[0] || []];

  return (
    <div style={{ overflowX: "auto", marginTop: 8, border: "1px solid #e5e7eb", borderRadius: 6 }}>
      <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: Math.max(520, program.widths.length * 70) }}>
        <thead>
          <tr>
            <th style={priceCellStyle}>{program.heights.length ? "H / W" : "Width"}</th>
            {program.widths.map((width) => (
              <th key={width} style={priceCellStyle}>{width}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowLabels[index] ?? "width"}>
              <th style={priceCellStyle}>{rowLabels[index] ?? "Price"}</th>
              {program.widths.map((width, colIndex) => (
                <td key={`${width}-${colIndex}`} style={priceCellStyle}>
                  {row[colIndex] == null ? "N/A" : money(row[colIndex])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Field({ label, children, width }: { label: string; children: ReactNode; width?: number }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", fontSize: 12, gap: 3, width }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      {children}
    </label>
  );
}

type MeasStep = "width_whole" | "width_fraction" | "height_whole" | "height_fraction";

// Whole-inch cells offered in the sizing grid (10"-119" covers every standard
// window treatment; outliers fall back to the manual entry row below the grid).
const MEAS_WHOLES: number[] = Array.from({ length: 110 }, (_, i) => i + 10);

/**
 * MTS-style measurement sizing grid: a 4-step click wizard
 * (W whole -> W fraction -> H whole -> H fraction) plus a manual-entry row.
 * Self-contained — seeds from the line item's current dimensions on each open
 * (the panel mounts it only while open), so it never drifts out of sync.
 */
function MeasurementGridModal({
  widthIn,
  heightIn,
  onClose,
  onSave,
}: {
  widthIn: number | null;
  heightIn: number | null;
  onClose: () => void;
  onSave: (widthIn: number, heightIn: number) => void;
}) {
  const seedW = splitInches(widthIn);
  const seedH = splitInches(heightIn);
  const [step, setStep] = useState<MeasStep>("width_whole");
  const [wWhole, setWWhole] = useState<number>(seedW.whole || 0);
  const [wFrac, setWFrac] = useState<string>(seedW.fraction);
  const [hWhole, setHWhole] = useState<number>(seedH.whole || 0);
  const [hFrac, setHFrac] = useState<string>(seedH.fraction);

  const isWidth = step === "width_whole" || step === "width_fraction";
  const isFrac = step === "width_fraction" || step === "height_fraction";
  const axisLabel = isWidth ? "Width" : "Height";
  const stepTitle = isFrac
    ? `Select fraction for ${axisLabel.toLowerCase()}`
    : `Select whole inches for ${axisLabel.toLowerCase()}`;
  const curWhole = isWidth ? wWhole : hWhole;
  const curFrac = isWidth ? wFrac : hFrac;
  const canSave = wWhole > 0 && hWhole > 0;

  function pickWhole(n: number) {
    if (step === "width_whole") {
      setWWhole(n);
      setStep("width_fraction");
    } else if (step === "height_whole") {
      setHWhole(n);
      setStep("height_fraction");
    }
  }
  function pickFrac(f: string) {
    if (step === "width_fraction") {
      setWFrac(f);
      setStep("height_whole");
    } else if (step === "height_fraction") {
      setHFrac(f);
      onSave(toInches(wWhole, wFrac), toInches(hWhole, f));
    }
  }
  function back() {
    if (step === "width_fraction") setStep("width_whole");
    else if (step === "height_whole") setStep("width_fraction");
    else if (step === "height_fraction") setStep("height_whole");
  }

  return (
    <div className="meas-overlay" role="dialog" aria-modal="true" style={measOverlay}>
      <div style={measBox}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <strong style={{ fontSize: 17 }}>{axisLabel}</strong>
          <div style={{ fontSize: 14, display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontWeight: 600, color: isWidth ? "#111111" : "#8a8a85" }}>
              W: {wWhole > 0 ? formatInches(toInches(wWhole, wFrac)) : "—"}
            </span>
            <span style={{ opacity: 0.5 }}>×</span>
            <span style={{ fontWeight: 600, color: !isWidth ? "#111111" : "#8a8a85" }}>
              H: {hWhole > 0 ? formatInches(toInches(hWhole, hFrac)) : "—"}
            </span>
          </div>
        </div>
        <p style={{ margin: "6px 0 12px", fontSize: 13, opacity: 0.7 }}>{stepTitle}</p>

        <div style={measGrid}>
          {!isFrac
            ? MEAS_WHOLES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => pickWhole(n)}
                  style={{ ...measCell, ...(n === curWhole ? measCellActive : {}) }}
                >
                  {n}
                </button>
              ))
            : FRACTION_STEPS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => pickFrac(f)}
                  style={{ ...measCell, ...(f === curFrac ? measCellActive : {}) }}
                >
                  {f === "0" ? "0 (even)" : f}
                </button>
              ))}
        </div>

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #eeeeeb", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <MeasManual label="Width" whole={wWhole} frac={wFrac} onWhole={setWWhole} onFrac={setWFrac} />
          <MeasManual label="Height" whole={hWhole} frac={hFrac} onWhole={setHWhole} onFrac={setHFrac} />
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button type="button" style={ghostBtn} onClick={back} disabled={step === "width_whole"}>
            Back
          </button>
          <button type="button" style={ghostBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            style={{ ...primaryBtn, marginTop: 0 }}
            disabled={!canSave}
            onClick={() => onSave(toInches(wWhole, wFrac), toInches(hWhole, hFrac))}
          >
            Save size
          </button>
        </div>
      </div>
    </div>
  );
}

function MeasManual({
  label,
  whole,
  frac,
  onWhole,
  onFrac,
}: {
  label: string;
  whole: number;
  frac: string;
  onWhole: (n: number) => void;
  onFrac: (f: string) => void;
}) {
  return (
    <Field label={label} width={150}>
      <div style={{ display: "flex", gap: 4 }}>
        <input
          type="number"
          min="0"
          step="1"
          value={Number.isFinite(whole) ? whole : 0}
          onChange={(e) => onWhole(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          style={{ width: 64 }}
        />
        <select value={frac} onChange={(e) => onFrac(e.target.value)}>
          {FRACTION_STEPS.map((s) => (
            <option key={s} value={s}>
              {s === "0" ? '0"' : `${s}"`}
            </option>
          ))}
        </select>
      </div>
    </Field>
  );
}

function PriceExplanation({ breakdown, quantity }: { breakdown: PriceBreakdown; quantity: number }) {
  const rows = summarizePriceBreakdown(breakdown, quantity);
  return (
    <div style={{ marginTop: 6, fontSize: 13 }}>
      {rows.map((row, i) => {
        const isTotal = row.kind === "total";
        const isBase = row.kind === "base";
        const muted = row.kind === "surcharge" || row.kind === "qty" || row.kind === "once";
        return (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "2px 0",
              fontWeight: isTotal || isBase ? 700 : 400,
              color: row.kind === "discount" ? "#6b530a" : "#0b0b0b",
              ...(isTotal ? { borderTop: "1px solid #eeeeeb", marginTop: 4, paddingTop: 4 } : {}),
            }}
          >
            <span style={{ opacity: muted ? 0.75 : 1 }}>{row.label}</span>
            <span>{row.amount}</span>
          </div>
        );
      })}
    </div>
  );
}

function DetailControl({ field, value, onChange }: { field: UiDetailField; value: DetailValue | undefined; onChange: (value: DetailValue) => void }) {
  if (field.type === "checkbox") {
    return (
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, minHeight: 34 }}>
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        <span>{field.label}</span>
      </label>
    );
  }
  return (
    <Field label={field.label}>
      <select value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">-- choose --</option>
        {(field.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

function BreakRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 14 }}>
      <span style={{ opacity: 0.75 }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Adjustments({ quote, busy, onSave }: { quote: CrmQuoteWithItems; busy: boolean; onSave: (adj: Record<string, unknown>) => void }) {
  const adjRaw = ((quote.meta || {}) as Record<string, unknown>).adjustments;
  const adj = (adjRaw && typeof adjRaw === "object" ? adjRaw : {}) as Record<string, unknown>;
  const [discountPercent, setDiscountPercent] = useState(adj.discountPercent ? String(adj.discountPercent) : "");
  const [taxPercent, setTaxPercent] = useState(adj.taxPercent ? String(adj.taxPercent) : "");
  const [depositPercent, setDepositPercent] = useState(adj.depositPercent ? String(adj.depositPercent) : "");
  const [fees, setFees] = useState<{ name: string; amount: string }[]>(
    Array.isArray(adj.fees)
      ? (adj.fees as { name?: unknown; amount?: unknown }[]).map((f) => ({ name: String(f.name ?? ""), amount: String(f.amount ?? "") }))
      : [],
  );

  const subtotal = quote.lineItems.reduce((s, li) => {
    return s + lineSubtotal(li);
  }, 0);
  const wholesaleSubtotal = quote.lineItems.reduce<number | null>((sum, li) => {
    if (sum == null) return null;
    const d = li.designs.find((x) => x.id === li.selected_design_id);
    if (!d || d.price_status !== "ok") return sum;
    if (d.wholesale_unit_price == null) return null;
    return sum + d.wholesale_unit_price * Math.max(1, li.quantity || 1);
  }, 0);

  function apply() {
    onSave({
      discountPercent: Number(discountPercent) || 0,
      taxPercent: Number(taxPercent) || 0,
      depositPercent: Number(depositPercent) || 0,
      fees: fees.filter((f) => Number(f.amount) > 0).map((f) => ({ name: f.name || "Fee", amount: Number(f.amount) })),
    });
  }

  return (
    <div style={{ marginTop: 16, border: "1px solid #d8d8d2", borderRadius: 8, padding: 14 }}>
      <strong style={{ fontSize: 13 }}>Adjustments</strong>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <Field label="Discount %" width={90}>
          <input type="number" min="0" max="100" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} />
        </Field>
        <Field label="Tax %" width={90}>
          <input type="number" min="0" max="100" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} />
        </Field>
        <Field label="Deposit %" width={90}>
          <input type="number" min="0" max="100" value={depositPercent} onChange={(e) => setDepositPercent(e.target.value)} />
        </Field>
      </div>
      <div style={{ marginTop: 10 }}>
        {fees.map((f, i) => (
          <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input
              placeholder="Fee name (e.g. Install)"
              value={f.name}
              onChange={(e) => setFees(fees.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              style={{ flex: 1 }}
            />
            <input
              type="number"
              min="0"
              placeholder="$"
              value={f.amount}
              onChange={(e) => setFees(fees.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
              style={{ width: 90 }}
            />
            <button type="button" style={ghostBtn} onClick={() => setFees(fees.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" style={addBtn} onClick={() => setFees([...fees, { name: "", amount: "" }])}>
          + Add fee
        </button>
      </div>
      <button type="button" style={{ ...primaryBtn, marginTop: 10 }} disabled={busy} onClick={apply}>
        Apply adjustments
      </button>

      <div style={{ marginTop: 14 }}>
        <BreakRow label="Subtotal" value={money(subtotal)} />
        {wholesaleSubtotal != null && wholesaleSubtotal > 0 ? (
          <>
            <BreakRow label="Internal wholesale" value={money(wholesaleSubtotal)} />
            <BreakRow label="Internal gross margin" value={money(subtotal - wholesaleSubtotal)} />
          </>
        ) : null}
        {quote.discount > 0 ? <BreakRow label="Discount" value={`- ${money(quote.discount)}`} /> : null}
        {quote.tax > 0 ? <BreakRow label="Tax" value={money(quote.tax)} /> : null}
        <div style={totalsBar}>
          <span>Total</span>
          <strong>{money(quote.quote_total)}</strong>
        </div>
        {quote.deposit_required > 0 ? <BreakRow label="Deposit due" value={money(quote.deposit_required)} /> : null}
        {quote.balance_due > 0 ? <BreakRow label="Balance" value={money(quote.balance_due)} /> : null}
      </div>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(17,17,17,0.55)",
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  zIndex: 9999,
  padding: "24px 12px",
};
const panelStyle: CSSProperties = {
  background: "#ffffff",
  color: "#0b0b0b",
  borderRadius: 12,
  width: "min(960px, 100%)",
  maxHeight: "92vh",
  display: "flex",
  flexDirection: "column",
  boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
};
const embeddedPanelStyle: CSSProperties = {
  background: "#ffffff",
  color: "#0b0b0b",
  width: "100%",
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
};
const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "16px 20px",
  borderBottom: "1px solid #d8d8d2",
};
const savingPill: CSSProperties = {
  display: "inline-block",
  marginTop: 4,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: "#6b6b66",
};
const floatingTotalStyle: CSSProperties = {
  position: "fixed",
  bottom: 16,
  right: 16,
  zIndex: 1200,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: 2,
  background: "#0b0b0b",
  color: "#ffffff",
  padding: "10px 16px",
  borderRadius: 10,
  boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
};
const windowCard: CSSProperties = { border: "1px solid #d8d8d2", borderRadius: 10, padding: 14, marginBottom: 14, background: "#fbfbfa" };
const designCard: CSSProperties = { border: "2px solid #d8d8d2", borderRadius: 8, padding: 12, background: "#ffffff" };
const detailGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid #eeeeeb" };
const surchargeList: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, maxHeight: 180, overflowY: "auto", marginTop: 8, padding: 8, border: "1px solid #eeeeeb", borderRadius: 6 };
const totalsBar: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, padding: "12px 16px", background: "#0b0b0b", color: "#ffffff", borderRadius: 8, fontSize: 18 };
const closeBtn: CSSProperties = { border: "1px solid #d8d8d2", background: "#ffffff", borderRadius: 6, padding: "6px 14px", cursor: "pointer" };
const xBtn: CSSProperties = {
  border: "1px solid #d8d5cf",
  background: "#ffffff",
  color: "#0b0b0b",
  borderRadius: 8,
  width: 36,
  height: 36,
  fontSize: 18,
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
const stickyAddBar: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 10,
  order: -1,
  background: "#ffffff",
  margin: "0 -16px 0",
  padding: "8px 16px",
  borderBottom: "2px solid #0b0b0b",
};
const ghostBtn: CSSProperties = { border: "1px solid #d8d8d2", background: "#ffffff", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12 };
const primaryBtn: CSSProperties = { border: "none", background: "#111111", color: "#ffffff", borderRadius: 8, padding: "10px 16px", cursor: "pointer", marginTop: 6, fontWeight: 600 };
const addBtn: CSSProperties = { border: "1px dashed #b8b6ae", background: "#ffffff", borderRadius: 6, padding: "8px 12px", cursor: "pointer", fontSize: 13 };
const errorStyle: CSSProperties = { color: "#4d4d49", background: "#f4f4f2", padding: "8px 16px", margin: 0 };
const pricingReferencePanel: CSSProperties = { border: "1px solid #d8d8d2", borderRadius: 8, padding: 12, marginBottom: 14, background: "#fbfbfa" };
const priceCellStyle: CSSProperties = { border: "1px solid #e5e7eb", padding: "5px 7px", textAlign: "right", whiteSpace: "nowrap" };
const sectionLabel: CSSProperties = { fontSize: 11, letterSpacing: 1, textTransform: "uppercase", opacity: 0.7, marginBottom: 8, fontWeight: 600 };
const tileRow: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };
const productTile: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "2px solid #d8d8d2",
  borderRadius: 8,
  padding: "10px 16px",
  cursor: "pointer",
  minWidth: 150,
  minHeight: 46,
  fontSize: 14,
  fontWeight: 800,
  lineHeight: 1.15,
  textAlign: "center",
  textWrap: "balance",
};
const productTileLabel: CSSProperties = {
  display: "block",
  color: "#0b0b0b",
  fontSize: 14,
  fontWeight: 800,
  lineHeight: 1.15,
  textAlign: "center",
};
const roomPill: CSSProperties = {
  border: "1px solid #c8d2d8",
  background: "#edf3f6",
  borderRadius: 8,
  padding: "10px 14px",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  color: "#10202a",
  minHeight: 44,
};
const customRoomInput: CSSProperties = {
  border: "1px solid #c8d2d8",
  background: "#fbfdfe",
  borderRadius: 8,
  padding: "10px 14px",
  fontSize: 13,
  width: 146,
  minHeight: 44,
};
const sizeChip: CSSProperties = {
  border: "1px solid #c8d2d8",
  background: "#edf3f6",
  borderRadius: 8,
  padding: "10px 14px",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  color: "#10202a",
  minHeight: 44,
  minWidth: 160,
};
const discountToolbar: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 12,
  padding: 10,
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  background: "#fbfbfa",
};
const copyBar: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  justifyContent: "space-between",
  marginBottom: 12,
  padding: "12px 14px",
  border: "2px solid #0b0b0b",
  borderRadius: 10,
  background: "#fbfbfa",
  color: "#0b0b0b",
};
const variantTabStrip: CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  marginTop: 12,
};
const variantTab: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid #d8d5cf",
  background: "#ffffff",
  color: "#0b0b0b",
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
  fontSize: 13,
};
const variantTabActive: CSSProperties = {
  borderColor: "#0b0b0b",
  background: "#0b0b0b",
  color: "#ffffff",
};
const segBtn: CSSProperties = {
  border: "none",
  background: "#ffffff",
  color: "#0b0b0b",
  padding: "8px 12px",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};
const segBtnActive: CSSProperties = {
  background: "#0b0b0b",
  color: "#ffffff",
};
const discountBadge: CSSProperties = {
  border: "1px solid #b9a23e",
  background: "#faf3d6",
  color: "#6b530a",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 700,
  alignSelf: "center",
};
const measOverlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(17,17,17,0.55)",
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  zIndex: 1100,
  padding: "24px 12px",
};
const measBox: CSSProperties = {
  background: "#ffffff",
  color: "#0b0b0b",
  borderRadius: 12,
  width: "min(760px, 100%)",
  maxHeight: "92vh",
  overflowY: "auto",
  padding: 20,
  boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
};
const measGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(54px, 1fr))",
  gap: 6,
};
const measCell: CSSProperties = {
  height: 44,
  borderRadius: 8,
  border: "1px solid #d8d5cf",
  background: "#fbfbfa",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
  color: "#0b0b0b",
};
const measCellActive: CSSProperties = {
  background: "#111111",
  color: "#ffffff",
  borderColor: "#111111",
};
