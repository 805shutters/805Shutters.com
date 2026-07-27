"use client";

import type { Session } from "@supabase/supabase-js";
import type { CrmJob, CrmQuote } from "@/lib/crm/types";
import { QuotesWorkspace as QuoteV1Workspace } from "./QuotesWorkspace.legacy";

// Quote V1 is the production CRM workspace. Quote V2 remains preserved under
// src/mts-quote and its supporting APIs, but it has no normal CRM entry point.
type Props = {
  session: Session;
  jobs: CrmJob[];
  quotes: CrmQuote[];
  onChanged: () => void;
};

export function QuotesWorkspace({ session, jobs, quotes, onChanged }: Props) {
  return <QuoteV1Workspace session={session} jobs={jobs} quotes={quotes} onChanged={onChanged} />;
}
