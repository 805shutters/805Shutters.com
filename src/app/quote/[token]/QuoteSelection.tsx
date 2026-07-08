"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicQuote } from "@/lib/crm/public-quote";
import type { PaymentOptions } from "@/lib/finance/payment-options";
import { SignQuote } from "./SignQuote";

function money(n: number): string {
  return (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

type LiveMoney = {
  subtotal: number;
  fees: number;
  discount: number;
  tax: number;
  total: number;
  depositDue: number;
  balanceDue: number;
};

/** Interactive line-item table + totals + sign block. Supports the "Purchase all
 *  / Purchase some" flow: the customer can check a subset of windows and the total
 *  recomputes (via the server engine) for only the chosen items. */
export function QuoteSelection({ quote, paymentOptions }: { quote: PublicQuote; paymentOptions?: PaymentOptions | null }) {
  const fullFees = quote.fees.reduce((s, f) => s + f.amount, 0);
  const fullMoney: LiveMoney = {
    subtotal: quote.subtotal,
    fees: fullFees,
    discount: quote.discount,
    tax: quote.tax,
    total: quote.total,
    depositDue: quote.depositDue,
    balanceDue: quote.balanceDue,
  };
  const allowSelection = !quote.signed && quote.lines.length > 1;
  const [mode, setMode] = useState<"all" | "some">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set(quote.lines.map((l) => l.id)));
  const [live, setLive] = useState<LiveMoney>(fullMoney);
  const [computing, setComputing] = useState(false);
  const [squareBusy, setSquareBusy] = useState<"deposit" | null>(null);
  const [squareMsg, setSquareMsg] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    if (mode === "all") {
      setLive(fullMoney);
      return;
    }
    const id = ++reqId.current;
    setComputing(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/quote/${quote.token}/total`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selectedLineIds: [...selected] }),
        });
        const data = await res.json();
        if (id === reqId.current && data && typeof data.total === "number") {
          setLive({
            subtotal: data.subtotal,
            fees: data.fees,
            discount: data.discount,
            tax: data.tax,
            total: data.total,
            depositDue: data.depositDue,
            balanceDue: data.balanceDue,
          });
        }
      } catch {
        /* keep the last known total */
      } finally {
        if (id === reqId.current) setComputing(false);
      }
    }, 250);
    return () => clearTimeout(handle);
    // fullMoney is derived from `quote` (stable per render of this quote)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selected, quote.token]);

  const selectionEmpty = mode === "some" && selected.size === 0;
  const acknowledgedTotal = live.total;
  const selectedLineIds = mode === "some" ? [...selected] : undefined;

  async function startSquare(type: "deposit") {
    setSquareMsg(null);
    setSquareBusy(type);
    try {
      const res = await fetch(`/api/quote/${quote.token}/square-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentType: type, ...(selectedLineIds ? { selectedLineIds } : {}) }),
      });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error(data?.message || "Could not start card payment.");
    } catch (e) {
      setSquareMsg(e instanceof Error ? e.message : "Card payment unavailable.");
    } finally {
      setSquareBusy(null);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      {allowSelection ? (
        <div style={selectBar}>
          <span style={{ fontSize: 13, opacity: 0.7, alignSelf: "center" }}>Purchase:</span>
          <label style={radioLabel}>
            <input type="radio" name="purchase-mode" checked={mode === "all"} onChange={() => setMode("all")} /> All
          </label>
          <label style={radioLabel}>
            <input type="radio" name="purchase-mode" checked={mode === "some"} onChange={() => setMode("some")} /> Some
          </label>
          {mode === "some" ? (
            <span style={{ fontSize: 13, opacity: 0.7 }}>Please select the line items you wish to purchase.</span>
          ) : null}
        </div>
      ) : null}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #d8d8d2" }}>
            {mode === "some" ? <th style={{ ...th, width: 36 }}></th> : null}
            <th style={th}>Window</th>
            <th style={th}>Product</th>
            <th style={{ ...th, textAlign: "right" }}>Qty</th>
            <th style={{ ...th, textAlign: "right" }}>Price</th>
          </tr>
        </thead>
        <tbody>
          {quote.lines.map((line, index) => {
            const isChecked = selected.has(line.id);
            const dimmed = mode === "some" && !isChecked;
            return (
              <tr key={line.id} style={{ borderBottom: "1px solid #eeeeeb", verticalAlign: "top", opacity: dimmed ? 0.4 : 1 }}>
                {mode === "some" ? (
                  <td style={{ ...td, width: 36 }}>
                    <input type="checkbox" style={{ width: 18, height: 18, margin: "10px 0 0" }} checked={isChecked} onChange={() => toggle(line.id)} />
                  </td>
                ) : null}
                <td style={td}>
                  <strong>#{index + 1} {line.room}</strong>
                  <div style={{ fontSize: 13, opacity: 0.7 }}>{line.dimensions}</div>
                  {line.discountPercent > 0 ? <span style={discountTag}>{line.discountPercent}% off applied</span> : null}
                </td>
                <td style={td}>
                  {line.priceReady ? (
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
                  ) : (
                    <em style={{ opacity: 0.6 }}>Pricing in progress</em>
                  )}
                </td>
                <td style={{ ...td, textAlign: "right" }}>{line.quantity}</td>
                <td style={{ ...td, textAlign: "right" }}>{line.priceReady ? money(line.lineTotal) : "—"}</td>
              </tr>
            );
          })}
          {quote.lines.length === 0 ? (
            <tr>
              <td style={td} colSpan={mode === "some" ? 5 : 4}>
                <em style={{ opacity: 0.6 }}>This contract is still being prepared.</em>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <div style={{ marginLeft: "auto", marginTop: 20, maxWidth: 320 }}>
        <Row label="Subtotal" value={money(live.subtotal)} />
        {quote.fees.map((fee, i) => (
          <Row key={i} label={fee.name} value={money(fee.amount)} />
        ))}
        {live.discount > 0 ? <Row label="Discount" value={`- ${money(live.discount)}`} /> : null}
        {live.tax > 0 ? <Row label="Tax" value={money(live.tax)} /> : null}
        {quote.sourceTotalAdjustment ? (
          <Row label="Contract adjustment" value={`${quote.sourceTotalAdjustment > 0 ? "" : "- "}${money(Math.abs(quote.sourceTotalAdjustment))}`} />
        ) : null}
        <div style={{ borderTop: "2px solid #0b0b0b", marginTop: 8, paddingTop: 8 }}>
          <Row label="Total" value={money(live.total)} strong />
        </div>
        {live.depositDue > 0 ? <Row label="Deposit due" value={money(live.depositDue)} highlight /> : null}
        {live.balanceDue > 0 ? <Row label="Balance" value={money(live.balanceDue)} /> : null}
        {computing ? <p style={{ fontSize: 12, opacity: 0.6, margin: "6px 0 0" }}>Updating total…</p> : null}
      </div>

      {paymentOptions && (live.depositDue > 0 || live.balanceDue > 0) ? (
        <div id="payment" className="no-print" style={payBox}>
          <strong>Ways to pay</strong>
          {live.depositDue > 0 ? <div style={depositDueCallout}>Deposit due: {money(live.depositDue)}</div> : null}
          <div style={{ display: "flex", gap: 24, alignItems: "flex-start", marginTop: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 14 }}>
                Venmo: <strong>@{paymentOptions.venmoHandle}</strong>
              </div>
              <div style={{ fontSize: 12, opacity: 0.6 }}>Scan with your phone to pay</div>
              <div style={{ width: 150, height: 150, marginTop: 6 }} dangerouslySetInnerHTML={{ __html: paymentOptions.venmoQrSvg }} />
            </div>
            <div>
              <div style={{ fontSize: 14 }}>
                Zelle: <strong>{paymentOptions.zelleDestination}</strong>
              </div>
              <div style={{ fontSize: 12, opacity: 0.6 }}>Send to this number from your bank app</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {live.depositDue > 0 ? (
              <button type="button" style={cardBtn} disabled={squareBusy !== null} onClick={() => startSquare("deposit")}>
                {squareBusy === "deposit" ? "Opening…" : `Pay deposit with card`}
              </button>
            ) : null}
          </div>
          {squareMsg ? <p style={{ fontSize: 12, color: "#991b1b", margin: "8px 0 0" }}>{squareMsg}</p> : null}
          <p style={{ fontSize: 12, opacity: 0.6, margin: "10px 0 0" }}>Or pay by Venmo/Zelle above. Please reference your name.</p>

          <FinancingOptions
            quoteNumber={quote.quoteNumber}
            financeAmount={live.balanceDue > 0 ? live.balanceDue : live.total > 0 ? live.total / 2 : 0}
          />
        </div>
      ) : null}

      {quote.hasOnyxShutters ? (
        <details open style={termsBox}>
          <summary style={summaryStyle}>Onyx Shutters Manufacturer Warranty</summary>
          <div style={{ marginTop: 10 }}>
            <p style={{ margin: "0 0 10px" }}>
              Your shutters are manufactured by Onyx Shutters, one of the manufacturers used by
              805 Shutters. Onyx Shutters provides manufacturer warranty coverage to the original
              purchaser when the shutters are properly installed, properly operated, and properly
              maintained.
            </p>
            <strong style={{ color: "#0b0b0b" }}>Manufacturer warranty coverage</strong>
            <ul style={termsList}>
              <li>Limited lifetime warranty on shutter mechanisms.</li>
              <li>7-year warranty on paint color fastness.</li>
              <li>7-year warranty against warping and cracking.</li>
              <li>2-year warranty on color fastness for stained wood shutters.</li>
            </ul>
            <p style={{ margin: "10px 0 0" }}>
              Warranty coverage begins from the original date of purchase and applies to the
              original purchaser.
            </p>
            <strong style={{ display: "block", marginTop: 12, color: "#0b0b0b" }}>
              Manufacturer exclusions
            </strong>
            <ul style={termsList}>
              <li>Improper installation, operation, or maintenance.</li>
              <li>Abuse, misuse, customer-performed repairs, accidents, or alterations.</li>
              <li>Acts of God and normal wear and tear.</li>
            </ul>
            <strong style={{ display: "block", marginTop: 12, color: "#0b0b0b" }}>
              Color matching
            </strong>
            <p style={{ margin: "6px 0 0" }}>
              Custom color matches and color matches between separate orders are not guaranteed due
              to material, finish, dye lot, and production variations. Once a custom color sample has
              been approved, resulting color variation is not covered by the Onyx manufacturer
              warranty.
            </p>
            <p style={{ margin: "10px 0 0" }}>
              If a warranty concern arises, please contact 805 Shutters. We will review the concern,
              request photos if needed, and help coordinate the claim process with Onyx Shutters.
              Manufacturer warranty approval, repair, replacement, or remake decisions are subject
              to Onyx Shutters&apos; review and warranty terms.
            </p>
          </div>
        </details>
      ) : null}

      {/* Balance terms — shown above the sign section */}
      <div style={termsBox}>
        <strong style={{ color: "#0b0b0b" }}>Payment at Installation</strong>
        <p style={{ margin: "6px 0 0" }}>
          The remaining balance is due at installation for all products installed and completed.
          Payment may not be withheld for corrections, manufacturer defects, warranty claims,
          shipping damage, or other open issues. Any issue will be handled through the appropriate
          correction, service, or manufacturer warranty process, but the balance for installed
          products remains due.
        </p>
        <p style={{ margin: "10px 0 0" }}>
          Approved in-house payment plans split the remaining balance into 3 monthly payments,
          with the first payment due at installation. An in-house plan must be approved by
          805 Shutters in writing before it applies.
        </p>
      </div>

      {!quote.signed && quote.allPriced ? (
        <div className="no-print">
          {selectionEmpty ? (
            <p style={{ marginTop: 20, color: "#4d4d49" }}>Please select at least one item to purchase.</p>
          ) : (
            <SignQuote token={quote.token} customerName={quote.customerName} total={acknowledgedTotal} selectedLineIds={selectedLineIds} />
          )}
        </div>
      ) : null}
      {!quote.signed && !quote.allPriced ? (
        <p style={{ marginTop: 20, opacity: 0.7 }}>
          A few items are still being finalized. We&apos;ll notify you the moment this contract is ready to approve.
        </p>
      ) : null}
    </>
  );
}

function Row({ label, value, strong, highlight }: { label: string; value: string; strong?: boolean; highlight?: boolean }) {
  return (
    <div style={highlight ? depositDueRow : { display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: strong ? 20 : 15 }}>
      <span style={{ opacity: highlight ? 1 : 0.8 }}>{label}</span>
      <span style={{ fontWeight: strong || highlight ? 700 : 500 }}>{value}</span>
    </div>
  );
}

const th = { padding: "8px 6px", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.7 } as const;
const td = { padding: "10px 6px" } as const;
const selectBar = {
  display: "flex",
  gap: 14,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 16,
  padding: "12px 14px",
  border: "1px solid #d8d8d2",
  borderRadius: 10,
  background: "#fbfbfa",
} as const;
const payBox = {
  border: "1px solid #d8d8d2",
  borderRadius: 10,
  padding: 16,
  marginTop: 16,
  background: "#fbfbfa",
} as const;
const depositDueRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 6,
  padding: "8px 10px",
  border: "2px solid #dc2626",
  borderRadius: 8,
  background: "#fff1f2",
  color: "#991b1b",
  fontSize: 15,
  fontWeight: 700,
} as const;
const depositDueCallout = {
  display: "inline-block",
  marginTop: 8,
  padding: "6px 10px",
  border: "2px solid #dc2626",
  borderRadius: 8,
  background: "#fff1f2",
  color: "#991b1b",
  fontSize: 14,
  fontWeight: 700,
} as const;
const cardBtn = {
  border: "none",
  background: "#0b0b0b",
  color: "#ffffff",
  borderRadius: 8,
  padding: "10px 16px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
} as const;
const radioLabel = { display: "inline-flex", gap: 6, alignItems: "center", fontSize: 15, fontWeight: 600, cursor: "pointer" } as const;
const termsBox = {
  marginTop: 20,
  padding: 14,
  border: "1px solid #d8d8d2",
  borderRadius: 8,
  background: "#fbfbfa",
  fontSize: 13,
  lineHeight: 1.6,
  color: "#4d4d49",
} as const;
const summaryStyle = {
  cursor: "pointer",
  fontSize: 15,
  fontWeight: 700,
  color: "#0b0b0b",
} as const;
const termsList = {
  margin: "6px 0 0",
  paddingLeft: 20,
} as const;
const discountTag = {
  display: "inline-block",
  marginTop: 4,
  fontSize: 12,
  fontWeight: 600,
  color: "#6b530a",
  background: "#faf3d6",
  border: "1px solid #b9a23e",
  borderRadius: 999,
  padding: "2px 8px",
} as const;

const FINANCING_SMS_NUMBER = "+18058069344";

function financingSmsHref(body: string) {
  return `sms:${FINANCING_SMS_NUMBER}?&body=${encodeURIComponent(body)}`;
}

function FinancingOptions({ quoteNumber, financeAmount }: { quoteNumber: string | null; financeAmount: number }) {
  const monthly = financeAmount > 0 ? Math.round((financeAmount / 3) * 1.03 * 100) / 100 : 0;
  const quoteRef = quoteNumber ? ` for quote ${quoteNumber}` : "";

  const card = {
    border: "2px solid #0b0b0b",
    background: "#ffffff",
    flex: "1 1 250px",
    minWidth: 240,
    display: "flex",
    flexDirection: "column",
  } as const;
  const bar = {
    background: "#0b0b0b",
    color: "#ffffff",
    padding: "9px 13px",
    fontSize: 11,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    fontWeight: 700,
  } as const;
  const inner = { padding: "14px 13px 13px", display: "flex", flexDirection: "column", flex: 1 } as const;
  const logoRow = {
    height: 84,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderBottom: "1px solid #d8d8d2",
    marginBottom: 10,
    paddingBottom: 8,
  } as const;
  const big = { fontSize: 26, fontWeight: 700, lineHeight: 1.05, color: "#0b0b0b" } as const;
  const bigSub = {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#6b6b66",
    margin: "4px 0 10px",
  } as const;
  const checkLine = { fontSize: 13, lineHeight: 1.5, padding: "2px 0", color: "#0b0b0b" } as const;
  const cta = {
    display: "block",
    textAlign: "center",
    background: "#0b0b0b",
    color: "#ffffff",
    textDecoration: "none",
    padding: "11px 13px",
    borderRadius: 4,
    fontSize: 13,
    fontWeight: 700,
    marginTop: "auto",
  } as const;

  return (
    <div style={{ borderTop: "1px solid #d8d8d2", marginTop: 20, paddingTop: 16 }}>
      <div
        style={{
          textAlign: "center",
          fontSize: 12,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          fontWeight: 700,
          color: "#0b0b0b",
        }}
      >
        Two Financing Options Available!
      </div>
      <p style={{ textAlign: "center", fontSize: 13, color: "#6b6b66", margin: "6px 0 14px" }}>
        You don&rsquo;t have to pay it all at once &mdash; choose the option that fits.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "stretch" }}>
        <div style={card}>
          <div style={bar}>Option 1 &middot; Wisetack Financing</div>
          <div style={inner}>
            <div style={logoRow}>
              <img src="/images/wisetack-logo.png" alt="Wisetack" style={{ height: 26, width: "auto" }} />
            </div>
            <div style={big}>0% APR</div>
            <div style={bigSub}>available for qualified customers*</div>
            <div style={checkLine}>&#10003;&nbsp; 1-minute application from your phone</div>
            <div style={checkLine}>&#10003;&nbsp; No impact to your credit score to check options</div>
            <div style={{ height: 12 }} />
            <a style={cta} href={financingSmsHref(`Hi! I'd like the Wisetack financing application link${quoteRef}.`)}>
              Text us for your application link
            </a>
          </div>
        </div>
        <div style={card}>
          <div style={bar}>Option 2 &middot; 805 In-House Plan</div>
          <div style={inner}>
            <div style={logoRow}>
              <img src="/brand/805-shutters-logo-exact-transparent.png" alt="805 Shutters" style={{ height: 76, width: "auto" }} />
            </div>
            <div style={big}>
              {monthly > 0 ? (
                <>
                  {money(monthly)}
                  <span style={{ fontSize: 13, fontWeight: 400 }}>/mo</span>
                </>
              ) : (
                "0% Interest"
              )}
            </div>
            <div style={bigSub}>{monthly > 0 ? "3 payments · 0% interest · no credit application" : "up to 3 monthly payments · no credit application"}</div>
            <div style={checkLine}>&#10003;&nbsp; 50% deposit today, the rest auto-charged monthly</div>
            <div style={checkLine}>&#10003;&nbsp; Starts the day of installation</div>
            <div style={{ height: 12 }} />
            <a style={cta} href={financingSmsHref(`Hi! I'd like to set up the 805 in-house payment plan${quoteRef}.`)}>
              I&rsquo;m interested &mdash; text 805 Shutters
            </a>
          </div>
        </div>
      </div>
      <p style={{ fontSize: 10.5, lineHeight: 1.5, color: "#6b6b66", margin: "10px 0 0" }}>
        *Financing subject to credit approval; terms vary. Provided by Wisetack&rsquo;s lending partners. See
        wisetack.com/faqs. In-house plan collected by automatic card payment through Square; 3 monthly payments shown
        includes a 3% card processing fee.
      </p>
    </div>
  );
}
