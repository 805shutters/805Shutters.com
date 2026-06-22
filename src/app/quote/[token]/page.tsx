import { notFound } from "next/navigation";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { loadPublicQuoteByToken } from "@/lib/crm/public-quote";
import { SignQuote } from "./SignQuote";
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

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #d8d8d2" }}>
            <th style={th}>Window</th>
            <th style={th}>Product</th>
            <th style={{ ...th, textAlign: "right" }}>Qty</th>
            <th style={{ ...th, textAlign: "right" }}>Price</th>
          </tr>
        </thead>
        <tbody>
          {quote.lines.map((line) => (
            <tr key={line.id} style={{ borderBottom: "1px solid #eeeeeb", verticalAlign: "top" }}>
              <td style={td}>
                <strong>{line.room}</strong>
                <div style={{ fontSize: 13, opacity: 0.7 }}>{line.dimensions}</div>
                {line.discountPercent > 0 ? (
                  <span style={discountTag}>{line.discountPercent}% off applied</span>
                ) : null}
              </td>
              <td style={td}>
                {line.priceReady ? (
                  <div>
                    {line.showDesignOptions && line.designOptions.length ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        {line.designOptions.map((option) => (
                          <div key={option.id} style={optionBox}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                              <strong>Option {option.label}</strong>
                              <span style={{ whiteSpace: "nowrap" }}>{money(option.lineTotal)}</span>
                            </div>
                            <div>
                              {option.productName}
                              {option.styleName ? ` — ${option.styleName}` : ""}
                            </div>
                            {option.options.length ? (
                              <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 13, opacity: 0.7 }}>
                                {option.options.map((o, i) => (
                                  <li key={i}>{o}</li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div>
                        <div>
                          {line.productName}
                          {line.styleName ? ` — ${line.styleName}` : ""}
                        </div>
                        {line.options.length ? (
                          <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 13, opacity: 0.7 }}>
                            {line.options.map((o, i) => (
                              <li key={i}>{o}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : (
                  <em style={{ opacity: 0.6 }}>Pricing in progress</em>
                )}
              </td>
              <td style={{ ...td, textAlign: "right" }}>{line.quantity}</td>
              <td style={{ ...td, textAlign: "right" }}>{line.priceReady ? money(line.lineTotal) : "—"}</td>
            </tr>
          ))}
          {quote.lines.length === 0 ? (
            <tr>
              <td style={td} colSpan={4}>
                <em style={{ opacity: 0.6 }}>This quote is still being prepared.</em>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <div style={{ marginLeft: "auto", marginTop: 20, maxWidth: 320 }}>
        <Row label="Subtotal" value={money(quote.subtotal)} />
        {quote.fees.map((fee, i) => (
          <Row key={i} label={fee.name} value={money(fee.amount)} />
        ))}
        {quote.discount > 0 ? <Row label="Discount" value={`− ${money(quote.discount)}`} /> : null}
        {quote.tax > 0 ? <Row label="Tax" value={money(quote.tax)} /> : null}
        {quote.sourceTotalAdjustment ? (
          <Row
            label="Quote adjustment"
            value={`${quote.sourceTotalAdjustment > 0 ? "" : "− "}${money(Math.abs(quote.sourceTotalAdjustment))}`}
          />
        ) : null}
        <div style={{ borderTop: "2px solid #0b0b0b", marginTop: 8, paddingTop: 8 }}>
          <Row label="Total" value={money(quote.total)} strong />
        </div>
        {quote.depositDue > 0 ? <Row label="Deposit due" value={money(quote.depositDue)} /> : null}
        {quote.balanceDue > 0 ? <Row label="Balance" value={money(quote.balanceDue)} /> : null}
      </div>

      {!quote.signed && quote.allPriced ? (
        <div className="no-print">
          <SignQuote token={quote.token} customerName={quote.customerName} total={quote.total} />
        </div>
      ) : null}
      {!quote.signed && !quote.allPriced ? (
        <p style={{ marginTop: 20, opacity: 0.7 }}>
          A few items are still being finalized. We&apos;ll notify you the moment this quote is ready to approve.
        </p>
      ) : null}
    </main>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: strong ? 20 : 15 }}>
      <span style={{ opacity: 0.8 }}>{label}</span>
      <span style={{ fontWeight: strong ? 700 : 500 }}>{value}</span>
    </div>
  );
}

const wrap = { maxWidth: 760, margin: "0 auto", padding: "40px 20px", fontFamily: "system-ui, sans-serif", color: "#0b0b0b" } as const;
const th = { padding: "8px 6px", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.7 } as const;
const td = { padding: "10px 6px" } as const;
const optionBox = { border: "1px solid #eeeeeb", borderRadius: 8, padding: "8px 10px", background: "#fafaf8" } as const;
const discountTag = { display: "inline-block", marginTop: 4, fontSize: 12, fontWeight: 600, color: "#6b530a", background: "#faf3d6", border: "1px solid #b9a23e", borderRadius: 999, padding: "2px 8px" } as const;
