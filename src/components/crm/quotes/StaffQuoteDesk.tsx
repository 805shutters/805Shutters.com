"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, Check, Circle, Plus, Search } from "lucide-react";
import type { QuoteTableRow } from "@mts/components/crm/quote-builder/QuotesTable";
import { staffNextSteps, staffQuoteAmount, staffQuoteStage, staffQuoteView, staffStageLabels, type StaffQuoteFilter } from "./staff-quote-view";
import styles from "./StaffQuoteDesk.module.css";

type Props = {
  quotes: QuoteTableRow[];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  onOpen: (quote: QuoteTableRow) => void;
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

export function StaffQuoteDesk({ quotes, isLoading, isError, isFetching, onRetry, onOpen, onNewQuote, onNewNormanQuote, onOpenTools }: Props) {
  const [filter, setFilter] = useState<StaffQuoteFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const { counts, matching } = useMemo(() => staffQuoteView(quotes, filter, search), [quotes, filter, search]);
  const pageCount = Math.max(1, Math.ceil(matching.length / 25));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = matching.slice(currentPage * 25, (currentPage + 1) * 25);
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
      <button type="button" onClick={() => changeFilter("sold")}><span>Sold quotes</span><strong>{unavailable ? "—" : counts.sold}</strong><small>Review order handoff <ArrowUpRight size={14} /></small></button>
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
    {isLoading ? <div role="status" className={styles.empty}>Loading quotes…</div> : isError ? <div role="alert" className={styles.empty}><h2>Quote history could not be loaded</h2><p>Retry to see the complete list.</p><button type="button" disabled={isFetching} onClick={onRetry}>{isFetching ? "Retrying…" : "Retry loading quotes"}</button></div> : <>
      <div className={styles.resultsHeader}><h2>{filtered ? staffStageLabels[filter] + " quotes" : "All quotes"}</h2><span>{matching.length} {matching.length === 1 ? "quote" : "quotes"} · {filtered ? "Card view" : "List view"}{isFetching ? " · Refreshing…" : ""}</span></div>
      {!visible.length ? <div role="status" className={styles.empty}>No quotes match this view.<button type="button" onClick={() => { setSearch(""); changeFilter("all"); }}>Show all quotes</button></div> : filtered ? <div className={styles.cards}>
        {visible.map(quote => <article className={styles.card} key={`${quote.source}:${quote.id}`}>
          <div className={styles.cardTop}><small>{quote.quote_number || "Unnumbered quote"}</small><Status quote={quote} /></div>
          <h3>{quote.customer_name || "Customer name unavailable"}</h3><p>{quote.customer_address || "Address unavailable"}</p>
          <strong className={styles.amount}>{staffQuoteAmount(quote)}</strong>
          <div className={styles.steps}><span><span className={styles.check}><Check size={13} /></span> Saved</span><span>{quote.sent_at ? <span className={styles.check}><Check size={13} /></span> : <Circle size={17} />} Sent</span></div>
          <footer><span>{staffNextSteps[staffQuoteStage(quote)]}</span><button type="button" onClick={() => onOpen(quote)} aria-label={`Open quote ${quote.quote_number || quote.id}`}>Open <ArrowUpRight size={15} /></button></footer>
        </article>)}
      </div> : <div className={styles.list} role="table" aria-label="All quotes">
        <div className={`${styles.row} ${styles.columnHead}`} role="row"><span role="columnheader">Customer / quote</span><span role="columnheader">Status</span><span role="columnheader">Quote total</span><span role="columnheader">Next step</span><span role="columnheader">Action</span></div>
        {visible.map(quote => <div className={styles.row} role="row" key={`${quote.source}:${quote.id}`}>
          <div role="cell"><strong>{quote.customer_name || "Customer name unavailable"}</strong><small>{quote.quote_number || "Unnumbered quote"}</small></div>
          <div role="cell"><Status quote={quote} /></div><div role="cell" className={styles.money}>{staffQuoteAmount(quote)}</div><div role="cell" className={styles.next}>{staffNextSteps[staffQuoteStage(quote)]}</div>
          <div role="cell"><button type="button" onClick={() => onOpen(quote)} aria-label={`Open quote ${quote.quote_number || quote.id}`}>Open <ArrowUpRight size={15} /></button></div>
        </div>)}
      </div>}
      <footer className={styles.pagination}><span>{matching.length ? `${currentPage * 25 + 1}–${Math.min((currentPage + 1) * 25, matching.length)} of ${matching.length} quotes` : "0 quotes"}</span>{pageCount > 1 && <div><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div>}</footer>
    </>}
  </section>;
}
