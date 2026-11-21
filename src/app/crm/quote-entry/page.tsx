import { QuoteLineEntry } from "@/components/crm/quotes/QuoteLineEntry";
import { privatePageMetadata } from "@/lib/private-page-metadata";

export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("Line options | 805 CRM");

export default function QuoteEntryPage() {
  return <QuoteLineEntry />;
}
