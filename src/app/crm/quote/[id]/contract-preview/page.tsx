import { CustomerDocumentPreviewStandalone } from "@/components/crm/quotes/CustomerDocumentPreviewStandalone";
import { privatePageMetadata } from "@/lib/private-page-metadata";
import styles from "./page.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("Quote Contract | 805 CRM");

export default async function QuoteContractPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <a
        href="/crm/"
        className={styles.close}
        aria-label="Close review and return to CRM homepage"
        title="Back to CRM homepage"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </a>
      <CustomerDocumentPreviewStandalone quoteId={id} />
    </>
  );
}
