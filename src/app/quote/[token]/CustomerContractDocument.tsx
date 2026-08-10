"use client";

import Image from "next/image";
import type { PublicQuote } from "@/lib/crm/public-quote";
import { brandIdentity } from "@/lib/brand-identity";
import type { PaymentOptions } from "@/lib/finance/payment-options";
import { QuoteSelection } from "./QuoteSelection";
import type { QuoteWalletConfig } from "./QuoteWalletButtons";
import { PrintButton } from "./PrintButton";

function money(n: number): string {
  return (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatCustomerPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length !== 10) return phone.trim();
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

function customerDetails(quote: PublicQuote): string[] {
  return [
    quote.customerName,
    quote.customerAddress,
    formatCustomerPhone(quote.customerPhone),
    quote.customerEmail,
  ].filter((detail): detail is string => Boolean(detail));
}

export function CustomerContractDocument({
  quote,
  paymentOptions,
  walletConfig,
  embedded = false,
  previewOnly = false,
}: {
  quote: PublicQuote;
  paymentOptions?: PaymentOptions | null;
  walletConfig?: QuoteWalletConfig | null;
  embedded?: boolean;
  previewOnly?: boolean;
}) {
  const preparedFor = customerDetails(quote);
  const reserveCustomerActionRail =
    !embedded &&
    !previewOnly &&
    ((!quote.signed && quote.allPriced) || Boolean(paymentOptions));

  return (
    <main className={`customer-contract-print-root${embedded ? " public-quote-contract-embed" : ""}`} style={embedded ? contractPreviewWrap : wrap}>
      <style>{`.customer-contract-print-only { display: none !important; }
      .customer-contract-screen-brand { display: grid; justify-items: center; margin: 0 0 18px; }
      .customer-contract-print-action { position: fixed; top: 16px; left: 16px; z-index: 20; }
      @media (max-width: 640px) {
        .customer-contract-print-action { top: 10px; left: 10px; }
        body:has(.customer-contract-print-root) { padding-bottom: 0 !important; }
        body:has(.customer-contract-print-root) .mobile-action-bar,
        body:has(.customer-contract-print-root) .assistant-widget { display: none !important; }
      }
      @media screen and (min-width: 1101px) {
        .customer-contract-main-content--with-actions {
          box-sizing: border-box;
          padding-right: 362px;
        }
      }
      @media print {
        body * { visibility: hidden !important; }
        .customer-contract-print-root,
        .customer-contract-print-root * { visibility: visible !important; }
        .site-header-shell,
        .financing-banner,
        .site-footer { display: none !important; }
        .customer-contract-print-root { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
        .customer-contract-print-only { display: block !important; }
        .no-print { display: none !important; }
      }`}</style>
      <div className="customer-contract-screen-brand">
        <Image
          src="/brand/805-shutters-logo-header.png"
          alt="805 Shutters"
          width={227}
          height={148}
          priority
          style={contractLogo}
        />
      </div>
      <div className="no-print customer-contract-print-action">
        {previewOnly ? <strong style={{ fontSize: 12 }}>Internal preview</strong> : <PrintButton />}
      </div>
      <div className="customer-contract-print-only">
        <div style={officialContractBar}>
          <strong>Official 805 Shutters contract</strong>
          <a href={brandIdentity.website}>{quote.business.website}</a>
          <a href={brandIdentity.phoneHref}>{quote.business.phone}</a>
        </div>
        <header style={{ borderBottom: "2px solid #0b0b0b", paddingBottom: 16, marginBottom: 20, textAlign: "center" }}>
          <p style={{ margin: 0, letterSpacing: 1, textTransform: "uppercase", fontSize: 12, opacity: 0.7 }}>
            {quote.business.name}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "baseline", gap: "4px 10px", marginTop: 4 }}>
            <h1 style={{ margin: 0 }}>Your Contract</h1>
            <p style={{ margin: 0, fontWeight: 700 }}>
              {preparedFor.map((detail, index) => (
                <span key={detail}>{index ? <span aria-hidden="true" style={{ whiteSpace: "pre", fontWeight: 400 }}> · </span> : null}{detail}</span>
              ))}
            </p>
            {quote.quoteNumber ? <span style={{ whiteSpace: "pre", fontWeight: 400 }}> · Contract {quote.quoteNumber}</span> : null}
          </div>
        </header>
      </div>

      <div
        className={`customer-contract-main-content${
          reserveCustomerActionRail ? " customer-contract-main-content--with-actions" : ""
        }`}
      >
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

        <QuoteSelection quote={quote} paymentOptions={paymentOptions} walletConfig={walletConfig} previewOnly={previewOnly} />
      </div>
      <footer className="customer-contract-print-only" style={contractFooter}>
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

const wrap = {
  width: "100%",
  maxWidth: "none",
  margin: 0,
  padding: "40px 20px",
  boxSizing: "border-box",
  fontFamily: 'var(--font-body, "Helvetica Neue", Arial, sans-serif)',
  color: "#0b0b0b",
} as const;
const contractLogo = { display: "block", width: 170, maxWidth: "46vw", height: "auto" } as const;
const quoteTabsSection = { marginBottom: 22, padding: 14, border: "2px solid #0b0b0b", borderRadius: 12, background: "#f4f4f2" } as const;
const quoteTabsHeading = { display: "block", marginBottom: 10, fontSize: 15 } as const;
const quoteTabsGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 } as const;
const quoteTab = { display: "flex", minHeight: 78, flexDirection: "column", justifyContent: "center", padding: "12px 16px", border: "2px solid", borderRadius: 9, textDecoration: "none", textAlign: "center", boxSizing: "border-box" } as const;
const quoteTabLabel = { fontSize: 18, fontWeight: 800, lineHeight: 1.2 } as const;
const quoteTabPrice = { marginTop: 4, fontSize: 16, fontWeight: 650, lineHeight: 1.2 } as const;
const quoteTabStatus = { marginTop: 5, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 } as const;
const contractPreviewWrap = { maxWidth: "none", margin: 0, padding: "18px 20px 32px", fontFamily: 'var(--font-body, "Helvetica Neue", Arial, sans-serif)', color: "#0b0b0b" } as const;
const officialContractBar = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px", marginBottom: 18, padding: "10px 12px", border: "1px solid #d8d8d2", background: "#f4f4f2", fontSize: 12, lineHeight: 1.4 } as const;
const contractFooter = { display: "grid", gap: 6, marginTop: 30, paddingTop: 18, borderTop: "2px solid #0b0b0b", fontSize: 12, lineHeight: 1.5 } as const;
