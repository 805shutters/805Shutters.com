"use client";

import type { CrmQuote } from "@/lib/crm/types";

type Props = {
  quotes: CrmQuote[];
  onOpenQuote: (quoteId: string) => void;
};

function money(value: number): string {
  return Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/**
 * The historical V1 builder was launched from the CRM's existing quote/order
 * list. This small launcher restores that entry path; the builder it opens is
 * an exact copy of the pre-redesign V1 component.
 */
export function OriginalV1QuotesWorkspace({ quotes, onOpenQuote }: Props) {
  return (
    <section className="crm-ledger" aria-labelledby="original-v1-heading">
      <div className="crm-section-head">
        <div>
          <p className="eyebrow">Original V1</p>
          <h2 id="original-v1-heading">Quotes</h2>
          <p>Select an existing quote to open the original line-item and pricing builder.</p>
        </div>
      </div>

      {!quotes.length ? <p className="crm-empty">No existing V1 quotes are available.</p> : null}

      <div className="crm-order-grid">
        {quotes.map((quote) => (
          <article className="crm-order-card" key={quote.id}>
            <div className="crm-order-card-head">
              <div>
                <h3>{quote.customer_name || "Linked job"}</h3>
                <span>{quote.quote_number || quote.id.slice(0, 8)}</span>
              </div>
              <strong>{money(quote.quote_total)}</strong>
            </div>
            <button
              type="button"
              className="crm-ghost-button"
              onClick={() => onOpenQuote(quote.id)}
              style={{ marginBottom: 10 }}
            >
              Edit line items &amp; pricing
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
