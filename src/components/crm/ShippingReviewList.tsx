"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type ReviewRow = {
  id: string;
  manufacturer: string | null;
  order_ref: string | null;
  po_number: string | null;
  quote_number: string | null;
  reason: string;
  detail: string | null;
  proposed_received_at: string | null;
  proposed_manufacturer_order_ref: string | null;
  updated_at: string;
};

const reasons: Record<string, string> = {
  no_match: "No matching quote",
  multiple: "More than one quote",
  bookkeeping_only: "Bookkeeping only",
  lotus_not_shipped: "Lotus still has product to ship",
  partial: "Not every order has shipped",
  no_ship_date: "No ship date",
  proposed_write: "Proposed write",
};

export function ShippingReviewList() {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [proposals, setProposals] = useState<ReviewRow[]>([]);
  const [writesEnabled, setWritesEnabled] = useState(false);
  const [message, setMessage] = useState("Loading shipping review…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = (await getSupabaseBrowserClient()?.auth.getSession())?.data.session;
      if (!session) {
        if (!cancelled) setMessage("Sign in to the CRM to see shipping notices that need review.");
        return;
      }
      const response = await fetch("/api/crm/shipping-review", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
      const data = await response.json();
      if (cancelled) return;
      if (!response.ok) {
        setMessage(data.message || "Shipping review list could not be loaded.");
        return;
      }
      setReviews(data.reviews || []);
      setProposals(data.proposals || []);
      setWritesEnabled(Boolean(data.writesEnabled));
      setMessage("");
    })().catch(error => {
      if (!cancelled) setMessage(error instanceof Error ? error.message : "Shipping review list could not be loaded.");
    });
    return () => { cancelled = true; };
  }, []);

  return <main style={{ maxWidth: 960, margin: "2rem auto", padding: "0 24px" }}>
    <a href="/crm">← 805 CRM</a>
    <h1 style={{ marginTop: 24 }}>Shipping review</h1>
    <p>Manufacturer shipping notices that did not update a quote. Norman, Onyx, and Lotus only. Sundance stays manual.</p>
    <p>{writesEnabled ? "Automatic quote updates are on." : "Automatic quote updates are off. Proposed dates below have not been written."}</p>
    {message ? <p role="status">{message}</p> : null}
    <h2>Needs review ({reviews.length})</h2>
    {table(reviews)}
    <h2>Proposed writes ({proposals.length})</h2>
    {table(proposals)}
  </main>;
}

function table(rows: ReviewRow[]) {
  if (!rows.length) return <p>None.</p>;
  return <div style={{ overflowX: "auto" }}>
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>{["When", "Maker", "Order", "PO", "Quote", "Why", "Detail"].map(label => <th key={label} style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "8px 6px" }}>{label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map(row => <tr key={row.id}>
          <td style={{ padding: "8px 6px", verticalAlign: "top" }}>{row.updated_at?.slice(0, 10)}</td>
          <td style={{ padding: "8px 6px", verticalAlign: "top" }}>{row.manufacturer}</td>
          <td style={{ padding: "8px 6px", verticalAlign: "top" }}>{row.order_ref}</td>
          <td style={{ padding: "8px 6px", verticalAlign: "top" }}>{row.po_number}</td>
          <td style={{ padding: "8px 6px", verticalAlign: "top" }}>{row.quote_number}{row.proposed_received_at ? <small><br />{row.proposed_received_at} {row.proposed_manufacturer_order_ref || ""}</small> : null}</td>
          <td style={{ padding: "8px 6px", verticalAlign: "top" }}>{reasons[row.reason] || row.reason}</td>
          <td style={{ padding: "8px 6px", verticalAlign: "top" }}>{row.detail}</td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}
