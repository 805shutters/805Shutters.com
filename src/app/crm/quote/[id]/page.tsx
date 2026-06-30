import { QuoteBuilderStandalone } from "@/components/crm/quotes/QuoteBuilderStandalone";
import { privatePageMetadata } from "@/lib/private-page-metadata";

export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("Quote Builder | 805 CRM");

export default async function QuoteBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QuoteBuilderStandalone quoteId={id} />;
}
