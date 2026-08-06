"use client";

import type { Session } from "@supabase/supabase-js";
import type { CrmCalendarEvent, CrmCustomer, CrmJob, CrmQuote } from "@/lib/crm/types";
import type { QuoteWorkspaceOpenRequest, QuoteWorkspaceOpenTab } from "@mts-v1/QuoteWorkspace";
import { QuoteWorkspace as HistoricalQuoteWorkspace } from "@mts-v1/QuoteWorkspace";

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

/**
 * Exact July 22 historical quote workspace, isolated from the current V4
 * implementation under @mts. The dedicated CRM quote route remains the
 * historical editor for CRM-backed quote records.
 */
export function QuotesWorkspace({
  jobs,
  quotes,
  events,
  customers = [],
  openRequest,
  onOpenCalendarDate,
  onOpenCrmQuote,
}: Props) {
  return (
    <HistoricalQuoteWorkspace
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
