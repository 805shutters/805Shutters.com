"use client";

import { useMemo, useRef, useState } from "react";
import { FileText, Search } from "lucide-react";
import type { CrmDashboardData } from "@/lib/crm/types";
import { buildContractLibrary, searchContracts } from "@/lib/crm/contract-library";
import { InlineJobContract } from "./InlineJobContract";
import styles from "./ContractsWorkspace.module.css";

export function ContractsWorkspace({ data, busy }: { data: CrmDashboardData | null; busy: boolean }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const entries = useMemo(() => data ? buildContractLibrary(data) : [], [data]);
  const results = useMemo(() => searchContracts(entries, query), [entries, query]);
  const selected = results.find(entry => entry.id === selectedId);
  return <section className={styles.workspace} aria-labelledby="contracts-heading">
    <h1 id="contracts-heading">Contracts</h1>
    <label className={styles.search}><Search size={19} aria-hidden="true" /><span className={styles.srOnly}>Search contracts by customer name</span><input ref={search} type="search" autoComplete="off" placeholder="Search customer name…" value={query} onChange={event => { setQuery(event.target.value); setSelectedId(null); }} /></label>
    {data?.loadWarnings?.length ? <p className={styles.message} role="status">Some records could not be loaded. Results may be incomplete. {data.loadWarnings.join(" ")}</p> : null}
    {!data ? <p className={styles.message} role="status">{busy ? "Loading contracts…" : "Contracts are unavailable. Refresh to try again."}</p> : selected ? <div className={styles.document}><InlineJobContract key={selected.id} url={selected.url} customerName={selected.customerName} onClose={() => { setSelectedId(null); search.current?.focus(); }} /></div> : <>
      <p className={styles.message} role="status">{!query.trim() ? "Search a customer name to find their contracts." : results.length ? `${results.length} ${results.length === 1 ? "contract" : "contracts"} found` : "No contracts found for that customer."}</p>
      <div className={styles.results}>{results.map(entry => <button type="button" className={styles.result} key={entry.id} disabled={!entry.url} onClick={() => setSelectedId(entry.id)} aria-label={`Open ${entry.title} for ${entry.customerName}`}>
        <FileText size={22} aria-hidden="true" /><span><strong>{entry.customerName}</strong><small>{entry.title}{entry.signedAt && Number.isFinite(Date.parse(entry.signedAt)) ? ` · Signed ${new Intl.DateTimeFormat("en-US", { month:"short", day:"numeric", year:"numeric", timeZone:"America/Los_Angeles" }).format(new Date(entry.signedAt))}` : ""}</small></span><span>{entry.url ? "Open contract →" : "Document unavailable"}</span>
      </button>)}</div>
    </>}
  </section>;
}
