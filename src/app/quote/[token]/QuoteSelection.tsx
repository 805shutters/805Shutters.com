"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicQuote } from "@/lib/crm/public-quote";
import type { PaymentOptions } from "@/lib/finance/payment-options";
import type { QuotePaymentState, QuotePaymentType } from "@/lib/crm/quote-payment-state";
import { SignQuote } from "./SignQuote";
import styles from "./QuoteSelection.module.css";
import { quoteProductDetails } from "./quoteLinePresentation";

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
  payment: QuotePaymentState;
};

/** Interactive line-item table + totals + sign block. Supports the "Purchase all
 *  / Purchase some" flow: the customer can check a subset of windows and the total
 *  recomputes (via the server engine) for only the chosen items. */
export function QuoteSelection({ quote, paymentOptions, previewOnly = false }: { quote: PublicQuote; paymentOptions?: PaymentOptions | null; previewOnly?: boolean }) {
  const fullFees = quote.fees.reduce((s, f) => s + f.amount, 0);
  const fullMoney: LiveMoney = {
    subtotal: quote.subtotal,
    fees: fullFees,
    discount: quote.discount,
    tax: quote.tax,
    total: quote.total,
    depositDue: quote.depositDue,
    balanceDue: quote.balanceDue,
    payment: quote.payment,
  };
  const allowSelection = !previewOnly && !quote.signed && quote.lines.length > 1;
  const [mode, setMode] = useState<"all" | "some">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set(quote.lines.map((l) => l.id)));
  const [live, setLive] = useState<LiveMoney>(fullMoney);
  const [computing, setComputing] = useState(false);
  const [squareBusy, setSquareBusy] = useState<QuotePaymentType | null>(null);
  const [squareMsg, setSquareMsg] = useState<string | null>(null);
  const [copiedPayment, setCopiedPayment] = useState<"zelle" | "venmo" | null>(null);
  const [copyFailed, setCopyFailed] = useState<"zelle" | "venmo" | null>(null);
  const [signedNow, setSignedNow] = useState(false);
  const reqId = useRef(0);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
  }, []);

  useEffect(() => {
    if (previewOnly) return;
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
            payment: data.payment,
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
  }, [mode, previewOnly, selected, quote.token]);

  const selectionEmpty = mode === "some" && selected.size === 0;
  const acknowledgedTotal = live.total;
  const selectedLineIds = mode === "some" ? [...selected] : undefined;
  const canSign = !quote.signed && quote.allPriced;
  const showActionPanel = !previewOnly && (canSign || Boolean(paymentOptions));
  const paymentType = live.payment.available ? live.payment.dueType : null;
  const paymentLabel = paymentType === "deposit" ? "Deposit due" : paymentType === "balance" ? "Balance due" : null;

  async function startSquare(type: QuotePaymentType) {
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

  function chooseSome() {
    setMode("some");
    setSelected(new Set());
  }

  async function copyPaymentValue(kind: "zelle" | "venmo", value: string) {
    let copied = false;
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
    } catch {
      const field = document.createElement("textarea");
      field.value = value;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      try {
        document.body.appendChild(field);
        field.select();
        field.setSelectionRange(0, value.length);
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      } finally {
        field.remove();
      }
    }

    setCopiedPayment(copied ? kind : null);
    setCopyFailed(copied ? null : kind);
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    copyResetTimer.current = setTimeout(() => {
      setCopiedPayment(null);
      setCopyFailed(null);
    }, 2400);
  }

  return (
    <>
      {allowSelection ? (
        <div className={styles.purchaseSelector}>
          <span className={styles.purchaseHeading}>Purchase:</span>
          <label className={styles.purchaseOption} data-selected={mode === "all"}>
            <input className={styles.purchaseRadio} type="radio" name="purchase-mode" checked={mode === "all"} onChange={() => setMode("all")} />
            <span>All</span>
          </label>
          <label className={styles.purchaseOption} data-selected={mode === "some"}>
            <input className={styles.purchaseRadio} type="radio" name="purchase-mode" checked={mode === "some"} onChange={chooseSome} />
            <span>Some</span>
          </label>
          {mode === "some" ? (
            <span className={styles.purchaseHelp}>Please select the line items you wish to purchase.</span>
          ) : null}
        </div>
      ) : null}

      <div className={`${styles.contractLayout} ${showActionPanel ? "" : styles.contractLayoutSingle}`}>
        <section className={styles.orderSummary} aria-labelledby="order-summary-heading">
          <div className={styles.orderSummaryHeader}>
            <h2 id="order-summary-heading">Contract</h2>
          </div>

          {!previewOnly && !quote.signed && !quote.allPriced ? <p style={selectionNotice}>A few items are still being finalized. We&apos;ll notify you the moment this contract is ready to approve.</p> : null}

          <div className={styles.orderLines}>
            {quote.lines.map((line) => {
              const isChecked = selected.has(line.id);
              const dimmed = mode === "some" && !isChecked;
              return (
                <article key={line.id} className={styles.orderLine} style={{ opacity: dimmed ? 0.4 : 1 }}>
                  <div className={styles.orderLineHeader}>
                    <div>
                      {mode === "some" ? (
                        <label className={styles.lineSelect}>
                          <input type="checkbox" checked={isChecked} onChange={() => toggle(line.id)} />
                          <span>Select</span>
                        </label>
                      ) : null}
                      <strong className={styles.roomName}>{line.room}</strong>
                      <span className={styles.lineQuantity}>Quantity {line.quantity}</span>
                    </div>
                    <strong className={styles.linePrice}>{line.priceReady ? money(line.lineTotal) : "Pricing in progress"}</strong>
                  </div>
                  {line.discountPercent > 0 ? <span style={discountTag}>{line.discountPercent}% off applied</span> : null}
                  <div className={styles.orderLineDetails}>
                    {line.priceReady ? (
                      line.showDesignOptions && line.designOptions.length ? (
                        <div className={styles.designOptions}>
                          {line.designOptions.map((option) => (
                            <div key={option.id} className={line.designOptions.length > 1 ? styles.designOption : undefined}>
                              {line.designOptions.length > 1 ? (
                                <div className={styles.designOptionHeading}>
                                  <strong>Option {option.label}</strong>
                                  <span>{money(option.lineTotal)}</span>
                                </div>
                              ) : null}
                              <ProductConfiguration productName={option.productName} styleName={option.styleName} options={option.options} />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <ProductConfiguration productName={line.productName} styleName={line.styleName} options={line.options} />
                      )
                    ) : (
                      <em style={{ opacity: 0.6 }}>Pricing in progress</em>
                    )}
                  </div>
                </article>
              );
            })}
            {quote.lines.length === 0 ? <p className={styles.emptyDetails}><em>This contract is still being prepared.</em></p> : null}
          </div>

          <div className={styles.orderTotals}>
            <PricingSummary quote={quote} live={live} computing={computing} />
          </div>
        </section>

        {showActionPanel ? (
          <aside className={`${styles.actionPanel} no-print`} aria-label="Sign contract and make a payment">
            <div className={styles.actionPanelHeader}>
              <strong>Sign contract here</strong>
            </div>

            {canSign ? (
              <section className={styles.actionSection} aria-labelledby="sign-contract-heading">
                <div className={styles.actionStep}><span>1</span><strong id="sign-contract-heading">Sign the contract</strong></div>
                {selectionEmpty ? (
                  <p className={styles.actionNotice}>Select at least one item below before signing.</p>
                ) : (
                  <SignQuote
                    token={quote.token}
                    customerName={quote.customerName}
                    total={acknowledgedTotal}
                    selectedLineIds={selectedLineIds}
                    done={signedNow}
                    onSigned={() => setSignedNow(true)}
                    placement="top"
                    compact
                  />
                )}
              </section>
            ) : null}

            {paymentOptions ? (
              <section id="payment" className={styles.actionSection} aria-labelledby="payment-heading">
                <div className={styles.actionStep}>
                  <span>{canSign ? "2" : "1"}</span>
                  <strong id="payment-heading">{paymentType === "deposit" ? "Make a deposit" : "Make a payment"}</strong>
                </div>
                {!live.payment.available ? (
                  <p className={styles.actionNotice}>We couldn&apos;t verify the current amount due. Please refresh or call {quote.business.phone}.</p>
                ) : paymentType && paymentLabel ? (
                  <>
                    <div className={styles.amountDue}>
                      <span>{paymentLabel}</span>
                      <strong>{money(live.payment.amountDue)}</strong>
                    </div>
                    <button
                      type="button"
                      className={styles.cardPaymentButton}
                      disabled={squareBusy !== null || selectionEmpty}
                      onClick={() => startSquare(paymentType)}
                    >
                      {squareBusy === paymentType ? "Opening secure checkout…" : `Pay ${paymentType} with card`}
                    </button>
                    {squareMsg ? <p className={styles.paymentError}>{squareMsg}</p> : null}
                    <div className={styles.peerPayments}>
                      <div className={styles.peerPaymentDetails} aria-live="polite">
                        <button
                          type="button"
                          className={styles.copyPaymentButton}
                          onClick={() => copyPaymentValue("zelle", paymentOptions.zelleDestination)}
                          aria-label={`Copy Zelle phone number ${paymentOptions.zelleDestination}`}
                        >
                          <span>Zelle</span>
                          <strong>{paymentOptions.zelleDestination}</strong>
                          <small>{copiedPayment === "zelle" ? "Copied to clipboard ✓" : copyFailed === "zelle" ? "Couldn’t copy — press and hold" : "Tap to copy"}</small>
                        </button>
                        <button
                          type="button"
                          className={styles.copyPaymentButton}
                          onClick={() => copyPaymentValue("venmo", `@${paymentOptions.venmoHandle}`)}
                          aria-label={`Copy Venmo address @${paymentOptions.venmoHandle}`}
                        >
                          <span>Venmo</span>
                          <strong>@{paymentOptions.venmoHandle}</strong>
                          <small>{copiedPayment === "venmo" ? "Copied to clipboard ✓" : copyFailed === "venmo" ? "Couldn’t copy — press and hold" : "Tap to copy"}</small>
                        </button>
                      </div>
                      <div
                        className={styles.venmoQr}
                        aria-label={`Venmo QR code for @${paymentOptions.venmoHandle}`}
                        dangerouslySetInnerHTML={{ __html: paymentOptions.venmoQrSvg }}
                      />
                    </div>
                  </>
                ) : (
                  <p className={styles.paidMessage}>No payment is currently due.</p>
                )}
              </section>
            ) : null}
          </aside>
        ) : null}

        <div className={styles.contractContent}>
          {!previewOnly && paymentOptions && live.payment.available && live.payment.outstanding > 0 ? (
            <div className="no-print" style={financingBox}>
              <FinancingOptions
                quoteNumber={quote.quoteNumber}
                financeAmount={live.payment.outstanding}
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

        </div>
      </div>
    </>
  );
}

function PricingSummary({ quote, live, computing }: { quote: PublicQuote; live: LiveMoney; computing: boolean }) {
  const depositSatisfied = live.payment.available && live.depositDue > 0 && live.payment.depositPaid >= live.depositDue;
  return <div style={pricingSummary}>
    <Row label="Subtotal" value={money(live.subtotal)} />
    {quote.fees.map((fee, i) => <Row key={i} label={fee.name} value={money(fee.amount)} />)}
    {live.discount > 0 ? <Row label="Discount" value={`- ${money(live.discount)}`} /> : null}
    {live.tax > 0 ? <Row label="Tax" value={money(live.tax)} /> : null}
    {quote.sourceTotalAdjustment ? <Row label="Contract adjustment" value={`${quote.sourceTotalAdjustment > 0 ? "" : "- "}${money(Math.abs(quote.sourceTotalAdjustment))}`} /> : null}
    <div style={{ borderTop: "2px solid #0b0b0b", marginTop: 8, paddingTop: 8 }}><Row label="Total" value={money(live.total)} strong /></div>
    {live.depositDue > 0 ? <Row label={depositSatisfied ? "Deposit paid" : "Deposit"} value={money(live.depositDue)} highlight={!depositSatisfied && live.payment.dueType === "deposit"} /> : null}
    {live.balanceDue > 0 ? <Row label="Balance" value={money(live.balanceDue)} /> : null}
    {computing ? <p style={{ fontSize: 12, opacity: 0.6, margin: "6px 0 0" }}>Updating total…</p> : null}
  </div>;
}

function ProductConfiguration({ productName, styleName, options }: { productName: string; styleName: string; options: string[] }) {
  const details = quoteProductDetails(styleName, options);
  return (
    <div className={styles.productConfiguration}>
      <strong className={styles.productName}>{productName}</strong>
      {details.length ? (
        <dl className={styles.productDetails}>
          {details.map((detail) => (
            <div className={styles.productDetail} key={`${detail.label}:${detail.value}`}>
              <dt>{detail.label}</dt>
              <dd>{detail.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
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

const selectionNotice = { margin: "0 0 16px", padding: "14px 16px", border: "1px solid #b8b6ae", borderRadius: 10, background: "#f4f4f2", color: "#4d4d49" } as const;
const pricingSummary = { width: "100%", marginLeft: "auto" } as const;
const financingBox = {
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
