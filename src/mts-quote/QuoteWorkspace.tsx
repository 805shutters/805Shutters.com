"use client";

// Host for the ported quote builder inside the 805 Next.js app.
// Faithful re-creation of the original Dashboard / Builder / Contract tab shell
// minus the old CRMLayout chrome
// and role-gating (the 805 site is always the 805 operator context; the store
// already defaults activeAccountId to SHUTTERS_805).
//
// Everything renders inside `.mts-quote-scope` so the scoped Tailwind layer
// applies and the marketing site's plain CSS is untouched. Radix portals are
// routed back into the scope element via PortalContainerContext.
import "./mts-quote.css";

import { Fragment, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { LayoutDashboard, Hammer, FileSignature, Plus, TableProperties } from "lucide-react";
import { cn } from "@mts/lib/utils";
import { useQuoteBuilderStore } from "@mts/stores/quoteBuilderStore";
import { QuoteDashboard } from "@mts/components/crm/quote-builder/QuoteDashboard";
import { QuoteBuilder } from "@mts/components/crm/quote-builder/QuoteBuilder";
import { QuoteContract } from "@mts/components/crm/quote-builder/QuoteContract";
import { PricingGrids } from "@mts/components/crm/quote-builder/PricingGrids";
import { PortalContainerContext } from "@mts/lib/portal-container";
import type { CrmCalendarEvent, CrmJob, CrmQuote } from "@/lib/crm/types";

const tabs = [
  { value: "dashboard", label: "Dashboard", icon: LayoutDashboard, requiresQuote: false },
  { value: "builder", label: "Builder", icon: Hammer, requiresQuote: true },
  { value: "pricing", label: "Pricing Grids", icon: TableProperties, requiresQuote: false },
  { value: "contract", label: "Contract", icon: FileSignature, requiresQuote: true },
] as const;

type QuoteWorkspaceProps = {
  crmJobs?: CrmJob[];
  crmQuotes?: CrmQuote[];
  crmCalendarEvents?: CrmCalendarEvent[];
  onOpenCrmCalendarDate?: (date: string) => void;
  onOpenCrmQuote?: (quoteId: string) => void;
};

export function QuoteWorkspace({
  crmJobs = [],
  crmQuotes = [],
  crmCalendarEvents = [],
  onOpenCrmCalendarDate,
  onOpenCrmQuote,
}: QuoteWorkspaceProps = {}) {
  const [queryClient] = useState(() => new QueryClient());
  const [scopeEl, setScopeEl] = useState<HTMLDivElement | null>(null);
  const [newQuoteRequest, setNewQuoteRequest] = useState(0);
  const { activeTab, setActiveTab, activeQuoteId } = useQuoteBuilderStore();

  // dashboard/builder/pricing/contract only; anything else falls back to dashboard
  const effectiveTab =
    activeTab === "builder" || activeTab === "pricing" || activeTab === "contract"
      ? activeTab
      : "dashboard";

  const handleNewQuoteClick = () => {
    setActiveTab("dashboard");
    setNewQuoteRequest((request) => request + 1);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <PortalContainerContext.Provider value={scopeEl}>
        <div
          ref={setScopeEl}
          className="mts-quote-scope min-h-full bg-[#f3f3f0] light"
          data-theme="light"
        >
          {/* Tab buttons (hidden in the full-screen builder — its slim bar carries the toggle + X) */}
          {effectiveTab !== "builder" && (
            <div className="sticky top-0 z-40 border-b border-[#d6d5cf] bg-white/95 px-4 py-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/85 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = effectiveTab === tab.value;
                  const isDisabled = tab.requiresQuote && !activeQuoteId;

                  return (
                    <Fragment key={tab.value}>
                      <button
                        onClick={() => !isDisabled && setActiveTab(tab.value)}
                        disabled={isDisabled}
                        className={cn(
                          "flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition-all",
                          isDisabled && "opacity-40 cursor-not-allowed",
                          isActive
                            ? "bg-[#0b0b0b] text-white border-[#0b0b0b] shadow-md"
                            : "bg-white border-[#0b0b0b]/30 text-[#1c1c1a] hover:border-[#0b0b0b] hover:shadow-sm"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {tab.label}
                      </button>
                      {tab.value === "dashboard" && (
                        <button
                          type="button"
                          onClick={handleNewQuoteClick}
                          className="flex items-center gap-2 rounded-md border border-[#b9b7b0] bg-[#e5e4e2] px-4 py-2 text-sm font-semibold text-[#0b0b0b] shadow-md transition-all hover:bg-[#f4f3ef]"
                        >
                          <Plus className="h-4 w-4" />
                          New Quote
                        </button>
                      )}
                    </Fragment>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tab content */}
          <div>
            {effectiveTab === "dashboard" && (
              <QuoteDashboard
                quoteOperatorMode={false}
                newQuoteRequest={newQuoteRequest}
                crmJobs={crmJobs}
                crmQuotes={crmQuotes}
                crmCalendarEvents={crmCalendarEvents}
                onOpenCrmCalendarDate={onOpenCrmCalendarDate}
                onOpenCrmQuote={onOpenCrmQuote}
              />
            )}
            {effectiveTab === "builder" && <QuoteBuilder />}
            {effectiveTab === "pricing" && <PricingGrids />}
            {effectiveTab === "contract" && <QuoteContract />}
          </div>

          <Toaster richColors position="top-right" />
        </div>
      </PortalContainerContext.Provider>
    </QueryClientProvider>
  );
}

export default QuoteWorkspace;
