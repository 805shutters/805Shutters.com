import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { loadPublicQuoteByToken } from "@/lib/crm/public-quote";
import { VENMO_HANDLE, ZELLE_DESTINATION, venmoProfileUrl } from "@/lib/finance/payment-options";
import { QuoteSelection } from "./QuoteSelection";
import { PrintButton } from "./PrintButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function money(n: number): string {
  return (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return (
      <main style={wrap}>
        <p>This quote is temporarily unavailable. Please try again shortly.</p>
      </main>
    );
  }

  const quote = await loadPublicQuoteByToken(supabase, token);
  if (!quote) notFound();

  // Venmo profile QR (static per handle) so the customer can scan to pay.
  const venmoQrSvg = await QRCode.toString(venmoProfileUrl(), { type: "svg", margin: 1 });

  return (
    <main style={wrap}>
      <style>{`@media print { .no-print { display: none !important; } main { padding: 0 !important; } }`}</style>
      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <PrintButton />
      </div>
      <header style={{ borderBottom: "2px solid #0b0b0b", paddingBottom: 16, marginBottom: 20 }}>
        <p style={{ margin: 0, letterSpacing: 1, textTransform: "uppercase", fontSize: 12, opacity: 0.7 }}>
          {quote.business.name}
        </p>
        <h1 style={{ margin: "4px 0" }}>Your Quote</h1>
        <p style={{ margin: 0 }}>
          Prepared for <strong>{quote.customerName}</strong>
          {quote.quoteNumber ? ` · Quote ${quote.quoteNumber}` : ""}
        </p>
      </header>

      {quote.versions.length > 1 ? (
        <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          <span style={{ alignSelf: "center", fontSize: 13, opacity: 0.7 }}>Compare options:</span>
          {quote.versions.map((v) => (
            <a
              key={v.token}
              href={`/quote/${v.token}`}
              style={{
                textDecoration: "none",
                border: "1px solid #d8d8d2",
                borderRadius: 8,
                padding: "8px 14px",
                background: v.current ? "#0b0b0b" : "#ffffff",
                color: v.current ? "#ffffff" : "#0b0b0b",
              }}
            >
              Option {v.label} — {money(v.total)}
              {v.signed ? " ✓" : ""}
            </a>
          ))}
        </div>
      ) : null}

      {quote.signed ? (
        <div style={{ background: "#f4f4f2", border: "1px solid #b8b6ae", borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <strong>This quote has been approved and signed.</strong> Thank you! We&apos;ll be in touch to schedule.
        </div>
      ) : null}

      <QuoteSelection
        quote={quote}
        paymentOptions={{ venmoHandle: VENMO_HANDLE, venmoQrSvg, zelleDestination: ZELLE_DESTINATION }}
      />
    </main>
  );
}

const wrap = { maxWidth: 760, margin: "0 auto", padding: "40px 20px", fontFamily: "system-ui, sans-serif", color: "#0b0b0b" } as const;
