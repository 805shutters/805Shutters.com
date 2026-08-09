"use client";

import type { PublicQuote } from "@/lib/crm/public-quote";
import { brandIdentity } from "@/lib/brand-identity";
import type { PaymentOptions } from "@/lib/finance/payment-options";
import { QuoteSelection } from "./QuoteSelection";
import { PrintButton } from "./PrintButton";

function money(n: number): string {
  return (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function customerDetails(quote: PublicQuote): string[] {
  const digits = quote.customerPhone?.replace(/\D/g, "") || "";
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  const phone = local.length === 10
    ? `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`
    : quote.customerPhone?.trim() || null;
  return [quote.customerName, quote.customerAddress, phone, quote.customerEmail].filter((detail): detail is string => Boolean(detail));
}

export function CustomerContractDocument({
  quote,
  paymentOptions,
  embedded = false,
  previewOnly = false,
}: {
  quote: PublicQuote;
  paymentOptions?: PaymentOptions | null;
  embedded?: boolean;
  previewOnly?: boolean;
}) {
  const preparedFor = customerDetails(quote);

  return (
    <main className={embedded ? "public-quote-contract-embed" : undefined} style={embedded ? contractPreviewWrap : wrap}>
      <style>{`@media print { .no-print { display: none !important; } main { padding: 0 !important; } }`}</style>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 8 }}>
        {previewOnly ? <strong style={{ fontSize: 12 }}>Internal document preview · no customer action is available</strong> : <span />}
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
          Prepared for <strong>{preparedFor.join(", ")}</strong>
          {quote.quoteNumber ? ` · Contract ${quote.quoteNumber}` : ""}
        </p>
      </header>

      {!previewOnly && quote.versions.length > 1 ? (
        <section className="no-print" style={quoteTabsSection} aria-label="Compare quote options">
          <strong style={quoteTabsHeading}>Choose a quote to review</strong>
          <div role="tablist" aria-label="Available quotes" style={quoteTabsGrid}>
            {quote.versions.map((version) => (
              <a
                key={version.token}
                href={`/quote/${version.token}`}
                role="tab"
                aria-selected={version.current}
                aria-current={version.current ? "page" : undefined}
                style={{
                  ...quoteTab,
                  background: version.current ? "#0b0b0b" : "#ffffff",
                  color: version.current ? "#ffffff" : "#0b0b0b",
                  borderColor: version.current ? "#0b0b0b" : "#b8b6ae",
                }}
              >
                <span style={quoteTabLabel}>Quote {version.label}</span>
                <span style={quoteTabPrice}>{money(version.total)}</span>
                {version.signed ? <span style={quoteTabStatus}>Selected ✓</span> : null}
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

      <QuoteSelection quote={quote} paymentOptions={paymentOptions} previewOnly={previewOnly} />
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

const wrap = { maxWidth: 1120, margin: "0 auto", padding: "40px 20px", fontFamily: "system-ui, sans-serif", color: "#0b0b0b" } as const;
const quoteTabsSection = { marginBottom: 22, padding: 14, border: "2px solid #0b0b0b", borderRadius: 12, background: "#f4f4f2" } as const;
const quoteTabsHeading = { display: "block", marginBottom: 10, fontSize: 15 } as const;
const quoteTabsGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 } as const;
const quoteTab = { display: "flex", minHeight: 78, flexDirection: "column", justifyContent: "center", padding: "12px 16px", border: "2px solid", borderRadius: 9, textDecoration: "none", textAlign: "center", boxSizing: "border-box" } as const;
const quoteTabLabel = { fontSize: 18, fontWeight: 800, lineHeight: 1.2 } as const;
const quoteTabPrice = { marginTop: 4, fontSize: 16, fontWeight: 650, lineHeight: 1.2 } as const;
const quoteTabStatus = { marginTop: 5, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 } as const;
const contractPreviewWrap = { maxWidth: "none", margin: 0, padding: "18px 20px 32px", fontFamily: "system-ui, sans-serif", color: "#0b0b0b" } as const;
const officialContractBar = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px", marginBottom: 18, padding: "10px 12px", border: "1px solid #d8d8d2", background: "#f4f4f2", fontSize: 12, lineHeight: 1.4 } as const;
const contractFooter = { display: "grid", gap: 6, marginTop: 30, paddingTop: 18, borderTop: "2px solid #0b0b0b", fontSize: 12, lineHeight: 1.5 } as const;
