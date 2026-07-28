"use client";

import type { Session } from "@supabase/supabase-js";
import type { CrmJob, CrmQuote } from "@/lib/crm/types";
import { QuotesWorkspace as QuoteV1Workspace } from "./QuotesWorkspace.legacy";

// Quote V1 is the only CRM workspace exposed to users. Quote V2 source,
// migrations, and stored records stay intact as preservation-only data.
type Props = {
  session: Session;
  jobs: CrmJob[];
  quotes: CrmQuote[];
  onChanged: () => void;
};

export function QuotesWorkspace({ session, jobs, quotes, onChanged }: Props) {
  return <QuoteV1Workspace session={session} jobs={jobs} quotes={quotes} onChanged={onChanged} />;
}
