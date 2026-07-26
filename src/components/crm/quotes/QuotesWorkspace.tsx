"use client";

import type { Session } from "@supabase/supabase-js";
import type { CrmCalendarEvent, CrmCustomer, CrmJob, CrmQuote } from "@/lib/crm/types";
import { QuoteWorkspace, type QuoteWorkspaceOpenRequest, type QuoteWorkspaceOpenTab } from "@mts/QuoteWorkspace";

// The Quotes workspace (Dashboard / Builder / Contract) renders the ported
// quote builder from src/mts-quote against the dedicated 805 Supabase project,
// while also using CRM-passed jobs/quotes to keep the dashboard tiles aligned
// with the live CRM lifecycle state.
// QuotesWorkspace.legacy.tsx remains intact as the rollback implementation,
// but it is intentionally not reachable from the CRM interface.
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

export function QuotesWorkspace({ jobs, quotes, events, customers, openRequest, onOpenCalendarDate, onOpenCrmQuote }: Props) {
  return (
    <QuoteWorkspace
      crmJobs={jobs}
      crmQuotes={quotes}
      crmCalendarEvents={events}
      crmCustomers={customers}
      openRequest={openRequest}
      onOpenCrmCalendarDate={onOpenCalendarDate}
      onOpenCrmQuote={onOpenCrmQuote}
    />
  );
}
