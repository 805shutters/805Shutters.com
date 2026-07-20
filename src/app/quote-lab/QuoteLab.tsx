"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  QuoteLabCatalogResponse,
  QuoteLabComparison,
  QuoteLabQuoteInput,
} from "@/lib/quote-lab/types";
import { QuoteLabAccessGate } from "./QuoteLabAccessGate";
import { QuoteLabBuilder } from "./QuoteLabBuilder";
import styles from "./QuoteLab.module.css";

type AccessState = "loading" | "locked" | "ready" | "misconfigured";

function cloneQuote(quote: QuoteLabQuoteInput): QuoteLabQuoteInput {
  return structuredClone(quote);
}

export function QuoteLab() {
  const [access, setAccess] = useState<AccessState>("loading");
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<QuoteLabCatalogResponse | null>(null);
  const [quote, setQuote] = useState<QuoteLabQuoteInput | null>(null);
  const [fixtureId, setFixtureId] = useState("");
  const [comparison, setComparison] = useState<QuoteLabComparison | null>(null);
  const [pricing, setPricing] = useState(false);
  const [pricingRevision, setPricingRevision] = useState(0);
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
        setPricing(true);
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

  useEffect(() => {
    if (access !== "ready" || !quote) return;
    if (quote.lines.length === 0) {
      setComparison(null);
      setPricing(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPricing(true);
      setError(null);
      try {
        const response = await fetch("/api/quote-lab/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(quote),
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => ({}))) as { comparison?: QuoteLabComparison; error?: string };
        if (response.status === 401) {
          setAccess("locked");
          return;
        }
        if (!response.ok || !body.comparison) throw new Error(body.error || "Authoritative pricing failed.");
        setComparison(body.comparison);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "Authoritative pricing failed.");
      } finally {
        if (!controller.signal.aborted) setPricing(false);
      }
    }, pricingRevision > 0 ? 0 : 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [access, pricingRevision, quote]);

  function loadFixture(id: string) {
    if (!catalog) return;
    if (id === "custom") {
      setFixtureId("custom");
      return;
    }
    const fixture = catalog.fixtures.find((candidate) => candidate.id === id);
    if (!fixture) return;
    setFixtureId(id);
    setQuote(cloneQuote(fixture.quote));
    setComparison(null);
    setPricing(true);
    setError(null);
  }

  function changeQuote(nextQuote: QuoteLabQuoteInput) {
    setFixtureId("custom");
    setQuote(nextQuote);
    setPricing(nextQuote.lines.length > 0);
    setError(null);
  }

  async function logout() {
    await fetch("/api/quote-lab/access", { method: "DELETE" });
    setCatalog(null);
    setQuote(null);
    setComparison(null);
    setAccess("locked");
  }

  if (access === "loading") {
    return <main className={styles.loading}>Loading isolated Quote Builder…</main>;
  }
  if (access === "locked") {
    return <QuoteLabAccessGate onUnlocked={loadCatalog} onMisconfigured={(message) => { setConfigurationError(message); setAccess("misconfigured"); }} />;
  }
  if (access === "misconfigured") {
    return <main className={styles.loading}><strong>Quote Builder unavailable</strong><span>{configurationError}</span></main>;
  }
  if (!catalog || !quote) return null;

  return (
    <QuoteLabBuilder
      catalog={catalog}
      quote={quote}
      fixtureId={fixtureId || "custom"}
      comparison={comparison}
      pricing={pricing}
      error={error}
      onLoadFixture={loadFixture}
      onQuoteChange={changeQuote}
      onReprice={() => setPricingRevision((revision) => revision + 1)}
      onLogout={() => { void logout(); }}
    />
  );
}
