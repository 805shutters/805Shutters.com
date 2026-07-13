import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { loadPublicQuoteByToken, publicQuoteCustomerDetails } from "@/lib/crm/public-quote";
import { brandIdentity } from "@/lib/brand-identity";
import { VENMO_HANDLE, ZELLE_DESTINATION, venmoProfileUrl } from "@/lib/finance/payment-options";
import { privatePageMetadata } from "@/lib/private-page-metadata";
import { QuoteSelection } from "./QuoteSelection";
import { PrintButton } from "./PrintButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("Contract | 805 Shutters");

function money(n: number): string {
  return (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

type PublicQuotePageSearchParams = Record<string, string | string[] | undefined>;

function searchParamEnabled(searchParams: PublicQuotePageSearchParams, key: string) {
  const value = searchParams[key];
  const first = Array.isArray(value) ? value[0] : value;
  return first === "" || first === "1" || first === "true";
}

export default async function PublicQuotePage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<PublicQuotePageSearchParams>;
}) {
  const { token } = await params;
  const query = searchParams ? await searchParams : {};
  const crmContractPreview = searchParamEnabled(query, "crmContract");
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return (
      <main style={wrap}>
        <p>This contract is temporarily unavailable. Please try again shortly.</p>
      </main>
    );
  }

  const quote = await loadPublicQuoteByToken(supabase, token);
  if (!quote) notFound();
  const customerDetails = publicQuoteCustomerDetails(quote);

  // Venmo profile QR (static per handle) so the customer can scan to pay.
  const venmoQrSvg = await QRCode.toString(venmoProfileUrl(), { type: "svg", margin: 1 });

  return (
    <main
      className={crmContractPreview ? "public-quote-contract-embed" : undefined}
      style={crmContractPreview ? contractPreviewWrap : wrap}
    >
      <style>{`@media print { .no-print { display: none !important; } main { padding: 0 !important; } }`}</style>
      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <PrintButton />
      </div>
      <div style={officialContractBar}>
        <strong>Official 805 Shutters contract</strong>
        <a href={brandIdentity.website}>{quote.business.website}</a>
        <a href={brandIdentity.phoneHref}>{quote.business.phone}</a>
      </div>
      <header style={{ borderBottom: "2px solid #0b0b0b", paddingBottom: 16, marginBottom: 20 }}>
        <p style={{ margin: 0, letterSpacing: 1, textTransform: "uppercase", fontSize: 12, opacity: 0.7 }}>
          {quote.business.name}
        </p>
        <h1 style={{ margin: "4px 0" }}>Your Contract</h1>
        <p style={{ margin: 0 }}>
          Prepared for <strong>{customerDetails.join(", ")}</strong>
          {quote.quoteNumber ? ` · Contract ${quote.quoteNumber}` : ""}
        </p>
      </header>

      {quote.versions.length > 1 ? (
        <section className="no-print" style={quoteTabsSection} aria-label="Compare quote options">
          <strong style={quoteTabsHeading}>Choose a quote to review</strong>
          <div role="tablist" aria-label="Available quotes" style={quoteTabsGrid}>
            {quote.versions.map((v) => (
              <a
                key={v.token}
                href={`/quote/${v.token}`}
                role="tab"
                aria-selected={v.current}
                aria-current={v.current ? "page" : undefined}
                style={{
                  ...quoteTab,
                  background: v.current ? "#0b0b0b" : "#ffffff",
                  color: v.current ? "#ffffff" : "#0b0b0b",
                  borderColor: v.current ? "#0b0b0b" : "#b8b6ae",
                }}
              >
                <span style={quoteTabLabel}>Quote {v.label}</span>
                <span style={quoteTabPrice}>{money(v.total)}</span>
                {v.signed ? <span style={quoteTabStatus}>Selected ✓</span> : null}
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {quote.signed ? (
        <div style={{ background: "#f4f4f2", border: "1px solid #b8b6ae", borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <strong>This contract has been approved and signed.</strong> Thank you! We&apos;ll be in touch to schedule.
        </div>
      ) : null}

      <QuoteSelection
        quote={quote}
        paymentOptions={{ venmoHandle: VENMO_HANDLE, venmoQrSvg, zelleDestination: ZELLE_DESTINATION }}
      />
      <footer style={contractFooter}>
        <strong>{quote.business.name}</strong>
        <span>
          Official contact: <a href={brandIdentity.website}>{quote.business.website}</a> ·{" "}
          <a href={brandIdentity.phoneHref}>{quote.business.phone}</a> ·{" "}
          <a href={brandIdentity.emailHref}>{quote.business.email}</a>
        </span>
      </footer>
    </main>
  );
}

const wrap = { maxWidth: 760, margin: "0 auto", padding: "40px 20px", fontFamily: "system-ui, sans-serif", color: "#0b0b0b" } as const;
const quoteTabsSection = {
  marginBottom: 22,
  padding: 14,
  border: "2px solid #0b0b0b",
  borderRadius: 12,
  background: "#f4f4f2",
} as const;
const quoteTabsHeading = {
  display: "block",
  marginBottom: 10,
  fontSize: 15,
} as const;
const quoteTabsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 10,
} as const;
const quoteTab = {
  display: "flex",
  minHeight: 78,
  flexDirection: "column",
  justifyContent: "center",
  padding: "12px 16px",
  border: "2px solid",
  borderRadius: 9,
  textDecoration: "none",
  textAlign: "center",
  boxSizing: "border-box",
} as const;
const quoteTabLabel = { fontSize: 18, fontWeight: 800, lineHeight: 1.2 } as const;
const quoteTabPrice = { marginTop: 4, fontSize: 16, fontWeight: 650, lineHeight: 1.2 } as const;
const quoteTabStatus = { marginTop: 5, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 } as const;
const contractPreviewWrap = {
  maxWidth: "none",
  margin: 0,
  padding: "18px 20px 32px",
  fontFamily: "system-ui, sans-serif",
  color: "#0b0b0b"
} as const;
const officialContractBar = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "6px 14px",
  marginBottom: 18,
  padding: "10px 12px",
  border: "1px solid #d8d8d2",
  background: "#f4f4f2",
  fontSize: 12,
  lineHeight: 1.4,
} as const;
const contractFooter = {
  display: "grid",
  gap: 6,
  marginTop: 30,
  paddingTop: 18,
  borderTop: "2px solid #0b0b0b",
  fontSize: 12,
  lineHeight: 1.5,
} as const;
