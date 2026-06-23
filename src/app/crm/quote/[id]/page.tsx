import { QuoteBuilderStandalone } from "@/components/crm/quotes/QuoteBuilderStandalone";

export const dynamic = "force-dynamic";

export default async function QuoteBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QuoteBuilderStandalone quoteId={id} />;
}
