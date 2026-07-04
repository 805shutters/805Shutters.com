"use client";

import "@/mts-quote/mts-quote.css";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { QuoteContract } from "@mts/components/crm/quote-builder/QuoteContract";
import { PortalContainerContext } from "@mts/lib/portal-container";
import { useQuoteBuilderStore } from "@mts/stores/quoteBuilderStore";

export function QuoteContractPreviewStandalone({ quoteId }: { quoteId: string }) {
  const [queryClient] = useState(() => new QueryClient());
  const [scopeEl, setScopeEl] = useState<HTMLDivElement | null>(null);
  const setActiveQuote = useQuoteBuilderStore((state) => state.setActiveQuote);
  const setActiveTab = useQuoteBuilderStore((state) => state.setActiveTab);

  useEffect(() => {
    setActiveQuote(quoteId);
    setActiveTab("contract");
  }, [quoteId, setActiveQuote, setActiveTab]);

  return (
    <QueryClientProvider client={queryClient}>
      <PortalContainerContext.Provider value={scopeEl}>
        <div
          ref={setScopeEl}
          className="mts-quote-scope crm-quote-contract-preview min-h-screen bg-[#f3f3f0] light"
          data-theme="light"
        >
          <QuoteContract />
          <Toaster richColors position="top-right" />
        </div>
      </PortalContainerContext.Provider>
    </QueryClientProvider>
  );
}
