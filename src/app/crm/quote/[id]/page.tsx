import { QuoteBuilderStandalone } from "@/components/crm/quotes/QuoteBuilderStandalone";
import { privatePageMetadata } from "@/lib/private-page-metadata";

export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("Quote Builder | 805 CRM");

export default async function QuoteBuilderPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ source?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <QuoteBuilderStandalone quoteId={id} salesQuote={query.source === "sales"} />;
}
