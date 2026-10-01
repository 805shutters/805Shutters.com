"use client";

import type { Session } from "@supabase/supabase-js";
import type { CrmBookkeepingRow, CrmCalendarEvent, CrmCustomer, CrmJob, CrmQuote } from "@/lib/crm/types";
import type { QuoteWorkspaceOpenRequest, QuoteWorkspaceOpenTab } from "@mts/QuoteWorkspace";
import { QuoteWorkspace } from "@mts/QuoteWorkspace";

import type { MobileQuoteRelationship } from "@/lib/crm/mobile-quotes";

type Props = {
  followUps?: boolean;
  session: Session;
  jobs: CrmJob[];
  quotes: CrmQuote[];
  bookkeepingRows?: CrmBookkeepingRow[];
  events: CrmCalendarEvent[];
  customers?: CrmCustomer[];
  customerRelationships?: MobileQuoteRelationship[];
  openRequest?: QuoteWorkspaceOpenRequest | null;
  onOpenCrmQuote?: (quoteId: string, tab?: QuoteWorkspaceOpenTab) => void;
  onOpenCalendarDate?: (date: string) => void;
  onChanged: () => void;
};

export function QuotesWorkspace({
  followUps = false,
  jobs,
  quotes,
  bookkeepingRows = [],
  events,
  customers,
  customerRelationships,
  openRequest,
  onOpenCalendarDate,
  onOpenCrmQuote,
  onChanged,
}: Props) {
  return (
    <QuoteWorkspace
      staffOverview={!followUps}
      followUps={followUps}
      crmJobs={jobs}
      crmQuotes={quotes}
      crmBookkeepingRows={bookkeepingRows}
      crmCalendarEvents={events}
      crmCustomers={customers}
      crmCustomerRelationships={customerRelationships}
      onChanged={onChanged}
      openRequest={followUps ? null : openRequest}
      onOpenCrmCalendarDate={onOpenCalendarDate}
      onOpenCrmQuote={onOpenCrmQuote}
    />
  );
}
