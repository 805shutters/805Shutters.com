"use client";

import type { Session } from "@supabase/supabase-js";
import type { CrmBookkeepingRow, CrmCalendarEvent, CrmCustomer, CrmJob, CrmQuote } from "@/lib/crm/types";
import type { QuoteWorkspaceOpenRequest, QuoteWorkspaceOpenTab } from "@mts/QuoteWorkspace";
import { QuoteWorkspace } from "@mts/QuoteWorkspace";

type Props = {
  session: Session;
  jobs: CrmJob[];
  quotes: CrmQuote[];
  bookkeepingRows?: CrmBookkeepingRow[];
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
  bookkeepingRows = [],
  events,
  openRequest,
  onOpenCalendarDate,
  onOpenCrmQuote,
  onChanged,
}: Props) {
  return (
    <QuoteWorkspace
      crmJobs={jobs}
      crmQuotes={quotes}
      crmBookkeepingRows={bookkeepingRows}
      crmCalendarEvents={events}
      onChanged={onChanged}
      openRequest={openRequest}
      onOpenCrmCalendarDate={onOpenCalendarDate}
      onOpenCrmQuote={onOpenCrmQuote}
    />
  );
}
