"use client";
import { useId } from "react";
import styles from "./TemporaryShadeOption.module.css";
export function TemporaryShadeOption({ selected, onChange, disabled = false }: { selected: boolean; onChange: (selected: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return <section className={styles.section} aria-label="Temporary shades">
    <div><h3 className={styles.title}>Temporary shades</h3><p className={styles.description}>Optional privacy coverage while your custom product is being made.</p>
      <label className={styles.control} htmlFor={id}><input id={id} type="checkbox" checked={selected} disabled={disabled} onChange={event => onChange(event.target.checked)} /><span>Complementary temporary paper shade <small>Free</small></span></label>
    </div>
  </section>;
}
