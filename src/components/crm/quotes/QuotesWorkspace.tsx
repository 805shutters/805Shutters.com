"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { CrmCalendarEvent, CrmJob, CrmQuote } from "@/lib/crm/types";
import { OriginalV1QuotesWorkspace } from "@/components/crm/quotes/OriginalV1QuotesWorkspace";
import { QuoteWorkspace, type QuoteWorkspaceOpenRequest, type QuoteWorkspaceOpenTab } from "@mts/QuoteWorkspace";

type QuoteVersion = "v1" | "v4";

type Props = {
  session: Session;
  jobs: CrmJob[];
  quotes: CrmQuote[];
  events: CrmCalendarEvent[];
  openRequest?: QuoteWorkspaceOpenRequest | null;
  onOpenOriginalV1Quote: (quoteId: string) => void;
  onOpenCrmQuote?: (quoteId: string, tab?: QuoteWorkspaceOpenTab) => void;
  onOpenCalendarDate?: (date: string) => void;
  onChanged: () => void;
};

export function QuotesWorkspace({
  jobs,
  quotes,
  events,
  openRequest,
  onOpenOriginalV1Quote,
  onOpenCalendarDate,
  onOpenCrmQuote,
  onChanged,
}: Props) {
  const [version, setVersion] = useState<QuoteVersion | null>(openRequest?.quoteId ? "v4" : null);

  useEffect(() => {
    if (openRequest?.quoteId) setVersion("v4");
  }, [openRequest?.quoteId, openRequest?.requestId]);

  if (!version) {
    return (
      <section className="crm-panel" aria-labelledby="quote-version-heading">
        <p className="eyebrow">Build Quote</p>
        <h2 id="quote-version-heading">Choose a quote builder</h2>
        <p>Open the unchanged original builder for V1 quotes, or use the separate V4 system.</p>
        <div className="crm-form-actions">
          <button type="button" className="button primary" onClick={() => setVersion("v1")}>
            Open original V1
          </button>
          <button type="button" className="button secondary" onClick={() => setVersion("v4")}>
            Open V4 — In progress
          </button>
        </div>
      </section>
    );
  }

  return (
    <div>
      <div className="crm-form-actions" aria-label="Quote builder version">
          <strong>{version === "v1" ? "Original V1 quote builder" : "V4 quote builder"}</strong>
        <button type="button" className="button secondary" onClick={() => setVersion(null)}>
          Switch quote builder
        </button>
      </div>
      {version === "v1" ? (
        <OriginalV1QuotesWorkspace quotes={quotes} onOpenQuote={onOpenOriginalV1Quote} />
      ) : (
        <QuoteWorkspace
          crmJobs={jobs}
          crmQuotes={quotes}
          crmCalendarEvents={events}
          openRequest={openRequest}
          onOpenCrmCalendarDate={onOpenCalendarDate}
          onOpenCrmQuote={onOpenCrmQuote}
        />
      )}
    </div>
  );
}
