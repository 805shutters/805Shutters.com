"use client";

import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { CrmCalendarEvent, CrmJob, CrmQuote } from "@/lib/crm/types";
import { QuoteWorkspace, type QuoteWorkspaceOpenRequest, type QuoteWorkspaceOpenTab } from "@mts/QuoteWorkspace";

type QuoteVersion = "v1" | "v4";

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

export function QuotesWorkspace({
  jobs,
  quotes,
  events,
  openRequest,
  onOpenCalendarDate,
  onOpenCrmQuote,
  onChanged,
}: Props) {
  const [version, setVersion] = useState<QuoteVersion>("v1");

  return (
    <div>
      <div className="crm-form-actions" aria-label="Quote builder version">
        <strong>{version === "v1" ? "V1 quote builder" : "V4 quote builder"}</strong>
        <button
          type="button"
          className="button secondary"
          onClick={() => setVersion(version === "v1" ? "v4" : "v1")}
        >
          {version === "v1" ? "Open V4 — In progress" : "Return to V1"}
        </button>
      </div>
      <QuoteWorkspace
        crmJobs={jobs}
        crmQuotes={quotes}
        crmCalendarEvents={events}
        openRequest={openRequest}
        onOpenCrmCalendarDate={onOpenCalendarDate}
        onOpenCrmQuote={onOpenCrmQuote}
      />
    </div>
  );
}
