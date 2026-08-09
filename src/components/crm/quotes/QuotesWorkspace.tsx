"use client";

import type { Session } from "@supabase/supabase-js";
import type { CrmCalendarEvent, CrmCustomer, CrmJob, CrmQuote } from "@/lib/crm/types";
import type { QuoteWorkspaceOpenRequest, QuoteWorkspaceOpenTab } from "@mts/QuoteWorkspace";
import { QuoteWorkspace } from "@mts/QuoteWorkspace";

type Props = {
  session: Session;
  jobs: CrmJob[];
  quotes: CrmQuote[];
  events: CrmCalendarEvent[];
  customers?: CrmCustomer[];
  openRequest?: QuoteWorkspaceOpenRequest | null;
  onOpenCrmQuote?: (quoteId: string, tab?: QuoteWorkspaceOpenTab) => void;
  onOpenCalendarDate?: (date: string) => void;
  onChanged: () => void;
};

export function QuotesWorkspace({
  jobs,
  quotes,
  events,
  openRequest,
  onOpenCalendarDate,
  onOpenCrmQuote,
}: Props) {
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
