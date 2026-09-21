"use client";
import { useId } from "react";
import styles from "./TemporaryShadeOption.module.css";
export function TemporaryShadeOption({ selected, onChange, disabled = false }: { selected: boolean; onChange: (selected: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return <label className={styles.control} htmlFor={id} title="Complimentary temporary paper shade">
    <input id={id} type="checkbox" checked={selected} disabled={disabled} onChange={event => onChange(event.target.checked)} />
    <span>Temporary shade <small>· Free</small></span>
  </label>;
}
