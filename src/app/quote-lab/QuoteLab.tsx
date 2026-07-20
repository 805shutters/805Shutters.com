"use client";

import { useCallback, useEffect, useState } from "react";
import type { QuoteBuilderDatabase } from "@mts/integrations/supabase/quoteBuilderDatabase";
import type { QuoteLabCatalogResponse, QuoteLabComparison } from "@/lib/quote-lab/types";
import { QuoteLabAccessGate } from "./QuoteLabAccessGate";
import { ExactQuoteLabWorkspace } from "./ExactQuoteLabWorkspace";
import { createExactQuoteLabDatabase } from "./quoteLabDatabase";
import styles from "./QuoteLab.module.css";

type AccessState = "loading" | "locked" | "ready" | "misconfigured";

export function QuoteLab() {
  const [access, setAccess] = useState<AccessState>("loading");
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const [database, setDatabase] = useState<QuoteBuilderDatabase | null>(null);

  useEffect(() => {
    document.body.classList.add("quote-lab-active");
    return () => document.body.classList.remove("quote-lab-active");
  }, []);

  const loadExactBuilder = useCallback(async () => {
    try {
      const catalogResponse = await fetch("/api/quote-lab/catalog", { cache: "no-store" });
      const catalogBody = (await catalogResponse.json().catch(() => ({}))) as QuoteLabCatalogResponse & { error?: string };
      if (catalogResponse.status === 401) {
        setAccess("locked");
        return;
      }
      if (!catalogResponse.ok) throw new Error(catalogBody.error || "Quote Lab catalog could not load.");

      const fixture = catalogBody.fixtures.find((candidate) => candidate.id === "forty-line-quote");
      if (!fixture) throw new Error("The 40-line exact-interface fixture is missing.");
      const comparisonResponse = await fetch("/api/quote-lab/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fixture.quote),
      });
      const comparisonBody = (await comparisonResponse.json().catch(() => ({}))) as {
        comparison?: QuoteLabComparison;
        error?: string;
      };
      if (!comparisonResponse.ok || !comparisonBody.comparison) {
        throw new Error(comparisonBody.error || "The authoritative backend could not price the test quote.");
      }

      setDatabase(createExactQuoteLabDatabase(catalogBody, fixture, comparisonBody.comparison));
      setAccess("ready");
    } catch (error) {
      setConfigurationError(error instanceof Error ? error.message : "Quote Builder could not load.");
      setAccess("misconfigured");
    }
  }, []);

  useEffect(() => {
    void loadExactBuilder();
  }, [loadExactBuilder]);

  if (access === "loading") {
    return <main className={styles.loading}>Loading the exact existing Quote Builder…</main>;
  }
  if (access === "locked") {
    return (
      <QuoteLabAccessGate
        onUnlocked={loadExactBuilder}
        onMisconfigured={(message) => {
          setConfigurationError(message);
          setAccess("misconfigured");
        }}
      />
    );
  }
  if (access === "misconfigured") {
    return (
      <main className={styles.loading}>
        <strong>Quote Builder unavailable</strong>
        <span>{configurationError}</span>
      </main>
    );
  }
  return database ? <ExactQuoteLabWorkspace database={database} /> : null;
}
