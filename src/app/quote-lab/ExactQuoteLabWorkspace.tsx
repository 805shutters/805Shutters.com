"use client";

import "@mts/mts-quote.css";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { QuoteBuilder } from "@mts/components/crm/quote-builder/QuoteBuilder";
import {
  QuoteBuilderDatabaseProvider,
  type QuoteBuilderDatabase,
} from "@mts/integrations/supabase/quoteBuilderDatabase";
import { PortalContainerContext } from "@mts/lib/portal-container";
import { useQuoteBuilderStore } from "@mts/stores/quoteBuilderStore";

export function ExactQuoteLabWorkspace({ database }: { database: QuoteBuilderDatabase }) {
  const [queryClient] = useState(() => new QueryClient());
  const [scopeEl, setScopeEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const store = useQuoteBuilderStore.getState();
    store.resetBuilder();
    store.setActiveQuote("quote-lab-exact");
    store.setActiveTab("builder");
    return () => useQuoteBuilderStore.getState().resetBuilder();
  }, []);

  return (
    <QuoteBuilderDatabaseProvider database={database} isolated preferStoredTotal>
      <QueryClientProvider client={queryClient}>
        <PortalContainerContext.Provider value={scopeEl}>
          <div
            ref={setScopeEl}
            className="mts-quote-scope min-h-screen bg-[#f3f3f0] light"
            data-theme="light"
            data-quote-lab-interface="exact-existing-builder"
          >
            <QuoteBuilder />
            <Toaster richColors position="top-right" />
          </div>
        </PortalContainerContext.Provider>
      </QueryClientProvider>
    </QuoteBuilderDatabaseProvider>
  );
}
