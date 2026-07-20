"use client";

import type { QuoteLabComparison } from "@/lib/quote-lab/types";
import styles from "./QuoteLab.module.css";

function money(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function QuoteLabAudit({ comparison }: { comparison: QuoteLabComparison | null }) {
  if (!comparison) return null;
  const reviewLines = comparison.lines.filter((line) => {
    const hasDesignDifference = line.designs.some((design) => {
      const authoritative = design.authoritative.ok ? design.authoritative.total : 0;
      return authoritative !== design.legacy.total || !design.authoritative.ok;
    });
    return line.sendBlocked || hasDesignDifference;
  });

  return (
    <details className={styles.auditPanel}>
      <summary>
        <span>
          <strong>Backend pricing audit</strong>
          <small>Old browser behavior versus new server-authoritative results</small>
        </span>
        <span className={styles.auditSummaryMetrics}>
          <b>{reviewLines.length} line{reviewLines.length === 1 ? "" : "s"} to review</b>
          <b>{money(comparison.difference)} difference</b>
        </span>
      </summary>
      <div className={styles.auditBody}>
        <div className={styles.auditTotals}>
          <div><span>Old browser total</span><strong>{money(comparison.legacyTotal)}</strong></div>
          <div><span>New server total</span><strong>{money(comparison.authoritativeTotal)}</strong></div>
          <div><span>Difference</span><strong>{money(comparison.difference)}</strong></div>
          <div><span>Manufacturer net charges</span><strong>{money(comparison.orderChargeTotal)}</strong></div>
        </div>

        {comparison.findings.length > 0 && (
          <section className={styles.auditFindings}>
            <h2>What changed</h2>
            <ul>{comparison.findings.map((finding) => <li key={finding}>{finding}</li>)}</ul>
          </section>
        )}

        {comparison.orderCharges.length > 0 && (
          <section className={styles.auditCharges}>
            <h2>Order-level cost exposure</h2>
            {comparison.orderCharges.map((charge) => (
              <div key={charge.id}><span><strong>{charge.label}</strong><small>{charge.detail}</small></span><b>{money(charge.amount)}</b></div>
            ))}
          </section>
        )}

        <section className={styles.auditLines}>
          <h2>{reviewLines.length > 0 ? "Lines requiring review" : "No pricing discrepancies"}</h2>
          {reviewLines.length === 0 ? (
            <p>All selected designs agree with the active browser calculation and passed authoritative validation.</p>
          ) : reviewLines.map((line) => (
            <article key={line.lineId}>
              <header><strong>{line.room}</strong><span>Old {money(line.legacyTotal)} · New {money(line.authoritativeTotal)}</span></header>
              {line.blockReason && <p>{line.blockReason}</p>}
              {line.designs.map((design) => (
                <div key={design.designId}>
                  <b>Design {design.label}{design.selected ? " · selected" : " · alternative"}</b>
                  <span>Old: {design.legacy.status} · {money(design.legacy.total)}</span>
                  <span>{design.authoritative.ok ? `Server: ${money(design.authoritative.total)}` : `Server: ${design.authoritative.code}`}</span>
                </div>
              ))}
            </article>
          ))}
        </section>
      </div>
    </details>
  );
}
