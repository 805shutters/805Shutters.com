"use client";

import type { Session } from "@supabase/supabase-js";
import type { CrmJob, CrmQuote } from "@/lib/crm/types";
import { QuoteWorkspace } from "@mts/QuoteWorkspace";

// The Quotes workspace (Dashboard / Builder / Contract) now renders the ported
// MTS quote builder verbatim from src/mts-quote — the proven "old system" the
// from-scratch rebuild failed to reproduce. It loads its own data from the MTS
// Supabase (805 account), so it doesn't need the CRM-passed jobs/quotes.
//
// The previous from-scratch implementation is kept in QuotesWorkspace.legacy.tsx
// as a fallback and is no longer the active path.
type Props = {
  session: Session;
  jobs: CrmJob[];
  quotes: CrmQuote[];
  onChanged: () => void;
};

export function QuotesWorkspace(_props: Props) {
  return <QuoteWorkspace />;
}
