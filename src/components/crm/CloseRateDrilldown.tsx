import type { CloseRateCohortCustomer } from "@/lib/crm/command-performance";
import type { CrmJob, CrmQuote } from "@/lib/crm/types";
import { DeletedOpportunities, type DeletedOpportunity } from "./DeletedOpportunities";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function opportunityDate(job: CrmJob) {
  const value = job.appointment_start || job.created_at;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function dateSortValue(value: string | null | undefined) {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function latestActiveQuoteByJob(quotes: CrmQuote[]) {
  const quoteByJobId = new Map<string, CrmQuote>();

  for (const quote of quotes) {
    if (quote.status === "archived" || quote.archived_at) continue;
    const existing = quoteByJobId.get(quote.job_id);
    if (!existing || dateSortValue(quote.updated_at || quote.created_at) > dateSortValue(existing.updated_at || existing.created_at)) {
      quoteByJobId.set(quote.job_id, quote);
    }
  }

  return quoteByJobId;
}

function opportunityAmount(job: CrmJob, quote: CrmQuote | undefined) {
  if (quote) {
    return Number.isFinite(quote.quote_total)
      ? `Quote: ${currency.format(quote.quote_total)}`
      : "Quote: Not available";
  }
  return Number.isFinite(job.estimated_total) && job.estimated_total > 0
    ? `Estimate: ${currency.format(job.estimated_total)}`
    : "Quote: Not available";
}

export function CloseRateDeleteAction({ job, onDelete, busy }: {
  job: CrmJob;
  onDelete: (job: CrmJob) => void;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      className="crm-close-rate-delete-button"
      onClick={() => onDelete(job)}
      disabled={busy}
      aria-label={`Delete unsold ${job.product_interest || "opportunity"} opportunity for ${job.customer_name || "customer"}`}
    >
      Delete
    </button>
  );
}

function CloseRateOutcomeGroup({
  outcome,
  customers,
  quoteByJobId,
  onDelete,
  busy
}: {
  outcome: "sold" | "unsold";
  customers: CloseRateCohortCustomer[];
  quoteByJobId: Map<string, CrmQuote>;
  onDelete: (job: CrmJob) => void;
  busy: boolean;
}) {
  const sold = outcome === "sold";
  const label = sold ? "Sold" : "Unsold";

  return (
    <section className={`crm-close-rate-group crm-close-rate-group--${outcome}`} aria-labelledby={`crm-close-rate-${outcome}-heading`}>
      <div className="crm-close-rate-group-head">
        <h3 id={`crm-close-rate-${outcome}-heading`}>{label}</h3>
        <span>{customers.length} customer{customers.length === 1 ? "" : "s"}</span>
      </div>
      {customers.length ? (
        <ul className="crm-close-rate-customer-list">
          {customers.map((customer) => {
            const primaryJob = customer.jobs[0];
            return (
              <li key={customer.id} className="crm-close-rate-customer">
                <div className="crm-close-rate-customer-head">
                  <strong>{primaryJob?.customer_name || "Customer name unavailable"}</strong>
                  <span>{customer.jobs.length} job{customer.jobs.length === 1 ? "" : "s"} in period</span>
                </div>
                <ul className="crm-close-rate-job-list" aria-label={`${primaryJob?.customer_name || "Customer"} jobs in period`}>
                  {customer.jobs.map((job) => (
                    <li key={job.id}>
                      <div className="crm-close-rate-job-details">
                        <span>{job.product_interest || "Product not listed"}</span>
                        <small>{opportunityDate(job)} · {titleCase(job.status)}</small>
                        <small className="crm-close-rate-job-amount">{opportunityAmount(job, quoteByJobId.get(job.id))}</small>
                      </div>
                      {!sold ? (
                        <CloseRateDeleteAction job={job} onDelete={onDelete} busy={busy} />
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="crm-close-rate-empty">No {label.toLowerCase()} jobs are included in this period.</p>
      )}
    </section>
  );
}

export function CloseRateDrilldown({
  periodDays,
  customers,
  quotes = [],
  onClose,
  onDelete,
  busy,
  onLoadDeleted,
  onRestore
}: {
  periodDays: 30 | 60;
  customers: CloseRateCohortCustomer[];
  quotes?: CrmQuote[];
  onClose: () => void;
  onDelete: (job: CrmJob) => void;
  busy: boolean;
  onLoadDeleted?: () => Promise<DeletedOpportunity[]>;
  onRestore?: (id: string, deletedAt: string) => Promise<void>;
}) {
  const soldCustomers = customers.filter((customer) => customer.outcome === "sold");
  const unsoldCustomers = customers.filter((customer) => customer.outcome === "unsold");
  const quoteByJobId = latestActiveQuoteByJob(quotes);

  return (
    <section
      id="crm-close-rate-drilldown"
      className="crm-close-rate-drilldown"
      role="region"
      aria-labelledby="crm-close-rate-drilldown-heading"
    >
      <div className="crm-close-rate-drilldown-head">
        <div>
          <p className="eyebrow">Close-rate jobs</p>
          <h2 id="crm-close-rate-drilldown-heading">{periodDays}-Day Close Rate</h2>
          <p>{customers.length} included customer{customers.length === 1 ? "" : "s"}: {soldCustomers.length} sold and {unsoldCustomers.length} unsold.</p>
        </div>
        <button type="button" className="crm-ghost-button" onClick={onClose} aria-label="Close close-rate job details">
          Close
        </button>
      </div>
      {onLoadDeleted && onRestore ? <DeletedOpportunities load={onLoadDeleted} restore={onRestore} busy={busy} /> : null}
      <div className="crm-close-rate-groups">
        <CloseRateOutcomeGroup outcome="sold" customers={soldCustomers} quoteByJobId={quoteByJobId} onDelete={onDelete} busy={busy} />
        <CloseRateOutcomeGroup outcome="unsold" customers={unsoldCustomers} quoteByJobId={quoteByJobId} onDelete={onDelete} busy={busy} />
      </div>
    </section>
  );
}
