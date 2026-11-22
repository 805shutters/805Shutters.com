import { QuoteLineEntry } from "@/components/crm/quotes/QuoteLineEntry";
import { privatePageMetadata } from "@/lib/private-page-metadata";

export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("Line options | 805 CRM");

export default async function QuoteEntryPage({ searchParams }: { searchParams: Promise<{ quoteId?: string; revision?: string }> }) {
  const query = await searchParams;
  const revision = Number(query.revision);
  return <QuoteLineEntry quoteId={query.quoteId} expectedRevision={Number.isInteger(revision) && revision > 0 ? revision : 1} />;
}
