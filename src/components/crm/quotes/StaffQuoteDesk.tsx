"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { ArrowUpRight, Check, Circle, Plus, Search, Trash2 } from "lucide-react";
import type { QuoteTableRow } from "@mts/components/crm/quote-builder/QuotesTable";
import { canDeleteStaffDraft, staffNextSteps, staffQuoteAmount, staffQuoteStage, staffStageLabels, type StaffQuoteFilter } from "./staff-quote-view";
import { staffCustomerQuoteView, staffQuoteLetter } from "./staff-quote-groups";
import { quoteColor } from "@/app/quote/[token]/quoteColors";
import styles from "./StaffQuoteDesk.module.css";

type Props = {
  quotes: QuoteTableRow[];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  onOpen: (quote: QuoteTableRow) => void;
  onDelete: (quote: QuoteTableRow) => Promise<unknown>;
  onNewQuote: () => void;
  onNewNormanQuote?: () => void;
  onOpenTools: () => void;
};

function Status({ quote }: { quote: QuoteTableRow }) {
  const stage = staffQuoteStage(quote);
  const sold = ["sold", "ordered", "received", "installed"].includes(stage);
  return <span className={`${styles.status} ${sold ? styles.complete : ""}`}>
    {sold ? <Check size={14} aria-hidden="true" /> : <Circle size={12} aria-hidden="true" />}
    {staffStageLabels[stage]}
  </span>;
}

export function StaffQuoteDesk({ quotes, isLoading, isError, isFetching, onRetry, onOpen, onDelete, onNewQuote, onNewNormanQuote, onOpenTools }: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteDraft = async (quote: QuoteTableRow) => {
    if (deletingId || !canDeleteStaffDraft(quote)) return;
    const letter = staffQuoteLetter(quote);
    const label = `${letter ? `${letter} · ` : ""}${quote.quote_number || quote.id}`;
    if (!window.confirm(`Delete draft quote ${label} for ${quote.customer_name || "this customer"}? The quote will be removed from your quote list. Other quotes for this customer will be kept.`)) return;
    setDeletingId(quote.id);
    setDeleteError(null);
    try {
      await onDelete(quote);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Quote could not be deleted. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };
  const quoteActions = (quote: QuoteTableRow) => <div className={styles.quoteActions}>
    <button type="button" onClick={() => onOpen(quote)} aria-label={`Open quote ${staffQuoteLetter(quote) || ""} ${quote.quote_number || quote.id}`}>Open <ArrowUpRight size={15} /></button>
    {canDeleteStaffDraft(quote) && <button type="button" className={styles.deleteButton} disabled={deletingId !== null} onClick={() => void deleteDraft(quote)} aria-label={`Delete draft quote ${staffQuoteLetter(quote) || ""} ${quote.quote_number || quote.id}`}>
      <Trash2 size={15} aria-hidden="true" /> {deletingId === quote.id ? "Deleting…" : "Delete draft"}
    </button>}
  </div>;
  const [filter, setFilter] = useState<StaffQuoteFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const { counts, matching, customers, matchingIds } = useMemo(() => staffCustomerQuoteView(quotes, filter, search), [quotes, filter, search]);
  const pageCount = Math.max(1, Math.ceil(customers.length / 25));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = customers.slice(currentPage * 25, (currentPage + 1) * 25);
  const changeFilter = (next: StaffQuoteFilter) => { setFilter(next); setPage(0); };
  const unavailable = isLoading || isError;
  const filtered = filter !== "all";
  return <section className={styles.desk} aria-label="Staff quotes">
    <header className={styles.header}>
      <div><h1>Quotes</h1><p>Prepare, follow up, and close.</p></div>
      <div className={styles.actions}>
        <button type="button" onClick={onOpenTools}>Quote tools</button>
        {onNewNormanQuote && <button type="button" onClick={onNewNormanQuote}><Plus size={17} /> New Norman quote</button>}
        <button type="button" className={styles.primary} onClick={onNewQuote}><Plus size={17} /> New quote</button>
      </div>
    </header>
    <div className={styles.metrics}>
      <button type="button" onClick={() => changeFilter("draft")}><span>Draft quotes</span><strong>{unavailable ? "—" : counts.draft}</strong><small>Complete the details <ArrowUpRight size={14} /></small></button>
      <button type="button" onClick={() => changeFilter("sent")}><span>Awaiting a decision</span><strong>{unavailable ? "—" : counts.sent}</strong><small>Follow up on sent quotes <ArrowUpRight size={14} /></small></button>
      <button type="button" onClick={() => changeFilter("sold")}><span>Sold quotes</span><strong>{unavailable ? "—" : counts.sold}</strong><small>All sold · Including later stages <ArrowUpRight size={14} /></small></button>
    </div>
    <div className={styles.toolbar}>
      <div className={styles.filters} aria-label="Quote filters">
        {(["all", "draft", "sent", "sold"] as const).map(stage => <button type="button" key={stage} aria-pressed={filter === stage} onClick={() => changeFilter(stage)}>{staffStageLabels[stage]}{stage !== "all" && !unavailable ? ` · ${counts[stage]}` : ""}</button>)}
        <select aria-label="More quote stages" value={["all", "draft", "sent", "sold"].includes(filter) ? "" : filter} onChange={event => changeFilter(event.target.value as StaffQuoteFilter)}>
          <option value="" disabled>More stages</option>
          {(["pending", "ordered", "received", "installed", "archived"] as const).map(stage => <option key={stage} value={stage}>{staffStageLabels[stage]}{unavailable ? "" : ` · ${counts[stage]}`}</option>)}
        </select>
      </div>
      <label className={styles.search}><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search staff quotes" placeholder="Search name or quote" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} /></label>
    </div>
    {deleteError && <p role="alert" className={styles.deleteError}>{deleteError}</p>}
    {isLoading ? <div role="status" className={styles.empty}>Loading quotes…</div> : isError ? <div role="alert" className={styles.empty}><h2>Quote history could not be loaded</h2><p>Retry to see the complete list.</p><button type="button" disabled={isFetching} onClick={onRetry}>{isFetching ? "Retrying…" : "Retry loading quotes"}</button></div> : <>
      <div className={styles.resultsHeader}><h2>{filtered ? staffStageLabels[filter] + " quotes" : "Customer quotes"}</h2><span>{customers.length} {customers.length === 1 ? "customer" : "customers"} · {matching.length} {matching.length === 1 ? "quote" : "quotes"}{filtered || search.trim() ? " matching" : ""}{isFetching ? " · Refreshing…" : ""}</span></div>
      {!visible.length ? <div role="status" className={styles.empty}>No quotes match this view.<button type="button" onClick={() => { setSearch(""); changeFilter("all"); }}>Show all quotes</button></div> : <div className={styles.customers}>
        {visible.map(customer => <article className={styles.customerBox} key={customer.id} aria-label={`Quotes for ${customer.name}`}>
          <header className={styles.customerHeader}>
            <h3>{customer.name}</h3>
            {customer.address && <p>{customer.address}</p>}
            <span>{customer.quotes.length} {customer.quotes.length === 1 ? "quote" : "quotes"}</span>
          </header>
          <div className={styles.customerQuotes}>
            {customer.quotes.map(quote => {
              const letter = staffQuoteLetter(quote);
              const matches = matchingIds.has(`${quote.source}:${quote.id}`);
              const color = letter && letter !== "A" ? quoteColor(letter) : "#494940";
              return <section key={`${quote.source}:${quote.id}`} className={`${styles.quoteTile} ${matches ? "" : styles.otherQuote}`} style={{ "--quote-color": color } as CSSProperties} aria-label={`${letter ? `Quote ${letter}` : "Quote"} ${quote.quote_number || "unnumbered"}`}>
                <header className={styles.quoteIdentity}>
                  {letter && <span className={styles.quoteLetter} aria-hidden="true">{letter}</span>}
                  <div><strong>{letter ? `Quote ${letter}` : "Quote"}</strong><small>{quote.quote_number || "Unnumbered quote"}</small></div>
                  {!matches && <span className={styles.otherLabel}>Other quote</span>}
                </header>
                <div className={styles.quoteDetails}><strong className={styles.quoteAmount}>{staffQuoteAmount(quote)}</strong><Status quote={quote} /></div>
                <p className={styles.quoteNext}>{staffNextSteps[staffQuoteStage(quote)]}</p>
                {quoteActions(quote)}
              </section>;
            })}
          </div>
        </article>)}
      </div>}
      <footer className={styles.pagination}><span>{customers.length ? `${currentPage * 25 + 1}–${Math.min((currentPage + 1) * 25, customers.length)} of ${customers.length} customers` : "0 customers"}</span>{pageCount > 1 && <div><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div>}</footer>
    </>}
  </section>;
}
