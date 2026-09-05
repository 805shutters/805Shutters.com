"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { JobTrackingViewItem } from "@/lib/crm/job-tracking-view";
import styles from "./JobTrackingWorkspace.module.css";

export function JobTrackingSearch({ value, matches, onChange, onSelect }: {
  value: string;
  matches: JobTrackingViewItem[];
  onChange: (value: string) => void;
  onSelect: (item: JobTrackingViewItem) => void;
}) {
  const listId = useId();
  const activeOption = useRef<HTMLLIElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const suggestions = matches.slice(0, 8);
  const showing = open && Boolean(value.trim());
  useEffect(() => {
    if (showing) activeOption.current?.scrollIntoView({ block: "nearest" });
  }, [active, showing]);
  const select = (item: JobTrackingViewItem) => {
    onSelect(item);
    setOpen(false);
    setActive(-1);
    input.current?.focus();
  };

  return <div className={styles.searchControl} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
      setActive(-1);
    }
  }}>
    <div className={styles.search}>
      <Search size={17} aria-hidden="true" />
      <input ref={input} role="combobox" aria-label="Search job tracking" aria-autocomplete="list"
        aria-expanded={showing} aria-controls={showing ? listId : undefined}
        aria-activedescendant={showing && suggestions[active] ? `${listId}-${active}` : undefined}
        autoComplete="off" value={value} placeholder="Search customer, phone, quote, vendor or order…"
        onFocus={() => setOpen(true)}
        onChange={(event) => { onChange(event.target.value); setActive(-1); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape") { setOpen(false); setActive(-1); }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActive(current => suggestions.length ? (current + (event.key === "ArrowDown" ? 1 : current < 0 ? 0 : -1) + suggestions.length) % suggestions.length : -1);
          }
          if (event.key === "Enter" && showing && suggestions[active]) {
            event.preventDefault();
            select(suggestions[active]);
          }
        }} />
      {value && <button type="button" aria-label="Clear search" onClick={() => {
        onChange(""); setActive(-1); setOpen(false); input.current?.focus();
      }}><X size={16} /></button>}
    </div>
    {showing && <div className={styles.suggestions}>
      <ul id={listId} role="listbox" aria-label="Matching jobs">
        {suggestions.map((item, index) => <li key={item.id} id={`${listId}-${index}`} role="option"
          ref={active === index ? activeOption : undefined} aria-selected={active === index} onPointerDown={event => event.preventDefault()}
          onClick={() => select(item)} onPointerMove={() => setActive(index)}>
          <strong>{item.customerName}</strong>
          <span>{[item.quote?.quote_number || item.project, item.orderReference || item.address || item.phone].filter(Boolean).join(" · ")}</span>
        </li>)}
      </ul>
      {!suggestions.length && <p role="status">No matches</p>}
    </div>}
  </div>;
}
