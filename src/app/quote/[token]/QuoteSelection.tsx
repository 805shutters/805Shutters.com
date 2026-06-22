"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicQuote } from "@/lib/crm/public-quote";
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
export function QuoteSelection({ quote }: { quote: PublicQuote }) {
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
          {quote.lines.map((line) => {
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
                  <strong>{line.room}</strong>
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
                <em style={{ opacity: 0.6 }}>This quote is still being prepared.</em>
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
          <Row label="Quote adjustment" value={`${quote.sourceTotalAdjustment > 0 ? "" : "- "}${money(Math.abs(quote.sourceTotalAdjustment))}`} />
        ) : null}
        <div style={{ borderTop: "2px solid #0b0b0b", marginTop: 8, paddingTop: 8 }}>
          <Row label="Total" value={money(live.total)} strong />
        </div>
        {live.depositDue > 0 ? <Row label="Deposit due" value={money(live.depositDue)} /> : null}
        {live.balanceDue > 0 ? <Row label="Balance" value={money(live.balanceDue)} /> : null}
        {computing ? <p style={{ fontSize: 12, opacity: 0.6, margin: "6px 0 0" }}>Updating total…</p> : null}
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
          A few items are still being finalized. We&apos;ll notify you the moment this quote is ready to approve.
        </p>
      ) : null}
    </>
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
const radioLabel = { display: "inline-flex", gap: 6, alignItems: "center", fontSize: 15, fontWeight: 600, cursor: "pointer" } as const;
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
