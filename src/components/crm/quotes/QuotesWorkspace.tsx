"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { CrmCalendarEvent, CrmCustomer, CrmJob, CrmQuote } from "@/lib/crm/types";
import { QuoteWorkspace, type QuoteWorkspaceOpenRequest, type QuoteWorkspaceOpenTab } from "@mts/QuoteWorkspace";
import { QuotesWorkspace as LegacyQuotesWorkspace } from "./QuotesWorkspace.legacy";

// The Quotes workspace (Dashboard / Builder / Contract) renders the ported
// quote builder from src/mts-quote against the dedicated 805 Supabase project,
// while also using CRM-passed jobs/quotes to keep the dashboard tiles aligned
// with the live CRM lifecycle state.
//
type QuoteSystem = "v1" | "v2";
const QUOTE_SYSTEM_STORAGE_KEY = "805.crm.quote-system";

function initialQuoteSystem(): QuoteSystem {
  if (typeof window === "undefined") return "v2";
  const requested = new URLSearchParams(window.location.search).get("quoteSystem");
  if (requested === "v1" || requested === "v2") return requested;
  return window.localStorage.getItem(QUOTE_SYSTEM_STORAGE_KEY) === "v1" ? "v1" : "v2";
}
type Props = {
  session: Session;
  jobs: CrmJob[];
  quotes: CrmQuote[];
  events: CrmCalendarEvent[];
  customers: CrmCustomer[];
  openRequest?: QuoteWorkspaceOpenRequest | null;
  onOpenCrmQuote?: (quoteId: string, tab?: QuoteWorkspaceOpenTab) => void;
  onOpenCalendarDate?: (date: string) => void;
  onChanged: () => void;
};

export function QuotesWorkspace({ session, jobs, quotes, events, customers, openRequest, onChanged, onOpenCalendarDate, onOpenCrmQuote }: Props) {
  const [quoteSystem, setQuoteSystem] = useState<QuoteSystem>(initialQuoteSystem);

  useEffect(() => {
    if (openRequest?.quoteId) setQuoteSystem("v2");
  }, [openRequest?.quoteId, openRequest?.requestId]);

  const selectQuoteSystem = (next: QuoteSystem) => {
    setQuoteSystem(next);
    window.localStorage.setItem(QUOTE_SYSTEM_STORAGE_KEY, next);
    const url = new URL(window.location.href);
    url.searchParams.set("quoteSystem", next);
    window.history.replaceState({}, "", url);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <div>
          <span className="font-semibold">Quote system:</span>{" "}
          {quoteSystem === "v2" ? "V2 is active." : "V1 rollback is active."}
          <span className="ml-1 text-amber-800">Both systems remain available.</span>
        </div>
        <div className="inline-flex rounded-md border border-amber-300 bg-white p-0.5" role="group" aria-label="Quote system">
          {(["v2", "v1"] as const).map((system) => (
            <button
              key={system}
              type="button"
              onClick={() => selectQuoteSystem(system)}
              aria-pressed={quoteSystem === system}
              className={`rounded px-3 py-1.5 font-semibold transition-colors ${
                quoteSystem === system ? "bg-amber-700 text-white" : "text-amber-900 hover:bg-amber-100"
              }`}
            >
              {system.toUpperCase()}{system === "v1" ? " rollback" : ""}
            </button>
          ))}
        </div>
      </div>

      {quoteSystem === "v1" ? (
        <LegacyQuotesWorkspace session={session} jobs={jobs} quotes={quotes} onChanged={onChanged} />
      ) : (
        <QuoteWorkspace
          crmJobs={jobs}
          crmQuotes={quotes}
          crmCalendarEvents={events}
          crmCustomers={customers}
          openRequest={openRequest}
          onOpenCrmCalendarDate={onOpenCalendarDate}
          onOpenCrmQuote={onOpenCrmQuote}
        />
      )}
    </div>
  );
}
