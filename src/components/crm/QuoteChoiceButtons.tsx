"use client";

import { Children, isValidElement, useState, type ReactNode } from "react";
import styles from "./quote-choice-buttons.module.css";

/** Button-based presentation of the same catalog values used by quote selects. */
export function QuoteChoiceButtons({ value, onChange, children, "aria-label": label }: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  "aria-label": string;
}) {
  const [search, setSearch] = useState("");
  const choices = Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ value?: string; children: ReactNode; disabled?: boolean }>(child)) return [];
    const text = Children.toArray(child.props.children).join("");
    return [{ value: String(child.props.value ?? text), label: text, disabled: child.props.disabled }];
  });
  const placeholder = choices.find(choice => choice.value === "" && !choice.label.startsWith("All "));
  const selected = choices.find(choice => choice.value === value && value !== "");
  const searchable = choices.length > 12;
  const visible = choices.filter(choice => !searchable || choice.value === value || choice.label.toLowerCase().includes(search.trim().toLowerCase()));
  return <div className={styles.field}>
    {!value && placeholder && <p className={styles.selected}>{placeholder.label}</p>}
    {searchable && <input type="search" aria-label={`Search ${label}`} placeholder="Search choices…" value={search} onChange={event => setSearch(event.target.value)} className={styles.search} />}
    {searchable && selected && <p className={styles.selected}>Selected: {selected.label}</p>}
    <div role="group" aria-label={label} className={`${styles.choices} ${searchable ? styles.scrollChoices : ""}`}>
      {visible.filter(choice => choice.value !== "" || choice.label.startsWith("All ")).map(choice => <button key={choice.value} type="button" aria-pressed={value === choice.value} disabled={choice.disabled} className={styles.choice} onClick={() => { if (choice.value !== value) onChange(choice.value); }}>
        <span className={styles.mark} aria-hidden="true">{value === choice.value ? "✓" : ""}</span>{choice.label}
      </button>)}
      {!visible.some(choice => choice.value !== "") && <p className={styles.selected}>No choices match your search.</p>}
    </div>
  </div>;
}

export function QuoteAccessoryQuantity({ label, value, onChange, "aria-label": accessibleLabel }: {
  label: string; value: string; onChange: (value: string) => void; "aria-label": string;
}) {
  const count = Number(value || 0);
  const valid = Number.isInteger(count) && count >= 0;
  return <div className={styles.accessory}>
    <span className={styles.accessoryLabel}>{label}</span>
    {count === 0 && valid ? <button type="button" className={styles.add} aria-label={`Add ${label}`} onClick={() => onChange("1")}>+ Add</button> : <div role="group" aria-label={accessibleLabel} className={styles.stepper}>
      <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(String(valid ? Math.max(0, count - 1) : 0))}>−</button>
      <output aria-live="polite" aria-label={`${label} selected quantity`}>{valid ? count : value}</output>
      <button type="button" aria-label={`Increase ${label}`} disabled={!valid} onClick={() => onChange(String(count + 1))}>+</button>
    </div>}
    {!valid && <span role="alert" className={styles.invalid}>Review the saved quantity. Tap − to clear it.</span>}
  </div>;
}
