import { CustomerDocumentPreviewStandalone } from "@/components/crm/quotes/CustomerDocumentPreviewStandalone";
import { privatePageMetadata } from "@/lib/private-page-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("Quote Contract | 805 CRM");

export default async function QuoteContractPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomerDocumentPreviewStandalone quoteId={id} />;
}
