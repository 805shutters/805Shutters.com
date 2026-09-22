"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import styles from "./CalendarAppointmentModal.module.css";

export type AppointmentCustomer = {
  jobId: string; name: string; phone: string; email: string; address: string;
  city: string; productInterest: string; assignedTo: string; leadSource: string;
  notes: string; status: string;
};
type SearchResult = { results: AppointmentCustomer[]; nextCursor: string | null };

export function ExistingAppointmentCustomer({ session, selected, onSelect }: {
  session: Session; selected: AppointmentCustomer | null;
  onSelect: (customer: AppointmentCustomer | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult>({ results: [], nextCursor: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open || query.trim().length < 2) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query.trim() });
        if (cursor) params.set("cursor", cursor);
        const response = await fetch(`/api/crm/calendar/customers/?${params}`, {
          headers: { Authorization: `Bearer ${session.access_token}` }, signal: controller.signal,
        });
        if (!response.ok) throw new Error("Customer search could not load. Please try again.");
        const data = await response.json() as SearchResult;
        if (!controller.signal.aborted) setResult(data);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Customer search failed.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [open, query, cursor, session.access_token]);

  return <section className={styles.customerPicker} aria-label="Existing customer">
    <div className={styles.pickerHeading}>
      <div>{selected ? <><strong>{selected.name}</strong><small>Return visit · linked to existing job</small></> : <span>Booking a return visit?</span>}</div>
      <button type="button" className={styles.customerToggle} aria-expanded={open} onClick={() => setOpen(!open)}>
        {selected ? "Change customer" : "+ Existing customer"}
      </button>
    </div>
    {selected && <button type="button" className={styles.clearCustomer} onClick={() => { onSelect(null); setOpen(false); setQuery(""); setResult({results:[], nextCursor:null}); }}>Clear selection · new customer</button>}
    {open && <div className={styles.searchPanel}>
      <label>Find an existing customer<input type="search" autoFocus value={query} placeholder="Name, phone, email or address" onChange={event => { setQuery(event.target.value); setCursor(null); setResult({results:[], nextCursor:null}); }} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} /></label>
      {query.trim().length < 2 ? <p>Enter at least 2 characters.</p> : loading ? <p role="status">Searching customers…</p> : error ? <p role="alert">{error} <button type="button" onClick={() => setQuery(query + " ")}>Retry</button></p> : <>
        {result.results.length === 0 ? <p role="status">No customers found. Try another search or enter a new customer below.</p> : <ul className={styles.customerResults}>
          {result.results.map(customer => <li key={customer.jobId}><button type="button" onClick={() => { onSelect(customer); setOpen(false); }}>
            <strong>{customer.name}</strong><span>{[customer.address, customer.city].filter(Boolean).join(", ") || "No address saved"}</span>
            <small>{[customer.phone, customer.email, customer.productInterest, customer.status].filter(Boolean).join(" · ")}</small>
          </button></li>)}
        </ul>}
        <div className={styles.searchPages}>
          {cursor && <button type="button" onClick={() => setCursor(null)}>First results</button>}
          {result.nextCursor && <button type="button" onClick={() => setCursor(result.nextCursor)}>More results</button>}
        </div>
      </>}
    </div>}
  </section>;
}
