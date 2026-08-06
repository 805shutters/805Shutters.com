"use client";

import type { Session } from "@supabase/supabase-js";
import type { CrmCalendarEvent, CrmJob, CrmQuote } from "@/lib/crm/types";
import type { QuoteWorkspaceOpenRequest, QuoteWorkspaceOpenTab } from "@mts/QuoteWorkspace";
import { QuotesWorkspace as HistoricalQuotesWorkspace } from "./QuotesWorkspace.legacy";

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

/**
 * Restore the historical CRM quote experience used before the quote-workspace
 * cutover. Stored V2/V4 records and source remain untouched; this is a
 * reversible route-only change. Existing quotes continue to open the dedicated
 * /crm/quote/[id] editor, whose Copy Current action preserves saved snapshots.
 */
export function QuotesWorkspace({ session, jobs, quotes, onChanged }: Props) {
  return (
    <HistoricalQuotesWorkspace
      session={session}
      jobs={jobs}
      quotes={quotes}
      onChanged={onChanged}
    />
  );
}
