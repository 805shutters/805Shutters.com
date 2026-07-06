"use client";

import type { Session } from "@supabase/supabase-js";
import type { CrmCalendarEvent, CrmJob, CrmQuote } from "@/lib/crm/types";
import { QuoteWorkspace, type QuoteWorkspaceOpenRequest, type QuoteWorkspaceOpenTab } from "@mts/QuoteWorkspace";

// The Quotes workspace (Dashboard / Builder / Contract) renders the ported
// quote builder from src/mts-quote against the dedicated 805 Supabase project,
// while also using CRM-passed jobs/quotes to keep the dashboard tiles aligned
// with the live CRM lifecycle state.
//
// The previous from-scratch implementation is kept in QuotesWorkspace.legacy.tsx
// as a fallback and is no longer the active path.
type Props = {
  session: Session;
  jobs: CrmJob[];
  quotes: CrmQuote[];
  events: CrmCalendarEvent[];
  openRequest?: QuoteWorkspaceOpenRequest | null;
  onOpenCrmQuote?: (quoteId: string, tab?: QuoteWorkspaceOpenTab) => void;
  onOpenCalendarDate?: (date: string) => void;
  onChanged: () => void;
};

export function QuotesWorkspace({ jobs, quotes, events, openRequest, onOpenCalendarDate, onOpenCrmQuote }: Props) {
  return (
    <QuoteWorkspace
      crmJobs={jobs}
      crmQuotes={quotes}
      crmCalendarEvents={events}
      openRequest={openRequest}
      onOpenCrmCalendarDate={onOpenCalendarDate}
      onOpenCrmQuote={onOpenCrmQuote}
    />
  );
}
